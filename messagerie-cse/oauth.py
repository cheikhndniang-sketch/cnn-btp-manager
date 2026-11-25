"""Fournisseur OAuth 2.1 minimal pour le connecteur Messagerie CSE Immobilier.

Pourquoi ce module : claude.ai ne propose pas, sur ce compte, le champ
« En-têtes de requête » qui permettrait d'envoyer un jeton fixe. Le seul
mécanisme d'authentification que claude.ai sait piloter lui-même est OAuth.
Cheikh clique « Se connecter », saisit UNE fois sa phrase de passe sur une page
servie par ce serveur, et Claude conserve ensuite un jeton d'accès.

Portée volontairement réduite, parce qu'il s'agit d'une boîte mail :
  - un seul utilisateur, une seule phrase de passe (variable PHRASE_DE_PASSE) ;
  - clients publics uniquement, PKCE S256 obligatoire, aucun secret client ;
  - redirections restreintes à claude.ai et claude.com ;
  - codes d'autorisation à usage unique, valables 5 minutes ;
  - jetons stockés hachés en SHA-256, jamais en clair, dans un volume Docker ;
  - temporisation et blocage après 10 phrases de passe erronées.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import logging
import os
import secrets
import time
from urllib.parse import parse_qs, urlencode

import anyio

log = logging.getLogger("messagerie.oauth")

DUREE_CODE = 300                 # 5 minutes
DUREE_ACCES = 90 * 24 * 3600     # 90 jours
DUREE_RAFRAICHISSEMENT = 365 * 24 * 3600
REDIRECTIONS_AUTORISEES = ("https://claude.ai/", "https://claude.com/")
MAX_ECHECS = 10
FENETRE_ECHECS = 900             # 15 minutes


def _b64(donnees: bytes) -> str:
    return base64.urlsafe_b64encode(donnees).decode().rstrip("=")


def _hacher(valeur: str) -> str:
    return hashlib.sha256(valeur.encode()).hexdigest()


class FournisseurOAuth:
    """Points d'entrée OAuth, branchés devant l'application MCP."""

    CHEMINS = (
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-authorization-server",
        "/.well-known/openid-configuration",
        "/register",
        "/authorize",
        "/token",
    )

    def __init__(self, domaine: str, phrase_de_passe: str, dossier_donnees: str):
        self.base = f"https://{domaine}" if domaine else ""
        self.phrase = phrase_de_passe
        self.fichier = os.path.join(dossier_donnees, "jetons.json") if dossier_donnees else ""
        self.codes: dict[str, dict] = {}
        self.echecs: list[float] = []
        self.jetons = {"acces": {}, "rafraichissement": {}}
        self._charger()

    # ----- activation -----

    @property
    def actif(self) -> bool:
        return bool(self.phrase and self.base and self.fichier)

    def concerne(self, chemin: str) -> bool:
        chemin = chemin.rstrip("/") or "/"
        return any(chemin == c or chemin.startswith(c + "/") for c in self.CHEMINS)

    # ----- persistance -----

    def _charger(self) -> None:
        if not self.fichier or not os.path.exists(self.fichier):
            return
        try:
            with open(self.fichier, encoding="utf-8") as f:
                donnees = json.load(f)
            if isinstance(donnees, dict):
                self.jetons = {
                    "acces": donnees.get("acces") or {},
                    "rafraichissement": donnees.get("rafraichissement") or {},
                }
            log.info("Jetons OAuth chargés : %d accès, %d rafraîchissement",
                     len(self.jetons["acces"]), len(self.jetons["rafraichissement"]))
        except Exception as e:  # fichier corrompu : repartir à vide plutôt que planter
            log.warning("Jetons OAuth illisibles (%s) : on repart à vide", e)

    def _enregistrer(self) -> None:
        if not self.fichier:
            return
        maintenant = time.time()
        for famille in ("acces", "rafraichissement"):
            self.jetons[famille] = {
                h: d for h, d in self.jetons[famille].items() if d.get("expire", 0) > maintenant
            }
        provisoire = self.fichier + ".tmp"
        try:
            with open(provisoire, "w", encoding="utf-8") as f:
                json.dump(self.jetons, f)
            os.replace(provisoire, self.fichier)
            os.chmod(self.fichier, 0o600)
        except Exception as e:
            log.error("Impossible d'écrire les jetons OAuth : %s", e)

    # ----- vérification côté ressource -----

    def verifier(self, jeton: str) -> bool:
        if not jeton:
            return False
        entree = self.jetons["acces"].get(_hacher(jeton))
        return bool(entree and entree.get("expire", 0) > time.time())

    # ----- métadonnées -----

    def _metadonnees_ressource(self) -> dict:
        return {
            "resource": f"{self.base}/mcp",
            "authorization_servers": [self.base],
            "bearer_methods_supported": ["header"],
            "scopes_supported": ["messagerie"],
            "resource_name": "Messagerie CSE Immobilier",
        }

    def _metadonnees_serveur(self) -> dict:
        return {
            "issuer": self.base,
            "authorization_endpoint": f"{self.base}/authorize",
            "token_endpoint": f"{self.base}/token",
            "registration_endpoint": f"{self.base}/register",
            "response_types_supported": ["code"],
            "response_modes_supported": ["query"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"],
            "scopes_supported": ["messagerie"],
        }

    # ----- blocage des essais de phrase de passe -----

    def _bloque(self) -> bool:
        limite = time.time() - FENETRE_ECHECS
        self.echecs = [t for t in self.echecs if t > limite]
        return len(self.echecs) >= MAX_ECHECS

    # ----- page de connexion -----

    def _page(self, params: dict, erreur: str = "") -> bytes:
        caches = "".join(
            '<input type="hidden" name="{0}" value="{1}">'.format(
                html.escape(c), html.escape(params.get(c, "")))
            for c in ("client_id", "redirect_uri", "state", "code_challenge",
                      "code_challenge_method", "scope", "resource")
        )
        bandeau = '<p class="err">{0}</p>'.format(html.escape(erreur)) if erreur else ""
        return PAGE.format(bandeau=bandeau, caches=caches).encode()

    # ----- utilitaires ASGI -----

    @staticmethod
    async def _corps(receive) -> bytes:
        morceaux, encore = b"", True
        while encore:
            message = await receive()
            morceaux += message.get("body", b"") or b""
            encore = message.get("more_body", False)
        return morceaux

    @staticmethod
    async def _repondre(send, statut: int, corps: bytes, type_contenu: str,
                        entetes: list | None = None) -> None:
        tetes = [(b"content-type", type_contenu.encode()), (b"cache-control", b"no-store")]
        tetes += entetes or []
        await send({"type": "http.response.start", "status": statut, "headers": tetes})
        await send({"type": "http.response.body", "body": corps})

    async def _json(self, send, statut: int, donnees: dict) -> None:
        await self._repondre(send, statut, json.dumps(donnees).encode(), "application/json")

    # ----- routage -----

    async def gerer(self, scope, receive, send) -> None:
        chemin = (scope.get("path") or "/").rstrip("/") or "/"
        methode = scope.get("method", "GET")

        if chemin.startswith("/.well-known/oauth-protected-resource"):
            return await self._json(send, 200, self._metadonnees_ressource())
        if chemin.startswith("/.well-known/oauth-authorization-server") or \
           chemin.startswith("/.well-known/openid-configuration"):
            return await self._json(send, 200, self._metadonnees_serveur())

        if chemin == "/register" and methode == "POST":
            return await self._enregistrement(receive, send)
        if chemin == "/authorize":
            if methode == "GET":
                return await self._autorisation_formulaire(scope, send)
            if methode == "POST":
                return await self._autorisation_soumise(receive, send)
        if chemin == "/token" and methode == "POST":
            return await self._jeton(receive, send)

        return await self._json(send, 404, {"error": "not_found"})

    async def _enregistrement(self, receive, send) -> None:
        try:
            demande = json.loads(await self._corps(receive) or b"{}")
        except ValueError:
            demande = {}
        redirections = demande.get("redirect_uris") or []
        for uri in redirections:
            if not str(uri).startswith(REDIRECTIONS_AUTORISEES):
                log.warning("Enregistrement refusé : redirection non autorisée %r", uri)
                return await self._json(send, 400, {
                    "error": "invalid_redirect_uri",
                    "error_description": "Seules les redirections claude.ai et claude.com sont acceptées.",
                })
        client = "claude-" + secrets.token_hex(8)
        log.info("Client OAuth enregistré : %s (redirections : %s)", client, redirections)
        return await self._json(send, 201, {
            "client_id": client,
            "client_id_issued_at": int(time.time()),
            "redirect_uris": redirections,
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "client_name": demande.get("client_name", "Claude"),
        })

    @staticmethod
    def _params_requete(scope) -> dict:
        brut = parse_qs((scope.get("query_string") or b"").decode(errors="ignore"))
        return {c: v[0] for c, v in brut.items() if v}

    def _valider_demande(self, params: dict) -> str:
        if params.get("response_type") not in (None, "code"):
            return "Seul le type de réponse « code » est accepté."
        if not params.get("redirect_uri", "").startswith(REDIRECTIONS_AUTORISEES):
            return "Adresse de redirection non autorisée."
        if not params.get("code_challenge"):
            return "PKCE obligatoire : code_challenge manquant."
        if params.get("code_challenge_method", "S256") != "S256":
            return "PKCE : seule la méthode S256 est acceptée."
        return ""

    async def _autorisation_formulaire(self, scope, send) -> None:
        params = self._params_requete(scope)
        probleme = self._valider_demande(params)
        if probleme:
            log.warning("Demande d'autorisation refusée : %s", probleme)
            return await self._repondre(send, 400, probleme.encode(), "text/plain; charset=utf-8")
        return await self._repondre(send, 200, self._page(params), "text/html; charset=utf-8")

    async def _autorisation_soumise(self, receive, send) -> None:
        brut = parse_qs((await self._corps(receive)).decode(errors="ignore"))
        params = {c: v[0] for c, v in brut.items() if v}
        probleme = self._valider_demande(params)
        if probleme:
            return await self._repondre(send, 400, probleme.encode(), "text/plain; charset=utf-8")

        if self._bloque():
            log.warning("Trop d'essais de phrase de passe : page bloquée")
            return await self._repondre(
                send, 429, self._page(params, "Trop d'essais. Réessayez dans un quart d'heure."),
                "text/html; charset=utf-8")

        await anyio.sleep(0.5)  # ralentit les essais en série
        fournie = params.get("phrase_de_passe", "")
        if not hmac.compare_digest(fournie.encode(), self.phrase.encode()):
            self.echecs.append(time.time())
            log.warning("Phrase de passe incorrecte (%d essai(s) dans le quart d'heure)",
                        len(self.echecs))
            return await self._repondre(send, 401, self._page(params, "Phrase de passe incorrecte."),
                                        "text/html; charset=utf-8")

        self.echecs.clear()
        code = secrets.token_urlsafe(32)
        self.codes[code] = {
            "client_id": params.get("client_id", ""),
            "redirect_uri": params["redirect_uri"],
            "code_challenge": params["code_challenge"],
            "expire": time.time() + DUREE_CODE,
        }
        requete = {"code": code}
        if params.get("state"):
            requete["state"] = params["state"]
        separateur = "&" if "?" in params["redirect_uri"] else "?"
        destination = params["redirect_uri"] + separateur + urlencode(requete)
        log.info("Autorisation accordée, redirection vers le client")
        return await self._repondre(send, 302, b"", "text/plain; charset=utf-8",
                                    [(b"location", destination.encode())])

    def _delivrer(self) -> dict:
        acces, rafraichissement = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        maintenant = time.time()
        self.jetons["acces"][_hacher(acces)] = {
            "cree": maintenant, "expire": maintenant + DUREE_ACCES}
        self.jetons["rafraichissement"][_hacher(rafraichissement)] = {
            "cree": maintenant, "expire": maintenant + DUREE_RAFRAICHISSEMENT}
        self._enregistrer()
        return {
            "access_token": acces,
            "refresh_token": rafraichissement,
            "token_type": "Bearer",
            "expires_in": DUREE_ACCES,
            "scope": "messagerie",
        }

    async def _jeton(self, receive, send) -> None:
        corps = await self._corps(receive)
        try:
            if corps.lstrip().startswith(b"{"):
                params = json.loads(corps)
            else:
                params = {c: v[0] for c, v in
                          parse_qs(corps.decode(errors="ignore")).items() if v}
        except ValueError:
            params = {}
        genre = params.get("grant_type")

        if genre == "authorization_code":
            entree = self.codes.pop(params.get("code", ""), None)   # usage unique
            if not entree or entree["expire"] < time.time():
                log.warning("Échange refusé : code inconnu ou périmé")
                return await self._json(send, 400, {"error": "invalid_grant"})
            if params.get("redirect_uri") and params["redirect_uri"] != entree["redirect_uri"]:
                log.warning("Échange refusé : redirection différente de la demande")
                return await self._json(send, 400, {"error": "invalid_grant"})
            verifieur = params.get("code_verifier", "")
            attendu = _b64(hashlib.sha256(verifieur.encode()).digest())
            if not verifieur or not hmac.compare_digest(attendu, entree["code_challenge"]):
                log.warning("Échange refusé : vérificateur PKCE invalide")
                return await self._json(send, 400, {"error": "invalid_grant"})
            log.info("Jeton d'accès délivré au client %s", entree["client_id"] or "?")
            return await self._json(send, 200, self._delivrer())

        if genre == "refresh_token":
            empreinte = _hacher(params.get("refresh_token", ""))
            entree = self.jetons["rafraichissement"].get(empreinte)
            if not entree or entree.get("expire", 0) < time.time():
                log.warning("Rafraîchissement refusé : jeton inconnu ou périmé")
                return await self._json(send, 400, {"error": "invalid_grant"})
            del self.jetons["rafraichissement"][empreinte]   # rotation
            log.info("Jeton d'accès rafraîchi")
            return await self._json(send, 200, self._delivrer())

        return await self._json(send, 400, {"error": "unsupported_grant_type"})


PAGE = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Messagerie CSE Immobilier</title>
<style>
 :root {{ color-scheme: light dark; }}
 body {{ font-family: system-ui, -apple-system, sans-serif; margin: 0; display: grid;
        place-items: center; min-height: 100vh; background: #f4f4f5; color: #18181b; }}
 form {{ width: min(92vw, 23rem); padding: 1.75rem; border-radius: .75rem; background: #fff;
         box-shadow: 0 1px 3px #0002; box-sizing: border-box; }}
 h1 {{ font-size: 1.1rem; margin: 0 0 .35rem; }}
 p {{ font-size: .875rem; line-height: 1.45; margin: 0 0 1.1rem; opacity: .8; }}
 .err {{ color: #b91c1c; opacity: 1; font-weight: 600; }}
 label {{ display: block; font-size: .8rem; font-weight: 600; margin-bottom: .35rem; }}
 input[type=password] {{ width: 100%; box-sizing: border-box; padding: .6rem .7rem;
   font-size: 1rem; border: 1px solid #d4d4d8; border-radius: .4rem;
   background: inherit; color: inherit; }}
 button {{ width: 100%; margin-top: 1rem; padding: .65rem; font-size: .95rem; font-weight: 600;
   color: #fff; background: #18181b; border: 0; border-radius: .4rem; cursor: pointer; }}
 @media (prefers-color-scheme: dark) {{
   body {{ background: #18181b; color: #f4f4f5; }}
   form {{ background: #27272a; box-shadow: none; }}
   button {{ background: #f4f4f5; color: #18181b; }}
 }}
</style></head>
<body><form method="post" autocomplete="off">
<h1>Messagerie CSE Immobilier</h1>
<p>Claude demande l'accès à la boîte <strong>cheikh.niang@cseimmobilier.sn</strong> :
lecture des mails et des pièces jointes, brouillons, envoi.</p>
{bandeau}
<label for="p">Phrase de passe</label>
<input id="p" type="password" name="phrase_de_passe" required autofocus>
{caches}
<button type="submit">Autoriser Claude</button>
</form></body></html>"""
