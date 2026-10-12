<#
.SYNOPSIS
  Sao luu database (tu dien team + so lieu chi phi), giu lai N ban moi nhat.

.DESCRIPTION
  Dung SQLite backup API (qua "npm run db:backup"), an toan ca khi app dang chay,
  roi kiem tra tinh toan ven cua ban sao. Chay duoc bang Task Scheduler (xem README).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\pod-qa\scripts\backup-dictionary.ps1 -BackupDir D:\pod-qa-backup
#>
param(
  [string]$BackupDir = "D:\pod-qa-backup",
  [int]$Keep = 30
)

$ErrorActionPreference = "Stop"
# Messages are ASCII on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.

if ($Keep -lt 1) {
  Write-Host "[backup] LOI: -Keep phai >= 1" -ForegroundColor Red
  exit 1
}

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$target = Join-Path $BackupDir "app-$stamp.db"
Write-Host "[backup] Dang sao luu vao $target"

# npm.cmd, not npm: PowerShell may resolve npm to npm.ps1, which swallows the "--".
& npm.cmd run -s db:backup -- "$target"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[backup] THAT BAI (exit code $LASTEXITCODE)" -ForegroundColor Red
  exit 1
}

$old = Get-ChildItem -Path $BackupDir -Filter "app-*.db" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($file in $old) {
  # Also any SQLite side files, should one ever be left next to a backup.
  foreach ($path in @($file.FullName, "$($file.FullName)-wal", "$($file.FullName)-shm", "$($file.FullName)-journal")) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
  Write-Host "[backup] Da xoa ban cu $($file.Name)"
}
Write-Host "[backup] Xong. Giu $Keep ban moi nhat trong $BackupDir" -ForegroundColor Green
exit 0
