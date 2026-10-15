$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-environment.ps1')
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$executable = Join-Path $projectRoot ".release-build\$version\win-unpacked\ZachsBlockCoding.exe"
$env:ZBC_DATA_DIR = Join-Path $projectRoot ('.zbc-runtime\packaged-test-' + [guid]::NewGuid().ToString('N'))
node (Join-Path $PSScriptRoot 'check-payload.cjs')
if ($LASTEXITCODE) { throw 'Packaged files do not match the source.' }
$process = Start-Process -FilePath $executable -ArgumentList '--packaged-smoke-test','--disable-gpu',"--user-data-dir=`"$env:ZBC_DATA_DIR\userData`"" -WindowStyle Hidden -PassThru
if (!$process.WaitForExit(120000)) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    throw 'Packaged app did not finish its startup test within two minutes.'
}
$result = Get-Content -LiteralPath (Join-Path $env:ZBC_DATA_DIR 'packaged-smoke.json') -Raw | ConvertFrom-Json
if ($process.ExitCode -ne 0 -or !$result.ok) { throw "Packaged startup failed: $($result | ConvertTo-Json -Compress)" }
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.zbc-runtime\packaged-result.json') -Encoding utf8NoBOM
Write-Host "Packaged EXE passed: $($result.version), renderer/blocks initialized, public npm analyzer loaded."
