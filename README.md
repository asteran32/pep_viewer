# PEP 공개 데이터 뷰어

기존 PEP 결과를 정적 HTML·CSS·JavaScript와 JSON으로 제공하는 읽기 전용 뷰어입니다. 서버 API, API 키, Python, Node.js가 **방문자 또는 배포 서버에서 실행될 필요가 없습니다**. 원본 프로젝트와 별도로 운영할 수 있습니다.

## 로컬 실행

프로젝트 루트에서:

```sh
python3 -m http.server 8790 --bind 127.0.0.1 --directory github_page
```

브라우저에서 <http://127.0.0.1:8790>을 엽니다. `index.html`을 파일로 직접 열면 브라우저가 JSON 요청을 차단할 수 있습니다.

## 제공 기능

- 영상 제목 부분 검색, 근거 분류·위험도 복수 선택, 정렬, 페이지 구분
- 분석 이력·수집 영상 조회, 제목 클릭으로 상세 결과 열기
- 상세 창의 주장 분류·전사문·저장 댓글·영상 정보
- 주장 상세의 gpt-6 등급·위험도·주장 단위·판정 근거·참고 문헌
- 상세 창 테이블 위의 **원본 영상 보기**, 확인된 시간의 YouTube 구간 링크
- 헤더의 **코드북**에서 코드북 2.2 전문·목차와 원문 다운로드
- 코드북 오른쪽 **분석**에서 RQ1–3 그래프, 보고서 전문·다운로드
- **분석 페이지 상단**에서 전체 자료 XLSX 및 주장·채널·유형별 CSV 다운로드
- RQ1의 **영양 개입·주장 결과 막대 클릭**으로 해당 분류의 주장 상세 페이지 이동 (검색·근거 필터·페이지 구분·원문·판정 근거·영상 구간 링크)
- RQ2의 **등급명·전체 건수**는 등급 전체, **색상 막대·위험도별 건수**는 등급과 위험도를 함께 만족하는 주장으로 이동
- RQ3의 **주제별 막대**는 해당 주제의 고위험 주장으로 이동하며, 상세 페이지에서 주제 전체·다른 위험도로 전환
- 검색·필터에 맞는 **전체 주장**의 CSV 또는 XLSX 다운로드 (현재 페이지만으로 제한하지 않음)

필터는 같은 항목 내 OR, 검색·근거·위험도 사이 AND입니다. 화면 목록은 각 등급을 포함하는 영상을 표시하고, 다운로드는 **같은 주장에서 근거와 위험도 조건을 함께 만족하는 행만** 포함합니다. E0–E5는 근거 분류이며 위험도와 별도입니다. 선택 영상에 각각의 등급은 있지만 두 조건을 함께 만족하는 주장이 없으면 다운로드 행은 0개일 수 있습니다.

**분류 없음**은 완료된 분석의 공개 주장이 0개인 경우입니다. 실패·미분석과 CSV의 주장 분류 미제공은 별도로 구분합니다. 필터·통계·목록·다운로드는 모두 **gpt-6 재검토 결과**만 사용합니다. 이전 분류와 비교값·사람 확정값·기존 영상 단위 분류는 공개 JSON에서 제외합니다. 같은 영상의 여러 분석은 별도 이력으로 보존합니다. 수집 영상은 해당 영상의 가장 최근 공개 분석과 연결합니다.

CSV와 XLSX 모두 **주장당 한 행**입니다. 영상에 주장이 3개면 영상 제목·URL·채널을 반복한 3행이 생기며, `주장`, `증거 전사 자료`, `근거`, `위험도`에 각 주장의 개별 값을 표시합니다. 위험도는 ‘중간 2건’ 같은 영상별 집계가 아닌 ‘중간’처럼 표시합니다. 인용 전사는 연결된 원문을 우선하고, 저장된 연결 원문이 없으면 보존된 원문 인용을 사용합니다. 인용 검증 상태와 경고는 상세 화면·XLSX 분류 상세에서 확인할 수 있습니다.

주장이 없는 영상도 `주장`과 `근거`를 **분류 없음**, 전사 발췌·위험도·주장 ID를 빈칸으로 둔 한 행을 남깁니다. 위험도 조건이 적용된 경우 이 행은 제외하며, 실제 주장이 필터에서 제외되었다는 이유로 분류 없음 행을 새로 만들지는 않습니다. `분석 상태`로 미분석·가져온 이력 등도 구분합니다.

CSV는 UTF-8 BOM·줄바꿈·따옴표를 지원합니다. XLSX는 CSV와 같은 행을 담은 **주장 목록**, 동일한 필터 결과의 gpt-6 재검토 필드을 담은 **분류 상세** 시트로 구성합니다. 두 형식 모두 **검토 경고 수·수집 검색어·주장 수·영상 길이 열을 제외**합니다. 숫자·결측·실제 0을 구분하고 첫 행 고정·자동 필터를 설정합니다. 엑셀의 셀 길이 제한을 넘는 텍스트는 계속 열로 보존합니다.

## 데이터 갱신

원본 프로젝트 루트에서 Python 표준 라이브러리만으로 실행합니다.

```sh
python3 github_page/scripts/export_data.py
```

SQLite를 읽기 전용으로 조회하고 전사 파일을 함께 읽습니다. 모든 공개 주장에 gpt-6 재검토와 일치하는 원본 해시가 있어야 합니다. 검토 누락·오래된 검토가 있으면 기존 분류로 대체하지 않고 내보내기를 중단합니다. 원문 인용·전사 위치는 유지하지만 재검토하지 않은 기존 분류 필드는 배포하지 않습니다. 원본 DB·전사·분류 파일을 변경하거나 외부 API를 호출하지 않습니다. 삭제된 이력·주장은 제외하며 설정·키·작업 오류·프롬프트·모델 원응답·오디오를 배포하지 않습니다. 확정 전사·부분 전사와 캐시된 구간에서 복원된 텍스트를 보존합니다. 데이터 파일을 변경 중인 작업이 끝난 뒤 내보내는 것을 권장합니다.

`data/gpt6_claims.json`은 434개 재검토 행의 단일 교환 파일입니다. 뷰어 실행에는 이 파일 하나만이 아니라 `data/index.json`과 상세 스냅샷도 필요합니다. `data/index.json`은 목록과 상세 파일 경로를 담습니다. 상세는 내용 해시별 `data/snapshots/<hash>/jobs/`에 저장되고, 목록은 마지막에 교체됩니다. 갱신 시 오래된 내보내기 스냅샷은 제거됩니다. 같은 커밋에 전체 `data/` 변경과 삭제를 함께 반영하세요.

다른 프로젝트 경로를 읽는 경우:

```sh
python3 github_page/scripts/export_data.py --root /path/to/pep-web --output github_page/data
```

## GitHub Pages 배포

코드북 원본이 바뀌면 `python3 github_page/scripts/export_codebook.py`로 정적 코드북 페이지와 다운로드 원문을 갱신합니다.

분석 페이지는 `analysis.html`이며, 2026-10-25 RQ1–3 보고서의 309개 적격 주장 집계를 사용합니다. 개입·결과 그래프 전환, 전체 유형 펼치기, 근거 등급의 위험 비율 전환, 그래프 확대와 PNG 다운로드를 지원합니다. RQ1의 33개 막대는 `rq1.html?field=intervention_type&code=supplement` 형식의 상세 페이지로 연결됩니다. 보충제는 그래프와 같은 213개 주장·37개 영상을 표시하며, 각 주장을 펼치면 원문·유형·GPT-6 판정 근거와 원본 영상 링크가 나옵니다. 검색·근거 필터와 20건 단위 페이지 구분을 지원합니다. JavaScript 없이도 분석 페이지의 기본 그래프·보고서 전문·다운로드를 읽을 수 있습니다.

RQ2·RQ3는 동일한 목록 UI를 공유하는 `claims.html`로 연결됩니다. 예를 들어 `?field=evidence&code=E3&risk=high`는 E3 중 위험도 높은 40건이며, `?field=misinformation_theme&code=supplement_as_anti_cancer_therapy&risk=high`는 해당 주제 108건 중 고위험 44건입니다. `risk`를 생략하면 해당 분류 전체를 보여줍니다. 위험도 필터·전체 보기·검색·페이지 구분을 지원하며, RQ2의 상세에서 돌아오면 주장 수/비율 표시 기준을 유지합니다. 고위험 0건인 RQ3 주제도 전체 주장을 확인할 수 있습니다.

RQ3의 **고위험 주장의 채널 집중도 아래**에는 메타데이터 감사의 네 항목을 배치합니다: 유형 내 위험 분포, 각 위험도 집합의 채널 구성, 위험도별 집중도, 채널별 결과. 관찰 사례가 없는 약사 유형은 제외한 5개 유형·23개 채널·309개 주장을 사용합니다. 유형별 누적 막대, 위험도별 구성 표, 최다·상위 2개 채널 집중도 비교, 전체 채널 표가 정적 HTML로 제공됩니다. 채널 표는 검색·유형 필터·정렬과 분류 근거 펼치기를 지원하며, 그래프·건수에서 해당 주장 목록으로 이동할 수 있습니다. 구성 표·집중도에서 상세로 이동할 때는 전체 위험도 집합의 분모도 표시합니다. 메타데이터 기반 잠정 분류이며 전문 면허 확인 결과와 구분합니다.

보고서가 바뀌면 원본 프로젝트 루트에서 다음 명령으로 분석 페이지를 다시 생성합니다.

```sh
python3 github_page/scripts/export_analysis.py
```

분석 자료 다운로드도 같은 명령으로 갱신합니다. `assets/analysis/analysis_data.xlsx`는 **주장 309건**, **채널별 집계 23행**, **유형별 집계 6행** 시트를 담으며, 각 시트는 첫 행 고정과 필터를 지원합니다. 같은 자료를 `claims.csv`, `channel_summary.csv`, `type_summary.csv`로도 제공합니다. 유형 집계는 원본의 0건 유형도 보존합니다. 주장 CSV는 공개된 `rq1_claims.json`의 309개 적격 주장만 포함하며 434행 전체 재검토 CSV와 다릅니다. 다중 태그는 세미콜론으로 구분하고 인용 구간은 JSON 문자열로 보존합니다. CSV는 UTF-8 BOM과 수식 방지 이스케이프를 사용하며 XLSX의 집계 건수·백분율 열은 숫자로 저장합니다.

XLSX 생성에는 Node.js와 관리 런타임의 `@oai/artifact-tool`이 필요합니다. 기본 모듈 위치는 `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`이며, 다른 관리 런타임은 `ARTIFACT_TOOL_NODE_MODULES`로 지정합니다. 생성·검증용 파일은 원본 프로젝트의 `outputs/analysis-downloads-2026-10-26/`에 저장하고 완성 XLSX만 공개 자산에 복사합니다. 방문자와 GitHub Pages 배포에는 이 도구가 필요 없습니다. 다운로드 파일의 SHA-256은 공개 `manifest.json`에 기록됩니다.

다른 보고서 폴더는 `--source /path/to/report-folder`로 지정합니다. 해당 폴더에는 `RQ1-3_analysis.md`, `analysis_summary.json`, `cohort_membership.json`, `figures/`가 필요합니다. 동결 재검토 원본 폴더는 `--review-source /path/to/review-folder`로 지정할 수 있습니다 (기본 `data/reviews/gpt-6-2026-10-21/`). 생성기는 원자료를 수정하지 않고 `analysis.html`과 `assets/analysis/`에 공개 보고서·집계·그림을 저장합니다. 결과·표·해석은 유지하되 연구 환경의 내부 파일 경로와 실행 명령은 공개 자료 링크로 대체합니다. 원문·공개본 SHA-256은 `assets/analysis/manifest.json`에 기록됩니다.

채널 감사의 기본 경로는 `outputs/channel-risk-2026-10-25/`이며 `--channel-source /path/to/channel-audit`로 변경할 수 있습니다. `analysis_summary.json`·`channel_coding.json`·`channel_summary.csv`·`manifest.json`이 필요합니다. 생성기는 감사 파일 해시와 23개 채널·5개 유형의 주장/영상/위험도별 건수·집중도를 309개 주분석 주장과 검산합니다. 공개본은 `assets/analysis/channel_analysis.json`과 `channel_summary.csv`에 저장되며, 상세용 주장 JSON에도 채널 유형과 채널 코드를 연결합니다.

`assets/analysis/rq1_claims.json`은 RQ1–3 상세에서 함께 쓰는 주분석 309개 주장 데이터입니다. ID·영상/채널명·요약·원문·영양 개입/결과/주제·재검토 등급/위험도/판정 근거·연결된 영상 시간만 공개합니다. 유형·주제는 동결 당시 기존 분류이며 재검토 등급과 구분합니다. 생성 시 원본 스냅샷·재검토 파일의 SHA-256과 모든 분류별 주장 수·영상 수·고위험 수, 등급×위험도별 건수를 보고서와 대조합니다. 전체 전사문·설정·DB·모델 원응답은 추가로 복사하지 않습니다.

배포 워크플로에는 `analysis.html`·`rq1.html`·`claims.html`이 포함되어 있으며 `assets/`와 `src/`도 함께 복사됩니다. `claims.html`은 분석 내보내기 시 RQ1 상세 템플릿에서 함께 생성됩니다. 정적 페이지를 직접 업로드할 때도 이 파일들을 함께 반영해야 합니다.

**별도 저장소:** `github_page/` 안의 내용 전체를 새 저장소의 루트에 넣습니다 (`index.html`과 `.github/` 포함). `Settings → Pages → Source → GitHub Actions`를 선택하고 `main`에 반영하면 포함된 워크플로가 배포합니다. npm 설치나 빌드 단계가 없습니다.

**원본 저장소 안에서 배포:** `github_page/.github/workflows/pages.yml`을 저장소 루트의 `.github/workflows/pep-viewer.yml`로 복사하고 같은 Pages 설정을 사용합니다. 워크플로는 `github_page/`를 감지하며, 공개 화면·JSON·필요한 라이브러리만 업로드합니다. 원본 DB와 `.env`는 배포하지 않습니다.

모든 자산과 JSON 경로는 상대 경로여서 `/저장소명/` 하위 경로에서도 동작합니다. 데이터 갱신 후 다시 커밋하면 재배포됩니다. 이 작업에서는 원격 저장소 생성·업로드·실제 배포를 수행하지 않았습니다.

참고: [GitHub Pages 생성](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site). 공개 사이트에 배포한 JSON은 방문자가 다운로드할 수 있습니다.

## 라이브러리와 검증

XLSX 생성에는 동봉된 [ExcelJS 4.4.0](https://github.com/exceljs/exceljs/tree/v4.4.0)의 브라우저 번들만 사용합니다. MIT 라이선스는 `vendor/exceljs.LICENSE`에 있습니다. 외부 CDN 요청은 없습니다. CSV 다운로드에는 별도 라이브러리가 필요 없습니다.

라이브러리를 다시 준비해야 할 때만:

```sh
cd github_page
npm ci --ignore-scripts
npm run vendor
```

모델·실제 UI 이벤트·CSV/XLSX 파일·내보내기 검증 (검증용 npm 의존성 설치 후):

```sh
cd github_page
npm test
```

브라우저 검증 스크립트는 `tests/browser.cjs`입니다. Playwright와 Chrome이 설치된 환경에서 실행합니다. 정적 파일을 가상 URL에 제공하므로 로컬 서버 없이 하위 경로·데스크톱·모바일·다운로드를 검사합니다. 화면 캡처와 다운로드는 `artifacts/`에 저장합니다.

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node tests/browser.cjs
```

분석 페이지의 반응형 그래프·분모·키보드·확대·보고서 다운로드 검증:

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node tests/analysis.browser.cjs
```

분석 검증은 임시 localhost 서버의 `/pep_viewer/` 하위 경로에서 실행하며 외부 요청을 차단합니다. 1440·768·390·320px 화면과 JavaScript 비활성 상태를 검사하고 `artifacts/analysis/`에 화면을 저장합니다.

코드·수집·전사·분류·삭제·검토 저장 기능은 포함하지 않습니다.
