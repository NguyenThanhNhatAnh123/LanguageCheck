# Build in a separate release directory before stopping the live application.
# The server's env file and SQLite data are shared; never included in GitHub.
param(
  [Parameter(Mandatory=$true)][string]$SourceDir,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Revision,
  [string]$ServerRoot = 'F:\LanguageCheck',
  [string]$ServiceName = 'PodQA',
  [string]$PublicUrl = 'https://qa.eagleglobal2023.com/login'
)
$ErrorActionPreference = 'Stop'
$setup = Join-Path $ServerRoot '.local-setup'
$nodeDir = Join-Path $setup 'runtime\node-v24.21.0-win-x64'
$serviceParameters = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters"
$env:PATH = "$nodeDir;$env:PATH"
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:CLAUDE_MOCK = ''
$release = Join-Path $setup ("releases\$Revision-$([guid]::NewGuid().ToString('N').Substring(0,8))")
$switched = $false
$stopped = $false
$previous = $null
$backup = $null
$backupReady = $false
function Native([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE)" }
}
function WaitHealthy([string]$Url) {
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -eq 200 -and $response.Content -match 'POD Text QA') { return }
    } catch {}
    Start-Sleep -Seconds 2
  }
  throw "Application health check failed: $Url"
}
try {
  # The dedicated deployment account can control only PodQA. No administrator
  # membership is needed; service/file permissions are provisioned at install.
  Set-Location -LiteralPath $SourceDir
  $actual = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $Revision) { throw 'Checkout does not match verified revision' }
  $previous = (Get-ItemProperty -LiteralPath $serviceParameters -Name AppDirectory).AppDirectory
  if (-not $previous -or -not (Test-Path -LiteralPath $previous)) { throw 'Cannot read current service directory' }
  $envPath = Join-Path $ServerRoot '.env.local'
  $config = @{}
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { $config[$matches[1]]=$matches[2].Trim() }
  }
  foreach ($name in @('ANTHROPIC_API_KEY','CLAUDE_MODEL','APP_USERNAME','APP_PASSWORD_HASH_B64','SESSION_SECRET','SESSION_VERSION')) {
    if (-not $config[$name]) { throw "Missing server setting: $name" }
  }
  if ($config['CLAUDE_MOCK'] -eq '1') { throw 'Production cannot use mock mode' }
  if ($config['DATABASE_PATH'] -and $config['DATABASE_PATH'] -notin @('./data/app.db','data/app.db','.\data\app.db')) { throw 'Expected shared database path ./data/app.db' }
  New-Item -ItemType Directory -Path $release -Force | Out-Null
  $archive = Join-Path $release 'source.zip'
  Native { git archive --format=zip --output=$archive $Revision }
  Expand-Archive -LiteralPath $archive -DestinationPath $release
  Remove-Item -LiteralPath $archive
  # Hard link shares the protected file and future password/session updates.
  New-Item -ItemType HardLink -Path (Join-Path $release '.env.local') -Value $envPath | Out-Null
  New-Item -ItemType Junction -Path (Join-Path $release 'data') -Value (Join-Path $ServerRoot 'data') | Out-Null
  Set-Location -LiteralPath $release
  Native { npm.cmd ci --no-audit --no-fund }
  Native { npm.cmd run build }
  Write-Host "Release built: $Revision"
  # Drain the application before backup/migration; no writes can be lost on rollback.
  Stop-Service -Name $ServiceName
  $stopped = $true
  $backup = Join-Path $setup ("backups\pre-deploy-$Revision-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')).db")
  Native { npm.cmd run -s db:backup -- $backup }
  $backupReady = $true
  Native { npm.cmd run -s db:migrate }
  Set-ItemProperty -LiteralPath $serviceParameters -Name AppDirectory -Value $release
  $switched = $true
  Start-Service -Name $ServiceName
  WaitHealthy 'http://127.0.0.1:3000/login'
  WaitHealthy $PublicUrl
  $lt = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8081/v2/languages' -TimeoutSec 10
  if ($lt.StatusCode -ne 200) { throw 'LanguageTool is unavailable' }
  @{ revision=$Revision; directory=$release; previous=$previous; backup=$backup; deployedUtc=[DateTime]::UtcNow.ToString('o') } |
    ConvertTo-Json | Set-Content (Join-Path $setup 'current-release.json')
  Write-Host "DEPLOY SUCCESS: $Revision; local/public HTTP 200; LanguageTool online"
} catch {
  $failure = $_.Exception.Message
  if ($stopped) {
    try {
      Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
      if ($switched) { Set-ItemProperty -LiteralPath $serviceParameters -Name AppDirectory -Value $previous }
      if ($backupReady -and (Test-Path -LiteralPath $backup)) {
        # Fixed targets inside ServerRoot; the stopped app cannot write to SQLite.
        $db = Join-Path $ServerRoot 'data\app.db'
        foreach ($suffix in @('-wal','-shm')) {
          if (Test-Path -LiteralPath "$db$suffix") { Remove-Item -LiteralPath "$db$suffix" -Force }
        }
        Copy-Item -LiteralPath $backup -Destination $db -Force
      }
      Start-Service -Name $ServiceName
      WaitHealthy 'http://127.0.0.1:3000/login'
      Write-Host 'ROLLBACK SUCCESS: previous app and database restored'
    } catch { Write-Host "ROLLBACK FAILED: $($_.Exception.Message)" }
  }
  Write-Error "DEPLOY FAILED: $failure"
  exit 1
}
