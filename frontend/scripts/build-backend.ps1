$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$distDir = Join-Path $frontendDir "build\backend-dist"
$workDir = Join-Path $frontendDir "build\backend-work"
$specDir = Join-Path $frontendDir "build\backend-spec"

if (!(Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
New-Item -ItemType Directory -Force -Path $specDir | Out-Null

Push-Location $repoRoot
try {
  py -m pip install --upgrade pip
  py -m pip install -r "$backendDir\requirements-desktop.txt" pyinstaller

  py -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --noconsole `
    --name dreamrt-backend `
    --distpath "$distDir" `
    --workpath "$workDir" `
    --specpath "$specDir" `
    --paths "$backendDir" `
    --collect-all matplotlib `
    --collect-all numpy `
    --collect-all Crypto `
    --hidden-import flask_cors `
    --hidden-import flask `
    --hidden-import werkzeug `
    --add-data "$backendDir\sessions;sessions" `
    --add-data "$backendDir\user;user" `
    --add-data "$backendDir\CommunicationManager;CommunicationManager" `
    "$backendDir\main.py"
}
finally {
  Pop-Location
}
