# leerness-site

**leerness.com** — leerness 소개·패치노트·안정화버전 사이트(Astro → Cloudflare Pages) +
버전/중요업데이트별 **HyperFrames 숏츠 자동생성 → YouTube 자동배포** 파이프라인.

> ⚠️ leerness npm 패키지(`../leerness-pkg`)의 **0 의존성 불변식**을 보호하기 위해 분리된 별도 워크스페이스.
> CHANGELOG/relnotes 를 **읽기전용 소스**로만 참조합니다.

## 구조
```
leerness-site/
  pipeline/
    parse-changelog.cjs   # CHANGELOG.md → data/releases.json (0-dep)
    curate.cjs            # important 미게시 선별 → data/video-queue.json
    auth-youtube.cjs      # YouTube refresh token 1회 발급 헬퍼 (0-dep)
    render-shorts-hf.cjs  # video-queue → HyperFrames 렌더 → video/out/*.mp4
    verify-video.cjs      # 업로드 전 영상·오디오 품질 검증
    verify-deploy.cjs     # production 최신 버전 노출 검증
    upload-youtube.cjs    # rendered → YouTube Shorts 업로드 → data/published.json (0-dep)
  src/                    # Astro 사이트 (홈/소개/패치노트/버전상세)
  data/                   # releases/video-queue/rendered/published(.json)
  .github/workflows/      # release-pipeline.yml (CI 자동화)
```

## 확정 설계 (2026-06-07)
- **렌더**: GitHub Actions (HyperFrames + FFmpeg, release 트리거 자동화)
- **트리거**: 중요 업데이트 큐레이션 (데이터무결성/보안/신기능/호환성 = important)
- **언어**: 한국어 + 영어 (양 언어 렌더·업로드)
- **사이트**: Astro → Cloudflare Pages

## 로컬 사용

Node.js 22 이상이 필요합니다(Wrangler 4 및 HyperFrames 기준).

```bash
npm install
npm run parse           # CHANGELOG → releases.json
npm run curate          # → video-queue.json
npm run site:dev        # Astro 로컬 미리보기
npm run site:build      # 수치 파생·주장 검증 + dist/ 정적 빌드
npm run auth:youtube    # refresh token 1회 발급 → .env 에 추가
npm run video:render -- --limit 4
npm run video:verify -- --limit 4
npm run upload -- --limit 4
```

## 필요 자격증명 (.env — 루트 ../.env 우선 로드, .gitignore 보호)
| 키 | 상태 | 비고 |
|---|---|---|
| `CLOUDFLARE_API_KEY` | ✅ 보유 | scoped 토큰. 권한에 **Pages:Edit** 필요 |
| `CLOUDFLARE_ACCOUNT_ID` | ❌ 필요 | 대시보드 우측 Account ID |
| `YOUTUBE_CLIENT_ID/SECRET` | ✅ 보유 | GCP OAuth2 |
| `YOUTUBE_REFRESH_TOKEN` | ❌ 필요 | `npm run auth:youtube` 로 1회 발급 |
| `PROJECT_ID` | ✅ 보유 | GCP 프로젝트 |

### YouTube refresh token 발급 (1회)
1. GCP 콘솔(PROJECT_ID): YouTube Data API v3 활성화 + OAuth 동의화면에 본인 test user 등록.
2. OAuth 클라이언트 redirect URI 에 `http://localhost:53682` 추가.
3. `npm run auth:youtube` → 브라우저 동의 → 출력된 `YOUTUBE_REFRESH_TOKEN=...` 를 `.env` 에 추가.

### Cloudflare Pages 배포
1. `.env` 에 `CLOUDFLARE_ACCOUNT_ID` 추가 + 토큰 권한 Pages:Edit 확인.
2. `npm run site:build && npm run site:deploy`.
3. leerness.com 커스텀 도메인: Cloudflare 네임서버 연결 후 Pages 프로젝트에 도메인 추가.

## CI 자동화 (GitHub Actions)
`.github/workflows/release-pipeline.yml` — `workflow_dispatch` 또는 leerness 릴리스 `repository_dispatch`.
GitHub Secrets 등록 필요: `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN`.
흐름: CHANGELOG fetch → 파싱 → 큐레이션 → Astro 빌드 → Pages 배포·검증 → HyperFrames 렌더(한/영) → 영상 검증 → YouTube 업로드 → published.json 커밋백.

## 검증 현황
- ✅ parse-changelog: CHANGELOG에서 릴리스·카테고리·important 분류 파생
- ✅ curate: important 미게시 한/영 큐 생성
- ✅ check-claims: 사이트 소스의 손으로 적힌 수치 주장 차단
- ✅ Astro build: 홈·기능 안내·전체 패치노트 정적 생성
- ⏸ HyperFrames render / YouTube upload: 저장소 변수 `LEERNESS_VIDEO_ENABLED=true`일 때만 실행

## 영어 자막 (다음 단계)
CHANGELOG 제목/요약은 한국어 — EN 영상은 번역 단계 필요. `curate.cjs` 에 LLM 번역 훅 추가 예정
(현재 EN 영상은 카테고리/버전 등 영어 라벨 + 한국어 본문, 추후 완전 번역).

## 보안
- 모든 자격증명 `.env`(.gitignore) — 하드코딩 금지. CI 는 GitHub Secrets.
- `published.json` 만 추적(게시 원장), 렌더 mp4·video-queue 는 무시.
- leerness-pkg 0-deps 불변 — 사이트·영상 의존성은 이 워크스페이스에만.
