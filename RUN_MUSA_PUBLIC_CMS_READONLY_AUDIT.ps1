param([string]$BaseUrl = 'http://localhost:3000')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ($BaseUrl -cne 'http://localhost:3000' -and $BaseUrl -cne 'http://127.0.0.1:3000') { throw '[STOP] Only localhost:3000 or 127.0.0.1:3000 are permitted.' }
$slugs=@('home','about','courses','gallery','results','reviews','news-events','materials','academic-calendar','class-routine','projects','contact')
Write-Host '[SCOPE] READ-ONLY public CMS audit. GET only. No Auth, passwords, writes or cloud mutations.'
$fail=0;$totalSections=0;$totalItems=0
foreach($slug in $slugs){
 try {
  $value=Invoke-RestMethod -Uri "$BaseUrl/api/v1/public/site-pages/$slug" -Method GET -TimeoutSec 15 -Headers @{'Cache-Control'='no-cache'}
  if ($value.success -ne $true -or $null -eq $value.data -or $value.data.slug -cne $slug){ throw 'Invalid public response or page not published' }
  $n=@($value.data.sections).Count
  $k=0; foreach($section in @($value.data.sections)){ $k+=@($section.items).Count }
  $totalSections+=$n; $totalItems+=$k
  Write-Host "[PASS] $slug : revision $($value.data.revision) | $n sections | $k items"
 } catch { $fail++;Write-Host "[FAIL] $slug : $($_.Exception.Message)" }
}
try {
 $r=Invoke-RestMethod -Uri "$BaseUrl/api/v1/public/site-navigation" -Method GET -TimeoutSec 15
 if($r.success -ne $true){throw 'Navigation GET unsuccessful'}
 Write-Host '[PASS] Public website navigation GET'
} catch {$fail++;Write-Host "[FAIL] Navigation : $($_.Exception.Message)"}
try {
 $r=Invoke-RestMethod -Uri "$BaseUrl/api/v1/public/site-settings" -Method GET -TimeoutSec 15
 if($r.success -ne $true){throw 'Settings GET unsuccessful'}
 Write-Host '[PASS] Published global settings GET'
} catch {$fail++;Write-Host "[FAIL] Global settings : $($_.Exception.Message)"}
try {
 $r=Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 15
 if([int]$r.StatusCode -ne 200){throw "Homepage HTTP $($r.StatusCode)"}
 Write-Host '[PASS] Server-rendered homepage HTTP 200'
} catch {$fail++;Write-Host "[FAIL] Homepage : $($_.Exception.Message)"}
Write-Host "[TOTAL] Public sections=$totalSections, items=$totalItems, failed checks=$fail"
Write-Host '[NOTE] This proves published READ wiring only. To prove dynamic WRITE, perform an authorized draft->publish->read-back E2E test through Teacher CMS.'
if($fail -gt 0){exit 1}
Write-Host '[PASS] Published read pipeline reachable. No data changed.'
