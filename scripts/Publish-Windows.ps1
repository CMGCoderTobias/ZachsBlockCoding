param([switch]$Publish, [switch]$SkipBuild, [switch]$SkipWatchdogRegistration)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-environment.ps1')
$codingRoot = Split-Path -Parent $projectRoot
$arguments = @{
    Config = Join-Path $codingRoot 'config\zachsblockcoding-release.windows.json'
    SkipBuild = $SkipBuild
    SkipWatchdogRegistration = $SkipWatchdogRegistration
}
if ($Publish) { $arguments.Draft = $false } else { $arguments.PackageOnly = $true }
& (Join-Path $codingRoot 'RebornUpdateAgent\developer-tools\Reborn.ReleasePublisher\Publish-Release.ps1') @arguments
if ($LASTEXITCODE) { throw 'RebornPublisher failed.' }
