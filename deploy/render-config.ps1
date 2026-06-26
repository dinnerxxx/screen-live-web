$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root ".env.production"
$GeneratedDir = Join-Path $Root "deploy\generated"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing .env.production. Copy deploy\.env.production.example to .env.production first."
}

New-Item -ItemType Directory -Path $GeneratedDir -Force | Out-Null

Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $index = $line.IndexOf("=")
  if ($index -lt 1) { return }
  $name = $line.Substring(0, $index)
  $value = $line.Substring($index + 1)
  Set-Item -Path "Env:$name" -Value $value
}

function Render-Template($template, $target) {
  $content = Get-Content -LiteralPath $template -Raw
  [regex]::Matches($content, '\$\{([A-Z0-9_]+)\}') | ForEach-Object {
    $name = $_.Groups[1].Value
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($null -eq $value -or $value -eq "") {
      throw "Missing value for $name"
    }
    $content = $content.Replace('$' + "{$name}", $value)
  }
  Set-Content -LiteralPath $target -Value $content -NoNewline -Encoding UTF8
}

Render-Template (Join-Path $Root "deploy\Caddyfile.template") (Join-Path $GeneratedDir "Caddyfile")
Render-Template (Join-Path $Root "deploy\livekit.yaml.template") (Join-Path $GeneratedDir "livekit.yaml")

Write-Host "Generated deploy\generated\Caddyfile"
Write-Host "Generated deploy\generated\livekit.yaml"
