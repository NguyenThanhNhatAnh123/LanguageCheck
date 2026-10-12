<#
.SYNOPSIS
  Cap nhat POD Text QA tren may server:
  kiem tra -> git pull -> dung service -> npm ci -> build -> sao luu DB -> migration -> chay service -> kiem tra.

.DESCRIPTION
  Chay trong PowerShell mo bang quyen Administrator:
    powershell -NoProfile -ExecutionPolicy Bypass -File C:\pod-qa\scripts\deploy.ps1

  Dung lai o buoc dau tien bi loi va bao ro ly do. Moi kiem tra (.env.local, phien ban
  Node/npm, service) chay TRUOC khi dung service, nen loi cau hinh khong lam app bi tat.
  Tu luc dung service den luc chay lai mat khoang 1-3 phut: nen deploy ngoai gio lam viec.

.PARAMETER CheckOnly
  Chi chay buoc kiem tra (quyen, NSSM, service, Node/npm, .env.local) roi dung. Khong dung toi gi.

.PARAMETER SkipPull
  Deploy dung ban code dang co, khong git pull.

.PARAMETER NoService
  Bo qua moi buoc lien quan den service (de chay thu tren may khong co NSSM).
#>
param(
  [string]$ServiceName = "PodQA",
  [string]$BackupDir = "D:\pod-qa-backup",
  [string]$HealthUrl = "http://127.0.0.1:3000/login",
  [switch]$CheckOnly,
  [switch]$SkipPull,
  [switch]$NoService
)

$ErrorActionPreference = "Stop"
# Messages are ASCII on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$script:serviceStopped = $false

function Step([string]$Name) {
  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "DEPLOY THAT BAI: $Message" -ForegroundColor Red
  if ($script:serviceStopped) {
    Write-Host "Service '$ServiceName' DANG DUNG. Sua loi roi chay lai deploy.ps1." -ForegroundColor Yellow
  }
  exit 1
}

# Native commands do not throw on failure in PowerShell 5.1: check the exit code.
function Run([string]$Description, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { Fail "$Description (exit code $LASTEXITCODE)" }
}

# ---------------------------------------------------------------------------------------
# 1. Checks. Nothing is touched yet: a mistake here leaves the running app alone.
# ---------------------------------------------------------------------------------------
Step "Kiem tra truoc khi deploy"

if (-not $NoService) {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail "hay mo PowerShell bang quyen Administrator (can de dung/chay service)."
  }
  if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { Fail "khong tim thay nssm trong PATH." }
  if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    Fail "chua co service '$ServiceName'. Cai theo README, muc 'Cai app thanh service'."
  }
}

$nodeVersion = [version]((& node -v).Trim().TrimStart("v"))
$npmVersion = [version]((& npm.cmd -v).Trim())
if ($nodeVersion -lt [version]"24.0.0") { Fail "Node.js $nodeVersion qua cu, can 24 tro len." }
if ($npmVersion -lt [version]"11.19.0") {
  Fail "npm $npmVersion qua cu, can 11.19 tro len (npm cu bo qua allowScripts va se co bien dich better-sqlite3)."
}
Write-Host "Node $nodeVersion, npm $npmVersion"

$envFile = Join-Path $repo ".env.local"
if (-not (Test-Path $envFile)) { Fail "khong co .env.local trong $repo (copy tu .env.example roi dien vao)." }
$envVars = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $envVars[$Matches[1]] = $Matches[2].Trim() }
}
$required = @("ANTHROPIC_API_KEY", "CLAUDE_MODEL", "APP_USERNAME", "APP_PASSWORD_HASH_B64", "SESSION_SECRET", "SESSION_VERSION")
$missing = @($required | Where-Object { -not $envVars[$_] })
if ($missing.Count -gt 0) { Fail ".env.local thieu gia tri: $($missing -join ', ')" }
if ($envVars["CLAUDE_MOCK"] -eq "1") { Fail ".env.local co CLAUDE_MOCK=1: production khong duoc chay mock. Xoa dong nay." }
Write-Host ".env.local du cac bien bat buoc"

$dbSetting = if ($envVars["DATABASE_PATH"]) { $envVars["DATABASE_PATH"] } else { "./data/app.db" }
$dbPath = if ([System.IO.Path]::IsPathRooted($dbSetting)) { $dbSetting } else { Join-Path $repo $dbSetting }

if ($CheckOnly) {
  Write-Host ""
  Write-Host "KIEM TRA XONG: co the deploy." -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------------------------------
# 2. Code
# ---------------------------------------------------------------------------------------
if (-not $SkipPull) {
  Step "git pull"
  Run "git pull that bai (co sua doi tren may server? xem 'git status')" { git pull --ff-only }
}
$commit = (& git log -1 --format="%h %s")
Write-Host "Ban se deploy: $commit"

# ---------------------------------------------------------------------------------------
# 3. Stop, install, build. npm ci replaces node_modules, so the app must not be running.
# ---------------------------------------------------------------------------------------
if (-not $NoService) {
  Step "Dung service $ServiceName"
  if ((Get-Service -Name $ServiceName).Status -ne "Stopped") {
    Run "khong dung duoc service" { nssm stop $ServiceName }
  }
  $script:serviceStopped = $true
}

Step "npm ci"
Run "npm ci that bai" { npm.cmd ci --no-audit --no-fund }

Step "npm run build"
Run "build that bai" { npm.cmd run build }

# ---------------------------------------------------------------------------------------
# 4. Back up the database, then migrate
# ---------------------------------------------------------------------------------------
Step "Sao luu database truoc khi chay migration"
if (Test-Path $dbPath) {
  Run "sao luu that bai" { & (Join-Path $PSScriptRoot "backup-dictionary.ps1") -BackupDir $BackupDir }
} else {
  Write-Host "Chua co database ($dbPath): lan cai dau tien, bo qua sao luu."
}

Step "Chay migration"
Run "migration that bai (co the khoi phuc ban sao luu, xem README)" { npm.cmd run -s db:migrate }

# ---------------------------------------------------------------------------------------
# 5. Start and check that the app answers
# ---------------------------------------------------------------------------------------
if (-not $NoService) {
  Step "Chay service $ServiceName"
  Run "khong chay duoc service" { nssm start $ServiceName }

  Step "Kiem tra app tai $HealthUrl"
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $HealthUrl
      if ($response.StatusCode -eq 200) { $ok = $true; break }
    } catch {
      # Not up yet.
    }
  }
  if (-not $ok) {
    $log = Join-Path $repo "app.log"
    if (Test-Path $log) {
      Write-Host "30 dong cuoi cua app.log:" -ForegroundColor Yellow
      Get-Content $log -Tail 30
    }
    Fail "app khong tra loi tai $HealthUrl sau 60 giay."
  }
  $script:serviceStopped = $false
}

Write-Host ""
Write-Host "DEPLOY XONG: $commit" -ForegroundColor Green
exit 0
