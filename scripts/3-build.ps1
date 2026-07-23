# 3-build.ps1 — Super Volume
# ─────────────────────────────────────────────────────────────────────────
# Empaqueta la extensión en un .zip listo para subir a la Chrome Web Store
# (o para distribuir manualmente). Solo incluye los archivos que la
# extensión necesita en tiempo de ejecución, valida que manifest.json sea
# JSON válido, que todos los iconos declarados existan, y preserva la
# estructura de carpetas (icons/) dentro del zip.
#
# Uso:
#   powershell -File scripts\3-build.ps1
#
# Salida:
#   dist\super-volume-v<version>.zip

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $RootDir 'dist'
$Manifest = Join-Path $RootDir 'manifest.json'

Set-Location $RootDir

# ── 1. Validar manifest.json ────────────────────────────────────────────
if (-not (Test-Path $Manifest)) {
    Write-Error "No se encontró manifest.json en $RootDir"
}

try {
    $ManifestObj = Get-Content $Manifest -Raw | ConvertFrom-Json
} catch {
    Write-Error "manifest.json no es un JSON válido. Corrígelo antes de compilar."
}

$Version = $ManifestObj.version
Write-Output "Versión detectada: $Version"

# La Chrome Web Store rechaza el .zip si "description" supera 132
# caracteres -- validarlo acá evita descubrirlo recién al subir el archivo.
# Si "description" usa un placeholder __MSG_x__ (i18n), la longitud real la
# valida cada messages.json más abajo.
if ($ManifestObj.description -and $ManifestObj.description -notmatch '^__MSG_.+__$' -and $ManifestObj.description.Length -gt 132) {
    Write-Error "manifest.json: 'description' tiene $($ManifestObj.description.Length) caracteres (máx. 132 para la Chrome Web Store)."
}

# Nombrar marcas de plataformas de terceros en textos/capturas de la ficha
# fue justo lo que causó el rechazo por "Spam con palabras clave" (Yellow
# Argon) en otro proyecto -- se busca en manifest.json y en todo lo que sirve
# de fuente para pegar en el Dashboard (store-assets/, README.md, docs/, _locales/).
$BrandPattern = '\bYouTube\b|\bNetflix\b|\bTwitch\b|\bSpotify\b|\bTikTok\b|\bVimeo\b|\bFacebook\b|\bInstagram\b|\bDisney\+|\bAmazon Prime\b|\bHBO\b|\bHulu\b'
$BrandTargets = @($Manifest, 'README.md') + (Get-ChildItem -Recurse -File -Include *.md,*.html,*.json store-assets, docs, _locales -ErrorAction SilentlyContinue).FullName
$BrandHits = Select-String -Path $BrandTargets -Pattern $BrandPattern -ErrorAction SilentlyContinue
if ($BrandHits) {
    Write-Output "Se encontraron nombres de plataformas de terceros (posible 'Spam con palabras clave'):"
    $BrandHits | ForEach-Object { Write-Output "  $($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
    Write-Error "Quitalos o generalizalos (ej: 'plataformas con protección DRM') antes de compilar."
}

# ── 1b. Validar los archivos de idioma (_locales) referenciados por manifest ──
if ($ManifestObj.default_locale) {
    foreach ($lang in @('en', 'es')) {
        $MsgPath = Join-Path $RootDir "_locales/$lang/messages.json"
        if (-not (Test-Path $MsgPath)) {
            Write-Error "Falta _locales/$lang/messages.json (declarado via default_locale/__MSG_ en manifest.json)."
        }
        try {
            $Messages = Get-Content $MsgPath -Raw | ConvertFrom-Json
        } catch {
            Write-Error "_locales/$lang/messages.json no es JSON válido."
        }
        # Cualquier campo del manifest con forma __MSG_key__ debe existir como key en cada idioma.
        foreach ($field in @($ManifestObj.name, $ManifestObj.short_name, $ManifestObj.description)) {
            if ($field -match '^__MSG_(.+)__$') {
                $key = $Matches[1]
                if (-not ($Messages.PSObject.Properties.Name -contains $key)) {
                    Write-Error "_locales/$lang/messages.json no tiene la key '$key' que usa manifest.json (__MSG_${key}__)."
                }
            }
        }
    }
    Write-Output "Archivos _locales/*/messages.json OK"
}

# ── 2. Archivos que forman parte del paquete final ──────────────────────
$Files = @(
    'manifest.json',
    'background.js',
    'content.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    '_locales/en/messages.json',
    '_locales/es/messages.json'
)

$Missing = $false
foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        Write-Output "Falta un archivo requerido: $f"
        $Missing = $true
    }
}
if ($Missing) {
    Write-Error "Compilación cancelada: hay archivos requeridos ausentes."
}

# ── 3. Validar sintaxis de los .js si Node está disponible ──────────────
if (Get-Command node -ErrorAction SilentlyContinue) {
    foreach ($js in @('background.js', 'content.js', 'popup.js')) {
        node --check $js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Error de sintaxis en $js. Corrígelo antes de compilar."
        }
    }
    Write-Output "Sintaxis de los .js OK"
}

# ── 4. Empaquetar (preservando icons/ como carpeta) ──────────────────────
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$ZipPath = Join-Path $DistDir "super-volume-v$Version.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Create')
foreach ($f in $Files) {
    $Full = (Resolve-Path $f).Path
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Zip, $Full, $f, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$Zip.Dispose()

Write-Output ""
Write-Output "======================================================"
Write-Output " Paquete generado: $ZipPath"
Write-Output "======================================================"
$SizeKB = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Output "Tamaño: $SizeKB KB"
Write-Output ""
Write-Output "Contenido:"
[System.IO.Compression.ZipFile]::OpenRead($ZipPath).Entries | ForEach-Object { Write-Output "  $($_.FullName)" }
Write-Output ""
Write-Output "Listo para subir a https://chrome.google.com/webstore/devconsole"
