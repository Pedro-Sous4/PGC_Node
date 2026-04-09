Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('c:\PGC_Node\requests\d2044184-d4ba-4be3-9d53-880da3ccc3ed\outputs.zip')
foreach ($e in $zip.Entries) {
    Write-Output $e.FullName
}
$zip.Dispose()
