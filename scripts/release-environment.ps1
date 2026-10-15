$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot '.zbc-runtime'
$locations = @{
    TEMP = 'temp'
    TMP = 'temp'
    npm_config_cache = 'npm-cache'
    ELECTRON_CACHE = 'electron-cache'
    ELECTRON_BUILDER_CACHE = 'builder-cache'
    DOTNET_CLI_HOME = 'dotnet-home'
    NUGET_PACKAGES = 'nuget-packages'
    NUGET_HTTP_CACHE_PATH = 'nuget-http-cache'
    DOTNET_BUNDLE_EXTRACT_BASE_DIR = 'dotnet-bundles'
}
foreach ($name in $locations.Keys) {
    $directory = Join-Path $cacheRoot $locations[$name]
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    [Environment]::SetEnvironmentVariable($name, $directory, 'Process')
}
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
