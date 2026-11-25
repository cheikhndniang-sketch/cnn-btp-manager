"""
Connecteur de messagerie CSE Immobilier pour Claude (serveur MCP distant).

Expose la boîte IMAP professionnelle (lecture, recherche, brouillons, rangement,
envoi optionnel) à Claude via le protocole MCP en HTTP, protégé par un jeton.

Auteur : Cheikh Ndiobo NIANG
"""

from __future__ import annotations

import base64
import email
import email.utils
import hmac
import html
import imaplib
import io
import logging
import os
import re
import smtplib
import ssl
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.policy import default as default_policy
from typing import Any

import anyio
import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from oauth import FournisseurOAuth

# ---------------------------------------------------------------------------
# Configuration (variables d'environnement, voir .env.exemple)
# ---------------------------------------------------------------------------

def _env(nom: str, defaut: str | None = None, obligatoire: bool = False) -> str:
    val = os.environ.get(nom, defaut)
    if obligatoire and not val:
        raise SystemExit(f"Variable d'environnement manquante : {nom}")
    return val or ""


IMAP_HOTE = _env("IMAP_HOTE", "imap.cseimmobilier.sn")
IMAP_PORT = int(_env("IMAP_PORT", "993"))
IMAP_UTILISATEUR = _env("IMAP_UTILISATEUR", obligatoire=True)
IMAP_MOT_DE_PASSE = _env("IMAP_MOT_DE_PASSE", obligatoire=True)

SMTP_HOTE = _env("SMTP_HOTE", "")
SMTP_PORT = int(_env("SMTP_PORT", "465"))
SMTP_UTILISATEUR = _env("SMTP_UTILISATEUR", IMAP_UTILISATEUR)
SMTP_MOT_DE_PASSE = _env("SMTP_MOT_DE_PASSE", IMAP_MOT_DE_PASSE)
ENVOI_ACTIVE = _env("ENVOI_ACTIVE", "non").lower() in ("oui", "true", "1", "yes")

NOM_EXPEDITEUR = _env("NOM_EXPEDITEUR", "Cheikh Ndiobo NIANG")
JETON = _env("JETON_ACCES", obligatoire=True)
DOMAINE = _env("DOMAINE", "")  # ex. mail.mondomaine.com
PORT_HTTP = int(_env("PORT", "8000"))
# Connexion OAuth : seul mécanisme que claude.ai sait piloter lui-même quand le
# champ « En-têtes de requête » n'est pas disponible sur le compte.
PHRASE_DE_PASSE = _env("PHRASE_DE_PASSE", "")
DOSSIER_DONNEES = _env("DOSSIER_DONNEES", "/donnees")

if len(JETON) < 32:
    raise SystemExit("JETON_ACCES doit contenir au moins 32 caractères.")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("messagerie")

# ---------------------------------------------------------------------------
# Encodage des noms de dossiers IMAP (UTF-7 modifié, RFC 3501)
# ---------------------------------------------------------------------------

def utf7_decoder(nom: str) -> str:
    res, i = [], 0
    while i < len(nom):
        c = nom[i]
        if c == "&":
            j = nom.index("-", i)
            if j == i + 1:
                res.append("&")
            else:
                b64 = nom[i + 1 : j].replace(",", "/")
                b64 += "=" * (-len(b64) % 4)
                res.append(base64.b64decode(b64).decode("utf-16-be"))
            i = j + 1
        else:
            res.append(c)
            i += 1
    return "".join(res)


def utf7_encoder(nom: str) -> str:
    res, tampon = [], []

    def vider():
        if tampon:
            b = "".join(tampon).encode("utf-16-be")
            res.append("&" + base64.b64encode(b).decode().rstrip("=").replace("/", ",") + "-")
            tampon.clear()

    for c in nom:
        if 0x20 <= ord(c) <= 0x7E:
            vider()
            res.append("&-" if c == "&" else c)
        else:
            tampon.append(c)
    vider()
    return "".join(res)


def _citer(nom: str) -> str:
    enc = utf7_encoder(nom)
    return '"' + enc.replace("\\", "\\\\").replace('"', '\\"') + '"'

# ---------------------------------------------------------------------------
# Outils IMAP
# ---------------------------------------------------------------------------

@contextmanager
def connexion_imap():
    ctx = ssl.create_default_context()
    conn = imaplib.IMAP4_SSL(IMAP_HOTE, IMAP_PORT, ssl_context=ctx, timeout=30)
    try:
        conn.login(IMAP_UTILISATEUR, IMAP_MOT_DE_PASSE)
        yield conn
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def _verifier(typ: str, data: Any, action: str):
    if typ != "OK":
        detail = data[0].decode(errors="replace") if data and isinstance(data[0], bytes) else data
        raise RuntimeError(f"Échec IMAP ({action}) : {detail}")


_RE_LISTE = re.compile(rb'\((?P<attrs>[^)]*)\) (?P<sep>"[^"]*"|NIL) (?P<nom>.+)')


def _lister(conn) -> list[dict]:
    typ, data = conn.list()
    _verifier(typ, data, "liste des dossiers")
    dossiers = []
    for ligne in data:
        if not ligne:
            continue
        if isinstance(ligne, tuple):  # nom transmis en littéral
            ligne = ligne[0].rsplit(b" ", 1)[0] + b' "' + ligne[1] + b'"'
        m = _RE_LISTE.match(ligne)
        if not m:
            continue
        nom = m.group("nom").decode(errors="replace").strip()
        if nom.startswith('"') and nom.endswith('"'):
            nom = nom[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        attrs = m.group("attrs").decode(errors="replace")
        dossiers.append({"nom": utf7_decoder(nom), "attributs": attrs})
    return dossiers


def _dossier_special(conn, attribut: str, noms_courants: tuple[str, ...]) -> str | None:
    dossiers = _lister(conn)
    for d in dossiers:
        if attribut.lower() in d["attributs"].lower():
            return d["nom"]
    for d in dossiers:
        if d["nom"].split("/")[-1].split(".")[-1].lower() in noms_courants:
            return d["nom"]
    return None


def _selectionner(conn, dossier: str, lecture_seule: bool = True):
    typ, data = conn.select(_citer(dossier), readonly=lecture_seule)
    _verifier(typ, data, f"ouverture du dossier « {dossier} »")


def _decoder_entete(val: str | None) -> str:
    if not val:
        return ""
    try:
        return str(make_header(decode_header(val)))
    except Exception:
        return val


def _html_en_texte(contenu: str) -> str:
    contenu = re.sub(r"(?is)<(script|style).*?</\1>", "", contenu)
    contenu = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", contenu)
    contenu = re.sub(r"<[^>]+>", "", contenu)
    contenu = html.unescape(contenu)
    contenu = re.sub(r"[ \t\xa0]+", " ", contenu)
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", contenu).strip()


def _corps_texte(msg: EmailMessage) -> str:
    partie = msg.get_body(preferencelist=("plain", "html"))
    if partie is None:
        return ""
    try:
        contenu = partie.get_content()
    except Exception:
        contenu = (partie.get_payload(decode=True) or b"").decode("utf-8", errors="replace")
    if partie.get_content_type() == "text/html":
        contenu = _html_en_texte(contenu)
    return contenu.strip()


def _pieces_jointes(msg: EmailMessage) -> list[EmailMessage]:
    return [p for p in msg.iter_attachments()]


def _date_imap(d: str) -> str:
    """AAAA-MM-JJ -> format IMAP (JJ-Mon-AAAA)."""
    mois = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    dt = datetime.strptime(d, "%Y-%m-%d")
    return f"{dt.day:02d}-{mois[dt.month - 1]}-{dt.year}"


def _resume(conn, uids: list[bytes]) -> list[dict]:
    if not uids:
        return []
    typ, data = conn.uid(
        "FETCH",
        b",".join(uids).decode(),
        "(UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE)])",
    )
    _verifier(typ, data, "lecture des en-têtes")
    res = {}
    for item in data:
        if not isinstance(item, tuple):
            continue
        meta, entetes = item[0].decode(errors="replace"), item[1]
        uid = re.search(r"UID (\d+)", meta)
        drapeaux = re.search(r"FLAGS \(([^)]*)\)", meta)
        interne = re.search(r'INTERNALDATE "([^"]+)"', meta)
        if not uid:
            continue
        m = email.message_from_bytes(entetes, policy=default_policy)
        f = drapeaux.group(1) if drapeaux else ""
        res[uid.group(1)] = {
            "uid": uid.group(1),
            "de": _decoder_entete(m.get("From")),
            "a": _decoder_entete(m.get("To")),
            "objet": _decoder_entete(m.get("Subject")),
            "date": _decoder_entete(m.get("Date")) or (interne.group(1) if interne else ""),
            "lu": "\\Seen" in f,
            "important": "\\Flagged" in f,
        }
    return [res[u.decode()] for u in uids if u.decode() in res]


# --- Fonctions synchrones (exécutées hors de la boucle asynchrone) ---------

def _f_lister_dossiers() -> list[dict]:
    with connexion_imap() as conn:
        dossiers = _lister(conn)
        for d in dossiers:
            if "\\Noselect" in d["attributs"]:
                continue
            typ, data = conn.status(_citer(d["nom"]), "(MESSAGES UNSEEN)")
            if typ == "OK" and data and data[0]:
                s = data[0].decode(errors="replace")
                tot = re.search(r"MESSAGES (\d+)", s)
                nl = re.search(r"UNSEEN (\d+)", s)
                d["total"] = int(tot.group(1)) if tot else None
                d["non_lus"] = int(nl.group(1)) if nl else None
        return dossiers


def _f_rechercher(dossier, texte, expediteur, objet, depuis, jusqu_a, non_lus_seulement, importants_seulement, limite) -> dict:
    crit: list[str] = []
    if depuis:
        crit += ["SINCE", _date_imap(depuis)]
    if jusqu_a:
        fin = datetime.strptime(jusqu_a, "%Y-%m-%d") + timedelta(days=1)
        crit += ["BEFORE", _date_imap(fin.strftime("%Y-%m-%d"))]
    if non_lus_seulement:
        crit.append("UNSEEN")
    if importants_seulement:
        crit.append("FLAGGED")

    # Les termes texte sont envoyés en littéraux UTF-8 (accents pris en charge).
    termes = [(k, v) for k, v in (("FROM", expediteur), ("SUBJECT", objet), ("TEXT", texte)) if v]

    with connexion_imap() as conn:
        _selectionner(conn, dossier)
        uids: set[bytes] | None = None
        if not termes:
            typ, data = conn.uid("SEARCH", *(crit or ["ALL"]))
            _verifier(typ, data, "recherche")
            uids = set(data[0].split())
        else:
            for cle, val in termes:  # une commande par terme : intersection des résultats
                if val.isascii():
                    cite = '"' + val.replace("\\", "\\\\").replace('"', '\\"') + '"'
                    typ, data = conn.uid("SEARCH", *crit, cle, cite)
                else:
                    conn.literal = val.encode("utf-8")
                    typ, data = conn.uid("SEARCH", "CHARSET", "UTF-8", *crit, cle)
                _verifier(typ, data, "recherche")
                trouves = set(data[0].split())
                uids = trouves if uids is None else uids & trouves
        tries = sorted(uids or [], key=lambda u: int(u), reverse=True)
        total = len(tries)
        return {"dossier": dossier, "total_trouves": total, "mails": _resume(conn, tries[:limite])}


def _charger(conn, dossier: str, uid: str, marquer_lu: bool = False) -> EmailMessage:
    _selectionner(conn, dossier, lecture_seule=not marquer_lu)
    champ = "BODY[]" if marquer_lu else "BODY.PEEK[]"
    typ, data = conn.uid("FETCH", uid, f"({champ})")
    _verifier(typ, data, "lecture du mail")
    brut = next((i[1] for i in data if isinstance(i, tuple)), None)
    if brut is None:
        raise RuntimeError(f"Mail introuvable (uid {uid} dans « {dossier} »).")
    return email.message_from_bytes(brut, policy=default_policy)


def _f_lire(dossier, uid, marquer_comme_lu, longueur_max) -> dict:
    with connexion_imap() as conn:
        msg = _charger(conn, dossier, uid, marquer_comme_lu)
    corps = _corps_texte(msg)
    tronque = len(corps) > longueur_max
    pj = []
    for i, p in enumerate(_pieces_jointes(msg)):
        taille = len(p.get_payload(decode=True) or b"")
        pj.append({"index": i, "nom": _decoder_entete(p.get_filename()) or f"piece_{i}",
                   "type": p.get_content_type(), "taille_octets": taille})
    return {
        "uid": uid, "dossier": dossier,
        "de": _decoder_entete(msg.get("From")), "a": _decoder_entete(msg.get("To")),
        "cc": _decoder_entete(msg.get("Cc")), "objet": _decoder_entete(msg.get("Subject")),
        "date": _decoder_entete(msg.get("Date")), "message_id": msg.get("Message-ID", ""),
        "corps": corps[:longueur_max] + ("\n[… texte tronqué]" if tronque else ""),
        "pieces_jointes": pj,
    }


def _f_lire_pj(dossier, uid, index, longueur_max) -> dict:
    with connexion_imap() as conn:
        msg = _charger(conn, dossier, uid)
    pjs = _pieces_jointes(msg)
    if not 0 <= index < len(pjs):
        raise RuntimeError(f"Pièce jointe n° {index} introuvable ({len(pjs)} pièce(s)).")
    p = pjs[index]
    nom = _decoder_entete(p.get_filename()) or f"piece_{index}"
    donnees = p.get_payload(decode=True) or b""
    type_ = p.get_content_type()
    texte = None
    if type_ == "application/pdf" or nom.lower().endswith(".pdf"):
        from pypdf import PdfReader
        lecteur = PdfReader(io.BytesIO(donnees))
        texte = "\n\n".join((pg.extract_text() or "") for pg in lecteur.pages)
    elif nom.lower().endswith(".docx"):
        from docx import Document
        texte = "\n".join(par.text for par in Document(io.BytesIO(donnees)).paragraphs)
    elif nom.lower().endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(donnees), data_only=True, read_only=True)
        lignes = []
        for ws in wb.worksheets:
            lignes.append(f"=== Feuille : {ws.title} ===")
            for row in ws.iter_rows(values_only=True):
                if any(v is not None for v in row):
                    lignes.append(" | ".join("" if v is None else str(v) for v in row))
        texte = "\n".join(lignes)
    elif type_.startswith("text/") or nom.lower().endswith((".txt", ".csv")):
        texte = donnees.decode(p.get_content_charset() or "utf-8", errors="replace")
        if type_ == "text/html":
            texte = _html_en_texte(texte)
    res = {"nom": nom, "type": type_, "taille_octets": len(donnees)}
    if texte is not None:
        res["contenu_texte"] = texte[:longueur_max] + ("\n[… tronqué]" if len(texte) > longueur_max else "")
    else:
        res["remarque"] = "Format non lisible en texte (image, archive…). Seules les informations du fichier sont fournies."
    return res


def _construire(destinataires, objet, corps, cc, reponse_a: EmailMessage | None) -> EmailMessage:
    m = EmailMessage()
    m["From"] = email.utils.formataddr((NOM_EXPEDITEUR, IMAP_UTILISATEUR))
    m["To"] = destinataires
    if cc:
        m["Cc"] = cc
    m["Subject"] = objet
    m["Date"] = email.utils.formatdate(localtime=True)
    m["Message-ID"] = email.utils.make_msgid(domain=IMAP_UTILISATEUR.split("@")[-1])
    if reponse_a is not None and reponse_a.get("Message-ID"):
        mid = reponse_a["Message-ID"]
        m["In-Reply-To"] = mid
        m["References"] = (reponse_a.get("References", "") + " " + mid).strip()
    m.set_content(corps)
    return m


def _f_brouillon(destinataires, objet, corps, cc, reponse_dossier, reponse_uid) -> dict:
    with connexion_imap() as conn:
        orig = _charger(conn, reponse_dossier, reponse_uid) if reponse_uid else None
        msg = _construire(destinataires, objet, corps, cc, orig)
        dossier = _dossier_special(conn, "\\Drafts", ("drafts", "brouillons", "draft"))
        if not dossier:
            raise RuntimeError("Dossier Brouillons introuvable sur le serveur.")
        typ, data = conn.append(_citer(dossier), "(\\Draft \\Seen)",
                                imaplib.Time2Internaldate(time.time()), msg.as_bytes())
        _verifier(typ, data, "enregistrement du brouillon")
    return {"statut": "Brouillon enregistré", "dossier": dossier, "objet": objet,
            "remarque": "Le brouillon apparaît dans Outlook / Mail ; vérifiez-le avant envoi."}


def _f_envoyer(destinataires, objet, corps, cc, reponse_dossier, reponse_uid) -> dict:
    if not ENVOI_ACTIVE or not SMTP_HOTE:
        raise RuntimeError("L'envoi direct est désactivé sur ce connecteur. Utilisez creer_brouillon.")
    with connexion_imap() as conn:
        orig = _charger(conn, reponse_dossier, reponse_uid) if reponse_uid else None
        msg = _construire(destinataires, objet, corps, cc, orig)
        ctx = ssl.create_default_context()
        if SMTP_PORT == 465:
            smtp = smtplib.SMTP_SSL(SMTP_HOTE, SMTP_PORT, context=ctx, timeout=30)
        else:
            smtp = smtplib.SMTP(SMTP_HOTE, SMTP_PORT, timeout=30)
            smtp.starttls(context=ctx)
        with smtp:
            smtp.login(SMTP_UTILISATEUR, SMTP_MOT_DE_PASSE)
            smtp.send_message(msg)
        envoyes = _dossier_special(conn, "\\Sent", ("sent", "envoyés", "sent items", "éléments envoyés"))
        if envoyes:
            conn.append(_citer(envoyes), "(\\Seen)", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
    log.info("Mail envoyé : %s -> %s", objet, destinataires)
    return {"statut": "Mail envoyé", "a": destinataires, "objet": objet, "copie_dans": envoyes}


def _f_marquer(dossier, uid, lu, important) -> dict:
    with connexion_imap() as conn:
        _selectionner(conn, dossier, lecture_seule=False)
        if lu is not None:
            typ, data = conn.uid("STORE", uid, "+FLAGS" if lu else "-FLAGS", "(\\Seen)")
            _verifier(typ, data, "marquage lu/non lu")
        if important is not None:
            typ, data = conn.uid("STORE", uid, "+FLAGS" if important else "-FLAGS", "(\\Flagged)")
            _verifier(typ, data, "marquage important")
    return {"statut": "Mail mis à jour", "uid": uid, "lu": lu, "important": important}


def _f_deplacer(dossier, uid, destination) -> dict:
    with connexion_imap() as conn:
        _selectionner(conn, dossier, lecture_seule=False)
        typ, caps = conn.capability()
        if b"MOVE" in (caps[0] if caps else b""):
            typ, data = conn.uid("MOVE", uid, _citer(destination))
            _verifier(typ, data, "déplacement")
        else:
            typ, data = conn.uid("COPY", uid, _citer(destination))
            _verifier(typ, data, "copie")
            conn.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
            conn.expunge()
    return {"statut": "Mail déplacé", "de": dossier, "vers": destination}

# ---------------------------------------------------------------------------
# Serveur MCP
# ---------------------------------------------------------------------------

securite = TransportSecuritySettings(
    enable_dns_rebinding_protection=bool(DOMAINE),
    allowed_hosts=[DOMAINE, f"{DOMAINE}:443", "localhost:*", "127.0.0.1:*"] if DOMAINE else [],
    allowed_origins=[f"https://{DOMAINE}", "https://claude.ai"] if DOMAINE else [],
)

mcp = FastMCP(
    name="Messagerie CSE Immobilier",
    instructions=(
        "Boîte mail professionnelle de Cheikh Ndiobo NIANG (cheikh.niang@cseimmobilier.sn, "
        "CSE Immobilier). Utiliser rechercher_mails puis lire_mail. Pour répondre, préférer "
        "creer_brouillon ; n'utiliser envoyer_mail qu'après accord explicite de l'utilisateur."
    ),
    host="0.0.0.0",
    port=PORT_HTTP,
    stateless_http=True,
    json_response=True,
    transport_security=securite,
)


async def _exec(fn, *args):
    try:
        return await anyio.to_thread.run_sync(lambda: fn(*args))
    except imaplib.IMAP4.error as e:
        raise RuntimeError(f"Erreur du serveur de messagerie : {e}") from e


@mcp.tool()
async def lister_dossiers() -> dict:
    """Liste les dossiers de la boîte mail avec le nombre total de mails et de non lus."""
    return {"dossiers": await _exec(_f_lister_dossiers)}


@mcp.tool()
async def rechercher_mails(
    dossier: str = "INBOX",
    texte: str = "",
    expediteur: str = "",
    objet: str = "",
    depuis: str = "",
    jusqu_a: str = "",
    non_lus_seulement: bool = False,
    importants_seulement: bool = False,
    limite: int = 20,
) -> dict:
    """Recherche des mails, du plus récent au plus ancien.

    dossier : nom du dossier (INBOX = boîte de réception).
    texte : mot(s) cherchés dans tout le mail. expediteur / objet : filtres ciblés.
    depuis / jusqu_a : dates au format AAAA-MM-JJ (incluses).
    limite : nombre maximum de mails retournés (1 à 100).
    """
    limite = max(1, min(int(limite), 100))
    return await _exec(_f_rechercher, dossier, texte, expediteur, objet, depuis, jusqu_a,
                       non_lus_seulement, importants_seulement, limite)


@mcp.tool()
async def lire_mail(dossier: str, uid: str, marquer_comme_lu: bool = False, longueur_max: int = 20000) -> dict:
    """Lit un mail complet (en-têtes, texte, liste des pièces jointes) à partir de son uid.
    Par défaut le mail n'est PAS marqué comme lu."""
    return await _exec(_f_lire, dossier, str(uid), marquer_comme_lu, int(longueur_max))


@mcp.tool()
async def lire_piece_jointe(dossier: str, uid: str, index: int, longueur_max: int = 50000) -> dict:
    """Extrait le texte d'une pièce jointe (PDF, Word .docx, Excel .xlsx, texte, CSV).
    index : numéro donné par lire_mail."""
    return await _exec(_f_lire_pj, dossier, str(uid), int(index), int(longueur_max))


@mcp.tool()
async def creer_brouillon(
    destinataires: str,
    objet: str,
    corps: str,
    cc: str = "",
    reponse_au_dossier: str = "INBOX",
    reponse_a_uid: str = "",
) -> dict:
    """Enregistre un brouillon dans le dossier Brouillons (rien n'est envoyé).
    destinataires / cc : adresses séparées par des virgules.
    reponse_a_uid : uid du mail auquel on répond (pour garder le fil de discussion)."""
    return await _exec(_f_brouillon, destinataires, objet, corps, cc, reponse_au_dossier, str(reponse_a_uid))


@mcp.tool()
async def envoyer_mail(
    destinataires: str,
    objet: str,
    corps: str,
    cc: str = "",
    reponse_au_dossier: str = "INBOX",
    reponse_a_uid: str = "",
) -> dict:
    """ENVOIE immédiatement un mail. À n'utiliser qu'après accord explicite de l'utilisateur
    sur le texte final. Une copie est rangée dans Éléments envoyés."""
    return await _exec(_f_envoyer, destinataires, objet, corps, cc, reponse_au_dossier, str(reponse_a_uid))


@mcp.tool()
async def marquer_mail(dossier: str, uid: str, lu: bool | None = None, important: bool | None = None) -> dict:
    """Marque un mail comme lu / non lu et/ou important (drapeau)."""
    return await _exec(_f_marquer, dossier, str(uid), lu, important)


@mcp.tool()
async def deplacer_mail(dossier: str, uid: str, destination: str) -> dict:
    """Déplace un mail vers un autre dossier (ex. classement par chantier)."""
    return await _exec(_f_deplacer, dossier, str(uid), destination)

# ---------------------------------------------------------------------------
# Contrôle d'accès par jeton + point de santé
# ---------------------------------------------------------------------------

OAUTH = FournisseurOAuth(DOMAINE, PHRASE_DE_PASSE, DOSSIER_DONNEES)
if OAUTH.actif:
    log.info("Connexion OAuth active sur %s", OAUTH.base)
else:
    log.info("Connexion OAuth inactive (PHRASE_DE_PASSE absente) :"
             " seul le jeton fixe est accepté")


class ControleJeton:
    """Refuse toute requête sans « Authorization: Bearer <JETON_ACCES> »,
    sauf /sante (vérification que le service tourne)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        chemin = scope.get("path") or "/"
        # Parcours OAuth (métadonnées, enregistrement, page de connexion, jetons) :
        # ces chemins précèdent le contrôle, sinon personne ne pourrait se connecter.
        if OAUTH.actif and OAUTH.concerne(chemin):
            return await OAUTH.gerer(scope, receive, send)
        if chemin == "/sante":
            await send({"type": "http.response.start", "status": 200,
                        "headers": [(b"content-type", b"text/plain; charset=utf-8")]})
            return await send({"type": "http.response.body", "body": "ok".encode()})
        entetes = dict(scope.get("headers") or [])
        auth = entetes.get(b"authorization", b"").decode(errors="ignore")
        fourni = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        accepte = bool(fourni) and (
            hmac.compare_digest(fourni.encode(), JETON.encode())
            or (OAUTH.actif and OAUTH.verifier(fourni))
        )
        if not accepte:
            client = (scope.get("client") or ("?",))[0]
            # Motif explicite : permet de diagnostiquer un connecteur mal configuré
            # sans jamais écrire le jeton dans les journaux (seule sa longueur sort).
            if not auth:
                motif = "aucun en-tête Authorization"
            elif not auth.lower().startswith("bearer "):
                motif = "en-tête Authorization sans le préfixe « Bearer »"
            elif len(fourni) == len(JETON):
                motif = "jeton de bonne longueur mais incorrect"
            elif OAUTH.actif:
                motif = (f"jeton de {len(fourni)} caractères inconnu"
                         " (ni jeton fixe, ni jeton OAuth valide)")
            else:
                motif = f"jeton de {len(fourni)} caractères au lieu de {len(JETON)}"
            # Noms des en-têtes reçus (JAMAIS leurs valeurs) : permet de repérer
            # un en-tête d'authentification mal orthographié côté client.
            noms = sorted({c.decode(errors="ignore").lower() for c in entetes})
            log.warning("Accès refusé depuis %s sur %s — %s | en-têtes reçus : %s",
                        client, scope.get("path"), motif, ", ".join(noms) or "aucun")
            # RFC 9728 : le client suit « resource_metadata » pour découvrir où
            # se connecter. C'est ce qui déclenche le parcours OAuth de Claude.
            defi = b'Bearer realm="messagerie"'
            if OAUTH.actif:
                defi += (b', resource_metadata="' + OAUTH.base.encode()
                         + b'/.well-known/oauth-protected-resource"')
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json"),
                                    (b"www-authenticate", defi)]})
            return await send({"type": "http.response.body", "body": b'{"erreur":"non autorise"}'})
        return await self.app(scope, receive, send)


app = ControleJeton(mcp.streamable_http_app())

if __name__ == "__main__":
    log.info("Connecteur Messagerie CSE Immobilier — port %s, envoi %s",
             PORT_HTTP, "activé" if ENVOI_ACTIVE else "désactivé")
    uvicorn.run(app, host="0.0.0.0", port=PORT_HTTP, proxy_headers=True, forwarded_allow_ips="*")
