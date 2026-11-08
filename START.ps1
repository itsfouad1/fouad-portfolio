$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$nodeVersion = & node -p "Number(process.versions.node.split('.')[0])"
if ([int]$nodeVersion -lt 24) { throw "Node.js 24 or later is required." }
if (-not (Test-Path node_modules)) { & npm install; if ($LASTEXITCODE -ne 0) { throw "Dependency install failed." } }
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
if (-not $env:ADMIN_PASSWORD) {
  $secure = Read-Host "Choose your dashboard password (12+ characters)" -AsSecureString
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
}
if ($env:ADMIN_PASSWORD.Length -lt 12) { throw "Password must contain at least 12 characters." }
Write-Host "Portfolio: http://localhost:4173 | Dashboard: http://localhost:4173/admin"
& npm start
