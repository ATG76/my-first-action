[CmdletBinding()]
param(
  [string]$OpenCodeHome = (Join-Path $env:USERPROFILE ".config\opencode"),
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimePackage = Join-Path $OpenCodeHome "package.json"

if (-not (Test-Path (Join-Path $repoRoot "reverse-control\tests\reverse-control.test.mjs"))) {
  throw "Run this script from a complete opencode-reverse-control checkout."
}
if (-not (Test-Path $runtimePackage)) {
  throw "OpenCode runtime package.json was not found at $runtimePackage."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required to verify the source before deployment."
}

Push-Location $repoRoot
try {
  & node --test "reverse-control\tests\reverse-control.test.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Source tests failed; deployment was not attempted." }
} finally {
  Pop-Location
}

$files = @(
  @{ Source = "plugins\reverse-control.js"; Destination = "plugins\reverse-control.js" },
  @{ Source = "commands\reverse-start.md"; Destination = "commands\reverse-start.md" },
  @{ Source = "commands\reverse-close.md"; Destination = "commands\reverse-close.md" }
)

foreach ($file in $files) {
  $source = Join-Path $repoRoot $file.Source
  $destination = Join-Path $OpenCodeHome $file.Destination
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) -WhatIf:$WhatIf | Out-Null
  Copy-Item -Force -Path $source -Destination $destination -WhatIf:$WhatIf
}

$sourceDirectory = Join-Path $repoRoot "reverse-control"
$destinationDirectory = Join-Path $OpenCodeHome "reverse-control"
New-Item -ItemType Directory -Force -Path $destinationDirectory -WhatIf:$WhatIf | Out-Null
Copy-Item -Recurse -Force -Path (Join-Path $sourceDirectory "*") -Destination $destinationDirectory -WhatIf:$WhatIf

$staleRuntimeFiles = @(
  (Join-Path $destinationDirectory "handoff-schema.mjs")
)
foreach ($staleFile in $staleRuntimeFiles) {
  if (Test-Path $staleFile) {
    Remove-Item -Force -Path $staleFile -WhatIf:$WhatIf
  }
}

if (-not $WhatIf) {
  Push-Location $OpenCodeHome
  try {
    & node --input-type=module -e "import('./plugins/reverse-control.js').then(async (module) => { const hooks = await module.default(); if (!hooks.tool.reverse_control) throw new Error('reverse_control tool was not registered'); console.log('Runtime plugin import passed') })"
    if ($LASTEXITCODE -ne 0) { throw "Runtime plugin import failed after deployment." }
  } finally {
    Pop-Location
  }
}

if ($WhatIf) {
  Write-Host "Deployment plan validated. No runtime files were changed."
} else {
  Write-Host "Personal Reverse Assistant deployed to $OpenCodeHome. Restart OpenCode before using /reverse-start."
}
