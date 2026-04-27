# Markdown Viewer Plan

## 목표

간단한 설치형 Markdown 뷰어를 만든다. 1차 목표는 파일을 열고, 미리보고, 내보내고, 복사하고, 다크/라이트 모드를 전환하는 데스크톱 앱이다.

## 1차 MVP

- Markdown 파일 가져오기
- 좌측 원문 편집, 우측 미리보기
- Markdown 원문 내보내기
- HTML 내보내기
- Markdown 원문 복사
- 렌더링된 텍스트 복사
- 다크 모드와 라이트 모드 전환
- Windows NSIS 설치 파일 생성

## 기술 선택

- Electron: 설치형 Windows 앱 생성이 빠르고 파일 다이얼로그/클립보드/패키징 지원이 직접적이다.
- marked: Markdown 파싱을 검증된 라이브러리에 맡긴다.
- DOMPurify: Markdown에서 생성된 HTML을 렌더링 전에 정제한다.
- electron-builder: `dist/`에 Windows 설치 파일을 만든다.

## 보안 기준

- 렌더러에서 Node.js 직접 접근 금지
- `contextIsolation` 활성화
- preload API는 `openFile`, `saveFile`, `copyText`로 제한
- CSP 적용
- Markdown HTML은 DOMPurify로 정제
- 새 창과 임의 페이지 이동 차단
- 파일 용량은 제한하지 않는다. 매우 큰 파일에서는 렌더링 지연이 생길 수 있으므로 후속 최적화 대상으로 둔다.

## 이후 단계

1. 앱 아이콘과 제품명 확정
2. 최근 파일 목록 추가 여부 결정
3. PDF 내보내기 필요 여부 결정
4. 코드 서명 인증서 적용 여부 결정
5. 자동 업데이트 필요 여부 결정
