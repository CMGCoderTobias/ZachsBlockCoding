param(
    [string]$Version = '',
    [string]$Config = '',
    [string]$AgentRoot = '',
    [string]$AgentArtifactRoot = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-environment.ps1')
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
if (!$Version) { $Version = $package.version }
if ($Version -cne $package.version -or $Version -notmatch '^\d\.\d\.\d$') { throw 'Version must match package.json and the Reborn version format.' }
if (!$Config) { $Config = Join-Path (Split-Path -Parent $projectRoot) 'config\zachsblockcoding-release.windows.json' }
if (!$AgentRoot) { $AgentRoot = Join-Path (Split-Path -Parent $projectRoot) 'RebornUpdateAgent' }
if (!$AgentArtifactRoot) {
    $agentVersion = (Get-Content -LiteralPath (Join-Path $AgentRoot 'VERSION') -Raw).Trim()
    $AgentArtifactRoot = Join-Path $AgentRoot ".release-build\$agentVersion\win-x64"
}
$settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
if ($settings.appId -cne 'zachsblockcoding') { throw 'Wrong publisher configuration.' }
Push-Location $projectRoot
try {
    node scripts/render-brand.cjs
    if ($LASTEXITCODE) { throw 'Brand asset rendering failed.' }
    npm run build
    if ($LASTEXITCODE) { throw 'Renderer build failed.' }
    npm run package:connector
    if ($LASTEXITCODE) { throw 'Connector packaging failed.' }
    node scripts/release-notices.cjs
    if ($LASTEXITCODE) { throw 'License collection failed.' }
    & (Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd') --config electron-builder.cjs --win --x64 --dir --publish never
    if ($LASTEXITCODE) { throw 'Windows packaging failed.' }
    & (Join-Path $PSScriptRoot 'Test-Packaged.ps1')
    $metadata = Join-Path $projectRoot ".release-build\$Version\updater-config"
    New-Item -ItemType Directory -Force -Path $metadata | Out-Null
    $publicKey = Get-Content -LiteralPath (Join-Path $AgentRoot 'keys\release-public.pem') -Raw
    $appConfig = Join-Path $metadata 'app-config.json'
    @{
        schema = 1
        appId = 'zachsblockcoding'
        displayName = 'ZachsBlockCoding'
        currentVersion = $Version
        manifestUrl = "$($settings.updaterBaseUrl.TrimEnd('/'))/v1/updates/zachsblockcoding/manifest"
        publicKeyPem = $publicKey
        channel = $settings.channel
        installRoot = '.'
        executable = 'ZachsBlockCoding.exe'
        autoDownload = $true
        installOnNextLaunch = $true
        windowsUninstall = @{
            registryKey = 'RebornEntertainment.ZachsBlockCoding'
            publisher = 'Reborn Entertainment'
            shortcuts = @(@{ location = 'startMenu'; relativePath = 'Programs/ZachsBlockCoding.lnk' })
        }
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $appConfig -Encoding utf8NoBOM
    $bootstrapConfig = Join-Path $metadata 'agent-bootstrap.json'
    Copy-Item -LiteralPath (Join-Path $AgentRoot 'examples\agent-bootstrap.json') -Destination $bootstrapConfig -Force
    $launcherConfig = Join-Path $metadata 'reborn-launch.json'
    @{ schema = 1; appId = 'zachsblockcoding'; displayName = 'ZachsBlockCoding'; fallbackExecutable = 'ZachsBlockCoding.exe' } |
        ConvertTo-Json | Set-Content -LiteralPath $launcherConfig -Encoding utf8NoBOM
    $setup = Join-Path $projectRoot "release-output\$Version\ZachsBlockCoding-$Version-Setup.exe"
    & (Join-Path $AgentRoot 'scripts\New-RebornAppInstaller.ps1') -AppId 'zachsblockcoding' -DisplayName 'ZachsBlockCoding' -AppVersion $Version -InstallDirectoryName 'ZachsBlockCoding' -AppConfig $appConfig -BootstrapConfig $bootstrapConfig -LauncherConfig $launcherConfig -InstalledLauncherName 'RebornAppLauncher.exe' -OutputPath $setup -ArtifactRoot $AgentArtifactRoot
    if ($LASTEXITCODE) { throw 'Reborn installer creation failed.' }
    $test = Start-Process -FilePath $setup -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
    if ($test.ExitCode) { throw 'Installer embedded bundle self-test failed.' }
    Write-Host "Runnable app: $projectRoot\.release-build\$Version\win-unpacked\ZachsBlockCoding.exe"
    Write-Host "Web setup: $setup (requires a published and routed feed)"
} finally { Pop-Location }
