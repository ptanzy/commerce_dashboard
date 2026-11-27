<#
.SYNOPSIS
  WU-11 release gate: execute existing checks and capture local evidence.
.DESCRIPTION
  Run from any working directory. The script does not install packages,
  modify source files, stage changes, create commits or push anything.
  It writes logs outside the repository (in a dated sibling directory by default).
  Run after extracting the final WU-11 source/test corrections.
#>
[CmdletBinding()]
param(
  [string]$EvidenceDir = '',
  [switch]$SkipPython,
  [switch]$SkipFullData
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $repo 'package.json'))) {
  throw 'Expected package.json one directory above this script. Copy the script to commerce_dashboard\scripts first.'
}

if (-not $EvidenceDir) {
  $parent = Split-Path $repo -Parent
  $stamp = (Get-Date).ToString('yyyyMMdd_HHmmss')
  $EvidenceDir = Join-Path $parent "WU11-release-evidence-$stamp"
}
New-Item -Path $EvidenceDir -ItemType Directory -Force | Out-Null
$EvidenceDir = (Resolve-Path $EvidenceDir).Path
$results = New-Object 'System.Collections.Generic.List[object]'
$npm = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }

function Invoke-ReleaseCheck {
  param(
    [string]$Id,
    [string]$Executable,
    [string[]]$Arguments
  )
  $log = Join-Path $EvidenceDir "$Id.log"
  Write-Host "`n========== $Id ==========" -ForegroundColor Cyan
  Write-Host "$Executable $($Arguments -join ' ')"
  $oldPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $code = -1
  try {
    & $Executable @Arguments 2>&1 | Tee-Object -FilePath $log
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
  } catch {
    $_ | Out-String | Add-Content -Path $log
    Write-Host "Check could not start: $_" -ForegroundColor Red
    $code = -1
  } finally {
    $ErrorActionPreference = $oldPref
  }
  $status = if ($code -eq 0) { 'PASS' } else { 'FAIL' }
  $results.Add([pscustomobject]@{
    Check = $Id
    Status = $status
    ExitCode = $code
    Log = $log
  })
  Write-Host "$Id : $status (exit $code)" -ForegroundColor $(if ($code -eq 0) { 'Green' } else { 'Red' })
}

Push-Location $repo
try {
  Invoke-ReleaseCheck '01_typecheck' $npm @('run', 'typecheck')
  Invoke-ReleaseCheck '02_react_vitest' $npm @('test', '--', '--maxWorkers=1', '--no-file-parallelism')
  Invoke-ReleaseCheck '03_node_regression' $npm @('run', 'test:node')

  if (-not $SkipPython) {
    $venvPython = Join-Path $repo '.venv\Scripts\python.exe'
    $python = if (Test-Path $venvPython) { $venvPython } else { 'python' }
    Invoke-ReleaseCheck '04_python_regression' $python @('-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q')
  } else {
    Write-Host 'Python regression skipped by request; release gate remains incomplete.' -ForegroundColor Yellow
    $results.Add([pscustomobject]@{Check='04_python_regression';Status='SKIPPED';ExitCode='';Log=''})
  }

  Invoke-ReleaseCheck '05_security_static' $npm @('run', 'security:static')
  Invoke-ReleaseCheck '06_production_build' $npm @('run', 'build')

  if (-not $SkipFullData) {
    Invoke-ReleaseCheck '07_full_olist_reconciliation' 'node' @('tests/check_olist.cjs')
    Invoke-ReleaseCheck '08_full_olist_explorer' 'node' @('tests/check_explorer.cjs')
  } else {
    Write-Host 'Full-data reconciliation skipped by request; release gate remains incomplete.' -ForegroundColor Yellow
    $results.Add([pscustomobject]@{Check='07_full_olist_reconciliation';Status='SKIPPED';ExitCode='';Log=''})
    $results.Add([pscustomobject]@{Check='08_full_olist_explorer';Status='SKIPPED';ExitCode='';Log=''})
  }

  Invoke-ReleaseCheck '09_git_diff_check' 'git' @('diff', '--check')
  Invoke-ReleaseCheck '10_git_status' 'git' @('status', '--short')
} finally {
  Pop-Location
}

$csvPath = Join-Path $EvidenceDir 'WU11_RELEASE_GATE_RESULTS.csv'
$results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Host "`nRelease gate summary:" -ForegroundColor Cyan
$results | Format-Table Check, Status, ExitCode -AutoSize
Write-Host "Evidence directory: $EvidenceDir" -ForegroundColor Cyan
Write-Host 'Manual browser tests and staged-file review are separate REQUIRED release gates.' -ForegroundColor Yellow
if ($results | Where-Object { $_.Status -ne 'PASS' }) { exit 1 }
exit 0
