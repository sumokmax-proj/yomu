# yomu 読む — 일본어 독해 연습

게임이나 틱톡 댓글에서 보이는 간단한 일본어 문장을 읽을 수 있게 되는 것을 목표로 하는
한국어 사용자용 일본어 학습 웹앱입니다.

👉 **접속 주소: https://sumokmax-proj.github.io/yomu/**

순수 HTML/CSS/JS 정적 사이트라 서버·로그인·빌드 도구가 필요 없고, 학습 기록은 브라우저(localStorage)에만 저장됩니다.

## 기능

| 단계 | 기능 | 상태 |
| --- | --- | --- |
| 1 | 히라가나·가타카나 복습 (오십음도, 퀴즈, 헷갈리는 글자 집중) | ✅ |
| 2 | 기초 어휘 플래시카드 (일본어 / 후리가나 / 한국어 뜻, 알아요·모르겠어요 복습 주기) | 준비 중 |
| 3 | 문장 독해 연습 (객관식 뜻 고르기, 후리가나·해석 토글, 틀린 문장 재출제) | 준비 중 |

### 1단계: 가나 복습
- **오십음도** — 기본(청음) / 탁음·반탁음 / 요음. 글자를 누르면 발음 재생, 발음 표시 켜기·끄기, 자주 틀린 글자는 빨간 점 표시
- **퀴즈** — 문자→발음, 발음→문자, 섞어서. 히라가나/가타카나/섞기, 범위·문제 수 선택
- **헷갈리는 글자 가중 출제** — 많이·최근에 틀린 글자일수록 더 자주 출제되고, 보기에 シ/ツ, ソ/ン 같은 비슷한 글자가 함께 나옵니다. 틀리면 두 글자를 나란히 보여 주고 구별 요령을 알려 줍니다
- **결과 화면** — 틀린 글자만 다시 풀기, 가나 홈에서 "헷갈리는 글자" 집중 연습
- PC에서는 키보드 `1`~`4`로 보기 선택, `Enter`로 다음 문제

### 공통
- 폰 우선 반응형 디자인, 다크 모드 자동 대응
- 발음 듣기: 브라우저 내장 음성(Web Speech API, `ja-JP`). 소리가 안 나거나 어색하면 기기 설정에서 일본어 음성(TTS)을 추가하세요
- 일본어 텍스트에는 `lang="ja"`와 일본어 폰트(Noto Sans JP 등)를 지정해서 한자·가나가 한국어/중국어 자형으로 깨지지 않게 했습니다
- **홈 화면에 추가** — 아이폰 Safari: 공유 버튼 → "홈 화면에 추가" / 안드로이드 Chrome: ⋮ 메뉴 → "홈 화면에 추가"(또는 "앱 설치"). 한 번 열어 둔 화면은 오프라인에서도 열립니다

## 파일 구성

```
index.html              앱 화면 틀 (상단바, 하단 탭)
css/style.css           스타일 (반응형, 다크 모드)
js/app.js               라우터(#/...)와 홈 화면
js/kana.js              가나 복습: 오십음도·퀴즈·기록
js/ui.js                DOM/공용 유틸
js/storage.js           localStorage 저장 (키 접두사 yomu.)
js/speech.js            일본어 음성 재생
data/kana.json          가나 데이터 + 헷갈리는 글자 그룹과 구별 요령
manifest.webmanifest    홈 화면 앱 설정
sw.js                   오프라인 캐시 (네트워크 우선)
icons/                  앱 아이콘
.github/workflows/pages.yml  GitHub Pages 자동 배포
```

### 데이터 고치기
- `data/kana.json`의 `confusables`에 `{"chars": ["シ", "ツ"], "tip": "구별 요령"}` 형식으로 헷갈리는 글자 그룹을 추가할 수 있습니다.
- 어휘(`data/vocab.json`)와 문장(`data/sentences.json`)도 2·3단계에서 같은 방식의 JSON 파일로 분리할 예정입니다.
- 파일 경로는 모두 상대 경로라서 `https://sumokmax-proj.github.io/yomu/` 같은 하위 경로에서도 동작합니다.

## 로컬에서 실행

`fetch`로 JSON을 읽기 때문에 파일을 더블클릭(`file://`)하면 동작하지 않습니다. 간단한 웹 서버로 여세요.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 열기
```

## 배포 (GitHub Pages + GitHub Actions)

`main` 브랜치에 푸시되면 `.github/workflows/pages.yml`이 저장소 내용을 그대로 GitHub Pages에 배포합니다.

처음 한 번만 GitHub 웹에서 설정이 필요합니다.

1. 저장소 페이지 → **Settings** → 왼쪽 메뉴 **Pages**
2. **Build and deployment → Source** 를 **GitHub Actions** 로 선택 (저장 버튼 없이 바로 적용)
3. 작업 브랜치의 Pull Request를 `main`으로 병합 (**Pull requests** → PR 열기 → **Merge pull request** → **Confirm merge**)
4. **Actions** 탭에서 "Deploy to GitHub Pages" 실행이 초록색 ✓ 가 되면 완료 (1~2분)
5. https://sumokmax-proj.github.io/yomu/ 접속

배포가 실패했다면(예: 2번 설정 전에 병합한 경우) Actions 탭 → "Deploy to GitHub Pages" → **Run workflow** 로 다시 실행하면 됩니다.

학습 기록은 기기·브라우저마다 따로 저장됩니다. 브라우저 데이터를 지우면 기록도 사라집니다.
