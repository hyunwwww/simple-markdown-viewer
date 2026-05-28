# Simple Markdown Viewer

설치형 데스크톱 Markdown 뷰어 초안입니다.

## 기능

- Markdown 파일 가져오기
- Windows 탐색기에서 Markdown 파일을 바로 열기
- `Ctrl+F` 미리보기 전용 검색과 결과 이동
- 편집창과 미리보기 창 사이 드래그 크기 조절
- `F4` 또는 Outline 버튼으로 문서 인덱스 열기
- `Ctrl+S`로 현재 문서 저장
- 현재 문서 Markdown, HTML 또는 PDF 내보내기
- Markdown 원문 복사
- 다크 모드와 라이트 모드 전환
- Electron `contextIsolation` 기반의 파일 접근 분리
- Notion 계열 UI에 가까운 Inter + 한글용 Noto Sans KR 로컬 번들 폰트

## 실행

```powershell
npm install
npm start
```

## 정적 검증

```powershell
npm run check
```

## Windows 설치 파일 생성

```powershell
npm run dist
```

생성물은 `dist/` 폴더에 만들어집니다.

설치 후 `.md` 또는 `.markdown` 파일을 이 앱으로 연결하면 Windows 탐색기에서 파일을 바로 열 수 있습니다.

## 테마 설정

앱 시작 시 `theme.cfg`를 읽어 라이트/다크 모드 색상을 주입합니다.

- 개발 실행: 프로젝트 루트의 `theme.cfg`
- 설치본/포터블 실행: 실행 파일 옆의 `theme.cfg`
- 폴백: 패키지 리소스의 `resources/theme.cfg`

`npm run dist`는 포터블 실행 파일과 같은 `dist/` 폴더에 `theme.cfg`도 복사합니다. `theme.cfg`를 수정한 뒤 앱을 다시 시작하면 변경된 색상이 적용됩니다.

현재 생성된 설치 파일:

```text
dist/Simple Markdown Viewer Setup 0.1.2.exe
```

## 주요 의존성

- Electron 41.3.0: 데스크톱 앱 런타임, MIT
- marked 15.0.12: Markdown 파서, MIT
- DOMPurify 3.4.1: HTML 정제, MPL-2.0 OR Apache-2.0
- highlight.js 11.11.1: 코드 구문 강조, BSD-3-Clause
- @highlightjs/cdn-assets 11.11.1: 브라우저용 highlight.js 번들, BSD-3-Clause
- @fontsource/inter 5.2.8: Notion 계열 라틴 UI 폰트 번들, OFL-1.1
- @fontsource/noto-sans-kr 5.2.9: 한글 UI 폰트 번들, OFL-1.1
- electron-builder 26.8.1: Windows 설치 파일 생성, MIT
