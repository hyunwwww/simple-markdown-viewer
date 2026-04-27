# Simple Markdown Viewer

설치형 데스크톱 Markdown 뷰어 초안입니다.

## 기능

- Markdown 파일 가져오기
- 현재 문서 Markdown 또는 HTML 내보내기
- Markdown 원문 또는 렌더링된 텍스트 복사
- 다크 모드와 라이트 모드 전환
- Electron `contextIsolation` 기반의 파일 접근 분리

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

현재 생성된 설치 파일:

```text
dist/Simple Markdown Viewer Setup 0.1.0.exe
```

## 주요 의존성

- Electron 41.3.0: 데스크톱 앱 런타임, MIT
- marked 15.0.12: Markdown 파서, MIT
- DOMPurify 3.4.1: HTML 정제, MPL-2.0 OR Apache-2.0
- electron-builder 26.8.1: Windows 설치 파일 생성, MIT
