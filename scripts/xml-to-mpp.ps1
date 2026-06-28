<#
.SYNOPSIS
  Convertit un export XML MS Project (MSPDI) téléchargé depuis CNN-BTPManager-Pro
  en fichier .mpp natif, via Microsoft Project installé sur cette machine.

.DESCRIPTION
  L'application web exporte le planning au format XML MS Project (bouton « MS Project »
  de l'onglet Planning). Le format binaire .mpp ne pouvant pas être écrit côté serveur,
  ce script utilise l'automatisation COM de Microsoft Project (local) pour ouvrir le XML
  et l'enregistrer en .mpp.

.PARAMETER Xml
  Chemin du fichier XML exporté (obligatoire).

.PARAMETER Mpp
  Chemin de sortie .mpp (optionnel ; par défaut, même nom que le XML avec extension .mpp).

.EXAMPLE
  .\xml-to-mpp.ps1 -Xml "$HOME\Downloads\Planning-SAN-2024-001-2026-06-28.xml"
#>
param(
  [Parameter(Mandatory = $true)][string]$Xml,
  [string]$Mpp
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Xml)) {
  Write-Error "Fichier XML introuvable : $Xml"; exit 1
}
$xmlPath = (Resolve-Path -LiteralPath $Xml).Path
if (-not $Mpp) { $Mpp = [System.IO.Path]::ChangeExtension($xmlPath, '.mpp') }

try {
  $app = New-Object -ComObject MSProject.Application
} catch {
  Write-Error "Microsoft Project n'est pas installé ou inaccessible (COM)."; exit 1
}

try {
  $app.Visible = $false
  $app.DisplayAlerts = $false
  $app.FileOpenEx($xmlPath, $false) | Out-Null
  if (Test-Path -LiteralPath $Mpp) { Remove-Item -LiteralPath $Mpp -Force }
  $app.FileSaveAs($Mpp)
  $kb = [math]::Round((Get-Item -LiteralPath $Mpp).Length / 1KB)
  Write-Host "OK - fichier MS Project genere : $Mpp ($kb Ko)"
} catch {
  Write-Error "Echec de la conversion : $($_.Exception.Message)"; exit 1
} finally {
  try { $app.FileCloseEx(0) } catch {}
  try { $app.Quit() } catch {}
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
