# Musa Sir: signed JWT local integration harness, local Docker only, without modifying .env.local.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Get-Location).Path
if ((Split-Path $root -Leaf) -ne 'coaching') { throw 'Run from coaching project root.' }
if (!(Test-Path '.\scripts\local-jwt-e2e.mjs' -PathType Leaf)) { throw 'Install the guarded JWT patch first.' }
if (!(Test-Path '.\supabase\config.toml' -PathType Leaf)) { throw 'Local Supabase config is missing.' }
$expected = @{
 'src/server/http/supabase-read-auth.mjs' = '93C63F3A1B7E21CACAC573F910B7E12FC125ED26047E2091E887DD0B06FD60F3'
 'src/server/supabase/rest.ts' = '383CB7BF376496F96452C973C707FC9E1A0F9E4F191D64D6A30DD00BFA27F019'
 'src/server/http/production-mutation-adapter.ts' = 'AD3B3C4B69E5C251658C09C09B9C5286D7F7A9112015538CA1D00FEC704A9D43'
 'scripts/local-jwt-e2e.mjs' = 'DD8611467DB9339468AF1568091A6CBA72AF8F1867BF9826FFDC14D55C42BD52'
}
foreach ($relative in $expected.Keys) {
 $path = Join-Path $root ($relative.Replace('/',[IO.Path]::DirectorySeparatorChar))
 if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $expected[$relative]) { throw "Patch source mismatch: $relative" }
}
$dbs = @(docker ps --filter 'name=supabase_db_' --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $dbs.Count -ne 1 -or $dbs[0] -ne 'supabase_db_coaching') {
 throw 'Expected exactly one running LOCAL Docker DB container named supabase_db_coaching.'
}
# Default local CLI project: --output env (NOT --env, which is for named stacks).
# Suppress native stderr non-terminating error records on Windows PowerShell 5.1,
# but always check the actual command exit status.
$priorEap = $ErrorActionPreference
try {
 $ErrorActionPreference = 'Continue'
 $status = @(& npx.cmd --yes supabase status --output env 2>$null)
 $statusExitCode = $LASTEXITCODE
} finally {
 $ErrorActionPreference = $priorEap
}
if ($statusExitCode -ne 0) { throw 'Local Supabase status failed. Check Docker and run npx --yes supabase status (do not share keys).' }
$config = @{}
foreach ($line in $status) {
 if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
   $value = $Matches[2].Trim().Trim('"').Trim("'")
   $config[$Matches[1]] = $value
 }
}
if ($config['API_URL'] -ne 'http://127.0.0.1:54321') { throw 'Local Supabase API_URL must be http://127.0.0.1:54321; cloud URLs forbidden.' }
$publishable = if ($config.ContainsKey('PUBLISHABLE_KEY')) {$config['PUBLISHABLE_KEY']} else {$config['ANON_KEY']}
$serviceRole = $config['SERVICE_ROLE_KEY']
if (!$publishable -or !$serviceRole -or $serviceRole -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
 throw 'Required LOCAL publishable and legacy service-role keys not returned by Supabase CLI.'
}
# Values are never logged, persisted, or written to .env.local.
$names = @('COACHING_E2E_API_URL','COACHING_E2E_PUBLISHABLE_KEY','COACHING_E2E_SERVICE_ROLE_KEY','COACHING_E2E_DB_CONTAINER')
$prior = @{}
foreach ($n in $names) { $prior[$n] = [Environment]::GetEnvironmentVariable($n,'Process') }
try {
 [Environment]::SetEnvironmentVariable('COACHING_E2E_API_URL','http://127.0.0.1:54321','Process')
 [Environment]::SetEnvironmentVariable('COACHING_E2E_PUBLISHABLE_KEY',$publishable,'Process')
 [Environment]::SetEnvironmentVariable('COACHING_E2E_SERVICE_ROLE_KEY',$serviceRole,'Process')
 [Environment]::SetEnvironmentVariable('COACHING_E2E_DB_CONTAINER','supabase_db_coaching','Process')
 Write-Host '===== LOCAL SIGNED JWT E2E (NO REMOTE CALLS) ====='
 Write-Host 'Local Supabase: 127.0.0.1:54321; dedicated Next.js: 127.0.0.1:3107'
 Write-Host 'This will CREATE and then CLEAN UP temporary users, SQL rows and a test batch in your LOCAL database.'
 & node .\scripts\local-jwt-e2e.mjs
 if ($LASTEXITCODE -ne 0) { throw 'Local signed JWT E2E failed; inspect log for cleanup warnings. No cloud operations were made.' }
} finally {
 foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n,$prior[$n],'Process') }
}
