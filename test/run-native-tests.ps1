param(
    [string]$ApiCapture = '',
    [string]$ApiCaptureEpoch = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'Can MSVC C++ Build Tools de chay kiem thu native.'
}
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw 'Khong tim thay MSVC C++ Build Tools.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath '.pio\libdeps\esp32dev\ArduinoJson\src\ArduinoJson.h')) {
        throw 'Hay chay pio run -e esp32dev truoc de tai ArduinoJson.'
    }
    New-Item -ItemType Directory -Path '.pio\host-tests' -Force | Out-Null
    $compileCommand = 'call "' + $vcvars + '" >nul && cl /nologo /std:c++14 /utf-8 /EHsc /W4 /Iinclude /I.pio/libdeps/esp32dev/ArduinoJson/src test/native/test_main.cpp src/PumpController.cpp src/WeatherParser.cpp /Fe:.pio/host-tests/irrigation-tests.exe /Fo:.pio/host-tests/'
    & $env:ComSpec /d /c $compileCommand
    if ($LASTEXITCODE -ne 0) { throw 'Bien dich kiem thu native that bai.' }
    if ($ApiCapture) {
        & '.\.pio\host-tests\irrigation-tests.exe' $ApiCapture $ApiCaptureEpoch
    } else {
        & '.\.pio\host-tests\irrigation-tests.exe'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Kiem thu native that bai.' }
} finally {
    Pop-Location
}
