$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = Join-Path $ProjectRoot "tools"
$InstallDir = Join-Path $ToolsDir "livekit-server"
$ZipPath = Join-Path $ToolsDir "livekit-server-windows-amd64.zip"
$DownloadUrl = "https://github.com/livekit/livekit/releases/download/v1.13.1/livekit_1.13.1_windows_amd64.zip"

New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

Write-Host "Downloading LiveKit Server..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath

Write-Host "Extracting..."
Expand-Archive -LiteralPath $ZipPath -DestinationPath $InstallDir -Force

$exe = Get-ChildItem -LiteralPath $InstallDir -Recurse -Filter "livekit-server.exe" | Select-Object -First 1
if (-not $exe) {
  throw "livekit-server.exe was not found after extracting $ZipPath"
}

if ($exe.FullName -ne (Join-Path $InstallDir "livekit-server.exe")) {
  Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $InstallDir "livekit-server.exe") -Force
}

Write-Host "LiveKit Server installed at $InstallDir"
Write-Host "Run start-livekit-dev.bat to start the media server."
