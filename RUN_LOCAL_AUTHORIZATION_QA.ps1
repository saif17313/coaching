$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlPath = Join-Path $root 'LOCAL_AUTHORIZATION_QA.sql'
$configPath = Join-Path $root 'supabase\config.toml'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Run this from the extracted project-root files; expected supabase/config.toml beside the QA script.'
}
$configText = Get-Content -LiteralPath $configPath -Raw
$projectMatch = [regex]::Match($configText, '(?m)^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$')
if (-not $projectMatch.Success) {
    throw 'Could not find a safe project_id in local supabase/config.toml.'
}
$expectedContainer = 'supabase_db_' + $projectMatch.Groups[1].Value
if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
    throw 'Local QA SQL file missing.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is unavailable.'
}

# Match exactly one running local Supabase DB; never use an external database.
$dbs = @(docker ps --filter 'name=supabase_db_' --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot list local Docker containers.' }
$dbs = @($dbs | Where-Object { $_ -eq $expectedContainer })
if ($dbs.Count -ne 1) {
    throw "Expected running local Docker container $expectedContainer; found $($dbs.Count). No other database will be used."
}

Write-Host '=================================================='
Write-Host 'MUSA SIR — LOCAL AUTHORIZATION QA (ROLLBACK ONLY)'
Write-Host "Docker container: $($dbs[0])"
Write-Host 'Testing local postgres database; NO cloud operations.'
Write-Host '=================================================='

Get-Content -LiteralPath $sqlPath -Raw -Encoding utf8 |
    docker exec -i $dbs[0] psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off
if ($LASTEXITCODE -ne 0) {
    throw "QA FAILED (psql exit code $LASTEXITCODE). PostgreSQL session disconnect rolls back any open transaction."
}
Write-Host '[OK] All checks passed; the SQL transaction was rolled back.'
