# Build monolithic index.html with all CSS/JS inlined
$outFile = 'd:\MYSPACE\Animation\index.html'

$loaderCSS = Get-Content 'd:\MYSPACE\Animation\component\css\loader.css' -Raw
$cameraCSS = Get-Content 'd:\MYSPACE\Animation\component\css\camera-controls.css' -Raw
$mountUI   = Get-Content 'd:\MYSPACE\Animation\component\mount-ui.js' -Raw
$bundleJS  = Get-Content 'd:\MYSPACE\Animation\component\js\app.bundle.js' -Raw

$html = @"
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bangla Bosoti - 3D Masterplan</title>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <style>
$loaderCSS
$cameraCSS
    </style>
    <link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" as="script">
    <link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js" as="script">
</head>

<body>
    <script>
$mountUI
    </script>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    <script>
$bundleJS
    </script>
</body>

</html>
"@

[System.IO.File]::WriteAllText($outFile, $html, [System.Text.Encoding]::UTF8)
Write-Output "Done! index.html built with $((Get-Content $outFile).Count) lines"
