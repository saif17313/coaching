# Musa Sir: local-only PostgreSQL concurrency smoke test.
# Adds NO patches, migrations, or environment files.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Get-Location).Path
if ((Split-Path $root -Leaf) -ne 'coaching') { throw 'Run this from the coaching project root.' }
if (!(Test-Path '.\supabase\config.toml' -PathType Leaf)) { throw 'Local Supabase config.toml missing.' }
$relative = 'scripts\local-db-concurrency-qa.mjs'
$target = Join-Path $root $relative
if (!(Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing $relative. Extract ZIP into the project root without flattening folders." }
$expected = 'F62C608960DCEDA46099DD330A6E118ACA2ABDB7D0FE3C472D64DCBBDA94F861'
$actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Local concurrency QA script checksum mismatch. Refusing to run.' }
if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^(npipe://|unix://)') {
    throw 'Remote Docker host not permitted for local QA.'
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) { throw 'Node.js not found.' }
& node --check $target
if ($LASTEXITCODE -ne 0) { throw 'Node.js syntax check failed.' }
$dbs = @(docker ps --filter 'name=supabase_db_' --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $dbs.Count -ne 1 -or $dbs[0] -ne 'supabase_db_coaching') {
    throw 'Expected exactly one running LOCAL Supabase DB container: supabase_db_coaching.'
}
$prior = [Environment]::GetEnvironmentVariable('COACHING_DB_CONCURRENCY_LOCAL_ONLY','Process')
try {
    [Environment]::SetEnvironmentVariable('COACHING_DB_CONCURRENCY_LOCAL_ONLY','supabase_db_coaching','Process')
    Write-Host '=================================================='
    Write-Host 'MUSA SIR - LOCAL POSTGRESQL CONCURRENCY QA'
    Write-Host 'Docker only. No cloud calls, no Next.js, no repo source edits.'
    Write-Host 'Creates isolated LOCAL rows and deletes them after the tests.'
    Write-Host 'Please let the test finish; cancelling it may leave local QA rows.'
    Write-Host '=================================================='
    & node $target
    if ($LASTEXITCODE -ne 0) { throw 'Local concurrency QA FAILED. Check output for cleanup warnings.' }
    Write-Host '[OK] Four local concurrency scenarios passed.'
} finally {
    [Environment]::SetEnvironmentVariable('COACHING_DB_CONCURRENCY_LOCAL_ONLY',$prior,'Process')
}
