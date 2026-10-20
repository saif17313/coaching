# EduCentre — explicitly authorized, LOCAL-ONLY write session launcher.
# Does not modify .env.local, source files, Git, or databases.
param([switch]$Start)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$required = @('package.json','docs\BACKEND_MASTER_PLAN.md','.env.local',
 'src\server\http\production-cms-core.ts',
 'src\server\http\production-cms-media.ts',
 'src\server\http\production-cms-settings-navigation.ts')
foreach($rel in $required) {
 $path = Join-Path $repo $rel
 if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "[STOP] Missing required project file: $rel" }
}
$envPath = Join-Path $repo '.env.local'
$lines = [System.IO.File]::ReadAllLines($envPath)
function Read-Setting([string]$key) {
 $matchesFound = @()
 foreach($line in $lines) {
  if($line -match ('^\s*'+[regex]::Escape($key)+'\s*=\s*(.*?)\s*$')) {
   $raw=$Matches[1].Trim()
   if($raw.Length -ge 2 -and (($raw.StartsWith('"') -and $raw.EndsWith('"')) -or ($raw.StartsWith("'") -and $raw.EndsWith("'")))) { $raw=$raw.Substring(1,$raw.Length-2) }
   $matchesFound+=,$raw
  }
 }
 if($matchesFound.Count -ne 1) { throw "[STOP] Expected exactly one $key entry in .env.local" }
 return [string]$matchesFound[0]
}
$root=Read-Setting 'SUPABASE_URL'
if($root.TrimEnd('/') -cne 'https://rkpwqgwceekuvlizfpeb.supabase.co') { throw '[STOP] Supabase URL is not the reviewed EduCentre Hosted DEV project.' }
$key=Read-Setting 'SUPABASE_ANON_KEY'
if($key.Length -lt 20 -or $key.Length -gt 4096 -or $key -match '[\s\x00-\x1f]') { throw '[STOP] Invalid or absent Supabase anon/publishable key in .env.local.' }
foreach($rel in @('src\server\http\production-cms-core.ts','src\server\http\production-cms-media.ts','src\server\http\production-cms-settings-navigation.ts')) {
 $src=[System.IO.File]::ReadAllText((Join-Path $repo $rel))
 if(-not $src.Contains('COACHING_ENABLE_MUTATION_APIS') -or -not $src.Contains('enabled-after-db-verification')) {
  throw "[STOP] Reviewed write-gate protection is missing/modified in: $rel"
 }
}
if(-not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue)) { throw '[STOP] npm.cmd is unavailable in PATH.' }
Write-Host '[PASS] Exact Hosted DEV target and mandatory write gates verified' -ForegroundColor Green
Write-Host '[PASS] No environment file, source code or cloud changes made'
Write-Host '[NOTE] Production deployment should use reviewed authentication, RLS and scoped authorization; this script is DEV only.'
if(-not $Start) {
 Write-Host '[DRY RUN PASS] No write switch activated. To start the local DEV write session, run -Start.' -ForegroundColor Green
 return
}
$listener = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
if($listener.Count -gt 0) { throw '[STOP] Port 3000 is already in use. Stop old npm run dev (Ctrl+C) first. Never use a second server/port.' }
Write-Host ''
Write-Host '[WARNING] This enables the EXISTING mutation gate for the currently running local Next.js process only.' -ForegroundColor Yellow
Write-Host 'All existing per-user JWT, active account checks, RLS and audited RPCs remain required.' -ForegroundColor Yellow
Write-Host 'It does NOT create users/content or perform any database write by itself.'
Write-Host 'Do not run in production or expose port 3000 publicly.' -ForegroundColor Yellow
$confirm=Read-Host 'Type START EDUCENTRE DEV WRITES to continue'
if($confirm -cne 'START EDUCENTRE DEV WRITES') { throw '[CANCELLED] Write session not started.' }
$keys=@('SUPABASE_URL','SUPABASE_ANON_KEY','COACHING_ENABLE_MUTATION_APIS')
$previous=@{}
foreach($k in $keys) {
 $previous[$k]=[System.Environment]::GetEnvironmentVariable($k,'Process')
 [System.Environment]::SetEnvironmentVariable($k,$null,'Process')
}
try {
 [System.Environment]::SetEnvironmentVariable('COACHING_ENABLE_MUTATION_APIS','enabled-after-db-verification','Process')
 Write-Host '[START] npm run dev on localhost:3000. Leave this window running while editing the CMS.' -ForegroundColor Green
 Write-Host '[STOP] Press Ctrl+C after your write tests, then reopen a normal read-only terminal.'
 & npm.cmd run dev -- --hostname localhost --port 3000
 if($LASTEXITCODE -ne 0) { throw "[STOP] npm dev server terminated with code $LASTEXITCODE" }
}
finally {
 foreach($k in $keys) { [System.Environment]::SetEnvironmentVariable($k,$previous[$k],'Process') }
 Write-Host '[CLOSED] Write-session environment variables restored in launcher process.'
}
