$Out = "Calculator.OpenKneeboardPlugin";
$Zip = "$Out.zip"
if (Test-Path $Out) {
    Remove-Item $Out
}
if (Test-Path $Zip) {
    Remove-Item $Zip
}
Compress-Archive v1.json,*.html,*.js,*.css -DestinationPath $Zip
Rename-Item $Zip $Out