$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$registration = Join-Path (Split-Path -Parent $projectRoot) 'RebornUpdateAgent\developer-tools\Reborn.ReleasePublisher\Register-WatchdogApp.ps1'
foreach ($schema in @(1, 2)) {
    $fixture = Join-Path $projectRoot ".zbc-runtime\registry-test-$schema"
    New-Item -ItemType Directory -Force -Path (Join-Path $fixture 'apps'), (Join-Path $fixture 'config') | Out-Null
    Set-Content -LiteralPath (Join-Path $fixture 'apps\UpdaterServer.js') -Value ''
    $registry = Join-Path $fixture 'config\updater-repositories.json'
    @{ schema = $schema; repositories = @{ custom = @{ manifestUrl = 'https://example.test/v1/updates/custom/manifest' }; existing = @{ owner = 'Existing'; repo = 'Existing' } } } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $registry
    $result = & $registration -AppId zachsblockcoding -Repository 'CMGCoderTobias/ZachsBlockCoding' -WatchdogRepository $fixture -PassThru
    if (!$result.changed) { throw 'First registration did not change fixture.' }
    $after = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
    if ($after.schema -ne $schema -or $after.repositories.custom.manifestUrl -ne 'https://example.test/v1/updates/custom/manifest' -or $after.repositories.existing.owner -ne 'Existing' -or $after.repositories.zachsblockcoding.repo -ne 'ZachsBlockCoding') { throw 'Registration changed unrelated settings.' }
    $again = & $registration -AppId zachsblockcoding -Repository 'CMGCoderTobias/ZachsBlockCoding' -WatchdogRepository $fixture -PassThru
    if ($again.changed) { throw 'Repeat registration was not idempotent.' }
    Write-Host "Schema ${schema}: existing routes preserved, GitHub registration added, repeat unchanged."
}
