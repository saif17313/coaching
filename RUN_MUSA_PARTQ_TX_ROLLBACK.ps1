$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

param(
    [switch]$RunRollbackProof
)

if (-not $RunRollbackProof) {
    throw 'Use -RunRollbackProof to run the local rollback-only transaction proof.'
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root 'scripts\local-partq-transaction-proof.mjs'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw 'Missing scripts/local-partq-transaction-proof.mjs in project root.'
}

$prior = [Environment]::GetEnvironmentVariable('MUSA_PARTQ_TX_PROOF', 'Process')
try {
    [Environment]::SetEnvironmentVariable('MUSA_PARTQ_TX_PROOF', 'LOCAL_ROLLBACK_ONLY', 'Process')
    & node $target
    if ($LASTEXITCODE -ne 0) {
        throw "Rollback proof failed (exit code $LASTEXITCODE)."
    }
    Write-Host '[PASS] Local rollback-only transaction proof completed.'
} finally {
    [Environment]::SetEnvironmentVariable('MUSA_PARTQ_TX_PROOF', $prior, 'Process')
}
