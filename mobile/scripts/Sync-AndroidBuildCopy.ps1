[CmdletBinding()]
param(
    # Keep the original App-Dev repository as the source of truth. This path
    # must be physically short because Android CMake resolves virtual drives.
    [string]$BuildRoot = 'C:\Users\jttra\LibraryApp\App-Dev',

    # Reinstall the copied mobile dependencies and regenerate Android files.
    # Use this for the first build copy or after dependency/app.json changes.
    [switch]$PrepareAndroid
)

$ErrorActionPreference = 'Stop'

$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path.TrimEnd('\')
$destinationRoot = [System.IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
$sourceMobileRoot = Join-Path $sourceRoot 'mobile'
$destinationMobileRoot = Join-Path $destinationRoot 'mobile'

if ([string]::Equals($sourceRoot, $destinationRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The Android build copy cannot be the same folder as the source project.'
}

if ($destinationRoot.StartsWith("$sourceRoot\\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The Android build copy must be outside the source project folder.'
}

if ($destinationRoot.Length -gt 55) {
    Write-Warning "The build path is $($destinationRoot.Length) characters long. Use a shorter physical path if Android CMake reports object-path warnings."
}

if (Test-Path -LiteralPath $destinationRoot) {
    $hasMobileProject = Test-Path -LiteralPath (Join-Path $destinationRoot 'mobile\package.json')
    $hasFiles = (Get-ChildItem -LiteralPath $destinationRoot -Force | Select-Object -First 1) -ne $null

    if ($hasFiles -and -not $hasMobileProject) {
        throw "Refusing to sync into a non-project folder: $destinationRoot"
    }
} else {
    New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
}

$excludedDirectories = @(
    (Join-Path $sourceMobileRoot 'node_modules'),
    (Join-Path $sourceMobileRoot '.cxx'),
    (Join-Path $sourceMobileRoot 'dist'),
    (Join-Path $sourceMobileRoot '.expo'),
    (Join-Path $sourceMobileRoot '.idea'),
    (Join-Path $sourceMobileRoot '.npm-cache'),
    (Join-Path $sourceMobileRoot 'android\.gradle'),
    (Join-Path $sourceMobileRoot 'android\.cxx'),
    (Join-Path $sourceMobileRoot 'android\.idea'),
    (Join-Path $sourceMobileRoot 'android\.kotlin'),
    (Join-Path $sourceMobileRoot 'android\build'),
    (Join-Path $sourceMobileRoot 'android\app\.cxx'),
    (Join-Path $sourceMobileRoot 'android\app\build')
)
$excludedFiles = @(
    (Join-Path $sourceMobileRoot 'android\local.properties'),
    '*firebase-adminsdk*.json',
    '*service-account*.json'
)

Write-Host "Syncing mobile source to $destinationMobileRoot"
# Do not pipe robocopy through another cmdlet: PowerShell would replace
# $LASTEXITCODE with the pipeline command's status and could falsely report a
# failed copy as successful.
& robocopy $sourceMobileRoot $destinationMobileRoot /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XD $excludedDirectories /XF $excludedFiles
$robocopyExitCode = $LASTEXITCODE

if ($robocopyExitCode -gt 7) {
    throw "robocopy failed with exit code $robocopyExitCode. The source project was not changed."
}

Write-Host "Source sync complete (robocopy exit code $robocopyExitCode)."

# Normal sync also needs the Firebase client config in the native app module.
# The service-account private key belongs in EAS credentials, never in the APK.
$googleConfigPath = Join-Path $sourceMobileRoot 'google-services.json'
if (Test-Path -LiteralPath $googleConfigPath) {
    $expoConfig = Get-Content -LiteralPath (Join-Path $sourceMobileRoot 'app.json') -Raw | ConvertFrom-Json
    $googleConfig = Get-Content -LiteralPath $googleConfigPath -Raw | ConvertFrom-Json
    $firebasePackages = @($googleConfig.client | ForEach-Object { $_.client_info.android_client_info.package_name })
    if ($expoConfig.expo.android.package -notin $firebasePackages) {
        throw 'Firebase configuration does not match the Android package in app.json.'
    }
    $nativeAppRoot = Join-Path $destinationMobileRoot 'android\app'
    if (Test-Path -LiteralPath $nativeAppRoot) {
        Copy-Item -LiteralPath $googleConfigPath -Destination (Join-Path $nativeAppRoot 'google-services.json') -Force
    }
} else {
    throw 'Missing mobile/google-services.json. Restore the Firebase client configuration before building.'
}

if ($PrepareAndroid) {
    Push-Location $destinationMobileRoot
    try {
        Write-Host 'Installing the copied mobile dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed in the Android build copy (exit code $LASTEXITCODE). Close Android Studio and any Gradle build using the copy, then run this script again."
        }

        Write-Host 'Regenerating the copied Android project...'
        & npx.cmd expo prebuild --platform android --clean
        if ($LASTEXITCODE -ne 0) {
            throw "Expo prebuild failed in the Android build copy (exit code $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }

    # Expo prebuild recreates android/app and removes local signing assets.
    # Restore them only in the short, local build copy so a release APK keeps
    # the same signing identity as earlier installed versions of the app.
    $sourceKeystoreProperties = Join-Path $sourceMobileRoot 'android\keystore.properties'
    $sourceLocalProperties = Join-Path $sourceMobileRoot 'android\local.properties'
    $destinationAndroidRoot = Join-Path $destinationMobileRoot 'android'
    $destinationAppRoot = Join-Path $destinationAndroidRoot 'app'

    # The SDK path is intentionally machine-local and excluded from robocopy,
    # but both source and short build copy run on this same computer.
    if (Test-Path -LiteralPath $sourceLocalProperties) {
        Copy-Item -LiteralPath $sourceLocalProperties -Destination (Join-Path $destinationAndroidRoot 'local.properties') -Force
    } else {
        Write-Warning 'No source local.properties was found. Configure android/local.properties with your Android SDK path before building.'
    }

    if (Test-Path -LiteralPath $sourceKeystoreProperties) {
        Copy-Item -LiteralPath $sourceKeystoreProperties -Destination (Join-Path $destinationAndroidRoot 'keystore.properties') -Force

        Get-ChildItem -LiteralPath (Join-Path $sourceMobileRoot 'android\app') -File |
            Where-Object { $_.Extension -in @('.jks', '.keystore') } |
            ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destinationAppRoot $_.Name) -Force
            }

        # Reapply local release signing without removing Expo's generated
        # Google Services plugin required by Firebase Cloud Messaging.
        $destinationAppBuildGradle = Join-Path $destinationAppRoot 'build.gradle'
        # Expo-generated Gradle files may use LF while Windows here-strings use
        # CRLF. Normalize both sides before matching the signing snippets.
        $gradle = [regex]::Replace((Get-Content -LiteralPath $destinationAppBuildGradle -Raw), '\r\n?', "`n")

        if ($gradle -notmatch 'releaseKeystorePropertiesFile') {
            $projectRootLine = 'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()'
            $keystoreSetup = @'

// Local-only release signing for distributable APKs. This references files
// ignored by Git and restored only in the local Android build copy.
def releaseKeystorePropertiesFile = rootProject.file('keystore.properties')
def releaseKeystoreProperties = new Properties()
if (releaseKeystorePropertiesFile.exists()) {
    releaseKeystoreProperties.load(new FileInputStream(releaseKeystorePropertiesFile))
}
'@
            if (-not $gradle.Contains($projectRootLine)) {
                throw 'Could not restore Android release signing: the Gradle project-root marker changed.'
            }
            $gradle = $gradle.Replace($projectRootLine, "$projectRootLine$keystoreSetup")

            $debugSigningConfig = @'
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
'@
            $debugSigningConfig = [regex]::Replace($debugSigningConfig, '\r\n?', "`n")
            $releaseSigningConfig = @'
        release {
            if (releaseKeystorePropertiesFile.exists()) {
                storeFile rootProject.file(releaseKeystoreProperties['storeFile'])
                storePassword releaseKeystoreProperties['storePassword']
                keyAlias releaseKeystoreProperties['keyAlias']
                keyPassword releaseKeystoreProperties['keyPassword']
            }
        }
'@
            $releaseSigningConfig = [regex]::Replace($releaseSigningConfig, '\r\n?', "`n")
            if (-not $gradle.Contains($debugSigningConfig)) {
                throw 'Could not restore Android release signing: the debug signing block changed.'
            }
            # Here-strings do not guarantee a final line break before the
            # next interpolated value, so add one explicitly. Without this,
            # Gradle reads `}        release {` as a nested method call.
            $gradle = $gradle.Replace(
                $debugSigningConfig,
                "$debugSigningConfig$([Environment]::NewLine)$releaseSigningConfig"
            )

            $defaultReleaseSigning = @'
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
'@
            $defaultReleaseSigning = [regex]::Replace($defaultReleaseSigning, '\r\n?', "`n")
            $localReleaseSigning = @'
            if (releaseKeystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            } else {
                signingConfig signingConfigs.debug
            }
'@
            $localReleaseSigning = [regex]::Replace($localReleaseSigning, '\r\n?', "`n")
            if (-not $gradle.Contains($defaultReleaseSigning)) {
                throw 'Could not restore Android release signing: the release signing block changed.'
            }
            $gradle = $gradle.Replace($defaultReleaseSigning, $localReleaseSigning)
            $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($destinationAppBuildGradle, $gradle, $utf8WithoutBom)
        }
    } else {
        Write-Warning 'No local keystore.properties was found. The release APK will use Android debug signing unless EAS Build manages its credentials.'
    }

    Write-Host "Android build copy is ready: $(Join-Path $destinationMobileRoot 'android')"
}
