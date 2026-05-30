# 설치된 앱에 변경사항 적용 (관리자 권한 필요)
# 사용법: 관리자 PowerShell에서 실행

$src = "C:\My Projects\.End_projects\markdown-viewer"
$res = "C:\Program Files\Simple Markdown Viewer\resources"
$tmp = "$env:TEMP\mdviewer-asar-patch"

if (-not (Test-Path $res)) {
    Write-Error "설치 경로를 찾을 수 없습니다: $res"
    exit 1
}

# 임시 폴더 정리
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }

Write-Host "[1/4] app.asar 추출 중..."
npx --yes @electron/asar extract "$res\app.asar" $tmp
if ($LASTEXITCODE -ne 0) { Write-Error "추출 실패"; exit 1 }

Write-Host "[2/4] 변경된 파일 복사 중..."
Copy-Item "$src\src\main.js"     "$tmp\src\main.js"     -Force
Copy-Item "$src\src\renderer.js" "$tmp\src\renderer.js" -Force
Copy-Item "$src\src\preload.js"  "$tmp\src\preload.js"  -Force
Copy-Item "$src\src\styles.css"  "$tmp\src\styles.css"  -Force

Write-Host "[3/4] app.asar 재패킹 중..."
$tmpAsar = "$env:TEMP\app-patched.asar"
npx @electron/asar pack $tmp $tmpAsar
if ($LASTEXITCODE -ne 0) { Write-Error "재패킹 실패"; exit 1 }
Copy-Item $tmpAsar "$res\app.asar" -Force
Remove-Item $tmpAsar -Force

Write-Host "[4/4] theme.cfg 업데이트 중..."
Copy-Item "$src\theme.cfg" "$res\theme.cfg" -Force

Remove-Item $tmp -Recurse -Force
Write-Host "완료. 앱을 재시작하면 적용됩니다."
