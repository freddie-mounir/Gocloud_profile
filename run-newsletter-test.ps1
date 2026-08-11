$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:TEST_SUBSCRIBER_EMAIL = 'walid.azhary@gocloudeg.com'
node .\scripts\newsletter-automation.js --send --test-email=$env:TEST_SUBSCRIBER_EMAIL
