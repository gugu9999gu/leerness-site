#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * render-shorts-hf.cjs — HyperFrames 기반 릴리스 숏츠 렌더 (Remotion 대체 병행 경로, UR-0034 Phase 1)
 *
 * 단계적 전환: Remotion(video/) 은 그대로 두고, hyperframes 로 동일 5씬 + 릴리스별 콘텐츠(titlePlain/videoHighlights)
 * + BGM/효과음 + 세로 9:16 + 한글 폰트로 plain HTML 컴포지션을 생성·렌더한다. CI 에서 verify-video 게이트로 검증 후 컷오버.
 *
 * 사용: node pipeline/render-shorts-hf.cjs [--limit N] [--version X] [--check-only] [--fps 60]
 *   --check-only : 렌더 없이 hyperframes lint/validate 만 (FFmpeg 불필요, 구조 검증)
 * 출력: video-hf/out/<ver>-<lang>.mp4 + data/rendered-hf.json
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HF = path.join(ROOT, 'video-hf');
const arg = (n, d) => { const i = process.argv.indexOf(n); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : d; };
const HAS = (n) => process.argv.includes(n);
const load = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 씬 길이(초) — 인트로 간소화(hook/whatIs 단축) + update(문제→해소 모션)에 시간 배분
const SC = { hook: 1.3, whatIs: 2.2, benefits: 4.6, update: 6.2, cta: 3.0 };
const T = { hook: 0 };
T.whatIs = T.hook + SC.hook; T.benefits = T.whatIs + SC.whatIs; T.update = T.benefits + SC.benefits; T.cta = T.update + SC.update;
const TOTAL = Object.values(SC).reduce((a, b) => a + b, 0);

// 비개발자 친화 정적 카피(copy.ts 미러)
const COPY = {
  ko: { tagline: 'AI 코딩 에이전트를 위한 작업 관리 비서', whatIs: 'AI 코딩의 빠뜨림·거짓완료·실수를 자동으로 막아줘요',
    benefits: [['맥락을 기억해요', '세션이 끊겨도 하던 작업을 이어가요'], ['거짓 완료를 막아요', "'다 했어요'를 증거로 자동 검증해요"], ['실수를 예방해요', '비밀키 유출·한글 깨짐을 미리 막아요']],
    updateLabel: '이번 업데이트', ctaTop: '지금 무료로 시작하세요' },
  en: { tagline: 'A work-manager for your AI coding agent', whatIs: 'Stops your AI from missing, faking done, or slipping up',
    benefits: [['Remembers context', 'Picks up where it left off across sessions'], ['Stops fake "done"', 'Verifies completion with real evidence'], ['Prevents mistakes', 'Blocks secret leaks & encoding breakage']],
    updateLabel: "What's new", ctaTop: 'Start free now' },
};
// 카테고리 → accent + 해결(ko/en) + 문제(probKo/probEn) — update 씬의 "문제→해소" 모션용
const CAT = {
  security: { a: '#fbbf24', ko: '보안이 더 강해졌어요', en: 'Stronger security', probKo: '비밀키가 코드에 새던 위험', probEn: 'Secrets leaking into code' },
  'data-integrity': { a: '#f472b6', ko: '데이터가 더 안전해졌어요', en: 'Safer data', probKo: '기록이 깨지거나 덮어써지던 문제', probEn: 'Records corrupting or overwriting' },
  feature: { a: '#34d399', ko: '새로운 기능이 생겼어요', en: 'New feature added', probKo: '그동안 없던 기능', probEn: 'A capability that was missing' },
  compat: { a: '#5eead4', ko: '호환성이 좋아졌어요', en: 'Better compatibility', probKo: '환경마다 깨지던 호환성', probEn: 'Breaking across environments' },
  consistency: { a: '#818cf8', ko: '더 매끄럽게 다듬었어요', en: 'More polished', probKo: '들쭉날쭉하던 동작', probEn: 'Inconsistent behavior' },
  performance: { a: '#f59e0b', ko: '더 빨라졌어요', en: 'Faster now', probKo: '느리던 처리 속도', probEn: 'Slow processing' },
  stable: { a: '#22d3ee', ko: '안정판이 나왔어요', en: 'Stable release', probKo: '흩어져 있던 자잘한 이슈들', probEn: 'Scattered small issues' },
  refactor: { a: '#94a3b8', ko: '내부를 더 탄탄하게', en: 'Sturdier inside', probKo: '비대해진 내부 구조', probEn: 'Bloated internals' },
  fix: { a: '#94a3b8', ko: '안정성을 높였어요', en: 'More stable', probKo: '불안정하던 동작', probEn: 'Unstable behavior' },
};

function clip(start, dur, track, inner, extra = '') {
  return `<div class="clip scene" data-start="${start}" data-duration="${dur}" data-track-index="${track}" style="${extra}">${inner}</div>`;
}

// 릴리스+언어 → 완전한 HyperFrames HTML 컴포지션 (1080x1920 세로)
function buildHtml(rel, lang) {
  const c = COPY[lang]; const cat = CAT[rel.category] || CAT.fix; const accent = cat.a;
  const theme = lang === 'ko' ? cat.ko : cat.en;
  const prob = lang === 'ko' ? (cat.probKo || '') : (cat.probEn || '');
  const beforeL = lang === 'ko' ? '이전' : 'Before';  // 유니코드 기호(✕/✓/↓) 대신 텍스트 라벨 — CI Chrome 폰트에 기호 글리프가 없어 안 보였음
  const afterL = lang === 'ko' ? '이제' : 'Now';
  const headline = lang === 'ko' ? (rel.titlePlain || rel.title || '') : (rel.title || rel.titlePlain || '');
  const hls = (rel.videoHighlights || []).slice(0, 3);
  const ver = rel.version;
  const benefitsHtml = c.benefits.map(([t, d]) =>
    `<div class="brow"><div style="font-size:50px;font-weight:800;color:#fff">${esc(t)}</div><div style="font-size:34px;color:#9aa0ad;margin-top:8px">${esc(d)}</div></div>`).join('');
  const hlHtml = hls.length
    ? `<div class="hls">${hls.map(h => `<div class="hl"><span style="color:${accent};font-weight:800">▸</span> ${esc(h)}</div>`).join('')}</div>`
    : '';

  const scenes = [
    // hook
    clip(T.hook, SC.hook, 2, `<div class="center"><div id="brand" style="font-size:120px;font-weight:900;letter-spacing:-3px;color:#fff">leerness</div><div id="hookv" style="margin-top:30px;padding:12px 30px;border:2px solid ${accent};border-radius:999px;color:${accent};font-family:mono;font-size:42px;font-weight:700">v${esc(ver)}</div></div>`),
    // whatIs
    clip(T.whatIs, SC.whatIs, 2, `<div class="center"><div class="brandsm">leerness <span style="color:#5c6270">v${esc(ver)}</span></div><div id="whatis" style="font-size:56px;font-weight:700;line-height:1.4;color:#e7e9ee;max-width:920px">${esc(c.whatIs)}</div></div>`),
    // benefits
    clip(T.benefits, SC.benefits, 2, `<div class="center"><div class="brandsm">leerness <span style="color:#5c6270">v${esc(ver)}</span></div><div style="display:flex;flex-direction:column;gap:48px">${benefitsHtml}</div></div>`),
    // update (릴리스별 — 문제→해소 모션: '이전'문제(dim) → CSS삼각형 화살표 → '이제'해결(accent) → 헤드라인 → 적용 하이라이트)
    clip(T.update, SC.update, 2, `<div class="center"><div class="brandsm">leerness <span style="color:#5c6270">v${esc(ver)}</span></div><div id="ulabel" class="mono" style="display:inline-block;color:${accent};font-size:32px;font-weight:700;padding:8px 24px;border:2px solid ${accent}55;border-radius:12px">${esc(c.updateLabel)} · v${esc(ver)}</div><div id="uprob" style="margin-top:30px;font-size:38px;color:#9aa0ad;font-weight:700"><span style="color:#ef4444;font-weight:800">${beforeL}</span> ${esc(prob)}</div><div id="uarrow" style="width:0;height:0;border-left:22px solid transparent;border-right:22px solid transparent;border-top:28px solid ${accent};margin:18px 0"></div><div id="utheme" style="font-size:46px;color:${accent};font-weight:800"><span style="color:#34d399">${afterL}</span> ${esc(theme)}</div><div id="uhead" style="font-size:${headline.length > 26 ? 46 : 54}px;font-weight:800;line-height:1.25;color:#fff;margin-top:14px;max-width:980px">${esc(headline)}</div>${hlHtml}</div>`),
    // cta
    clip(T.cta, SC.cta, 2, `<div class="center"><div id="ctatop" style="font-size:52px;color:#e7e9ee;font-weight:700">${esc(c.ctaTop)}</div><div id="ctacmd" style="margin-top:36px;background:#13151c;border:2px solid ${accent};border-radius:18px;padding:30px 40px;font-family:mono;font-size:46px;color:${accent}">npm i -g leerness</div><div id="ctasite" style="margin-top:44px;font-size:56px;font-weight:800;color:#fff">leerness.com</div></div>`),
  ].join('\n      ');

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800;900&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0a0b0e; }
      body { font-family: "Noto Sans KR", sans-serif; color: #e7e9ee; }
      .mono, [style*="mono"] { font-family: "JetBrains Mono", "Noto Sans KR", monospace; }  /* 한글 fallback — JetBrains Mono 엔 한글 글리프 없어 '이번 업데이트' 배지가 안 보였음(Phase 3 폴리시) */
      .scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 80px; }
      .center { text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; }
      .brandsm { position: absolute; top: 90px; left: 0; right: 0; text-align: center; font-family: "JetBrains Mono", monospace; font-size: 36px; font-weight: 700; color: #e7e9ee; }
      .hls { margin-top: 30px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
      .hl { font-size: 36px; color: #c7ccd6; max-width: 960px; line-height: 1.3; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <!-- BGM (CC0 자체생성, track 0) + 섹션 효과음 (track 1) — id 필수(없으면 렌더 무음) -->
      <audio id="bgm" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-volume="0.5" src="assets/bgm.wav"></audio>
      ${[T.whatIs, T.benefits, T.update, T.cta].map((s, i) => `<audio id="sfx${i}" class="clip" data-start="${s}" data-duration="0.2" data-track-index="1" data-volume="0.45" src="assets/sfx-pop.wav"></audio>`).join('\n      ')}
      <audio id="sfxsolve" class="clip" data-start="${(T.update + 2.0).toFixed(2)}" data-duration="0.2" data-track-index="1" data-volume="0.55" src="assets/sfx-pop.wav"></audio>
      ${scenes}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const ease = "power2.out";
      tl.from("#brand", { opacity: 0, y: -40, duration: 0.5, ease }, ${T.hook})
        .from("#hookv", { opacity: 0, scale: 0.8, duration: 0.4, ease }, ${T.hook + 0.3})
        .from("#whatis", { opacity: 0, y: 30, duration: 0.6, ease }, ${T.whatIs + 0.2})
        .from(".brow", { opacity: 0, x: -40, duration: 0.5, stagger: 0.3, ease }, ${T.benefits + 0.2})
        .fromTo("#ulabel", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease }, ${T.update + 0.1})
        .fromTo("#uprob", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease }, ${T.update + 0.6})
        .fromTo("#uarrow", { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, ${T.update + 1.5})
        .fromTo("#utheme", { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${T.update + 2.0})
        .fromTo("#uhead", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease }, ${T.update + 2.6})
        .fromTo(".hl", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.25, ease }, ${T.update + 3.2})
        .from("#ctatop", { opacity: 0, y: 20, duration: 0.4, ease }, ${T.cta + 0.1})
        .from("#ctacmd", { opacity: 0, scale: 0.9, duration: 0.4, ease }, ${T.cta + 0.4})
        .from("#ctasite", { opacity: 0, y: 20, duration: 0.4, ease }, ${T.cta + 0.8});
      window.__timelines["root"] = tl;
    </script>
  </body>
</html>
`;
}

function pickReleases() {
  if (arg('--version', null)) {
    const r = (load(path.join(ROOT, 'data', 'releases.json'), { releases: [] }).releases || []).find(x => x.version === arg('--version'));
    return r ? [r] : [];
  }
  // curate 큐 우선, 없으면 최신 important
  const q = load(path.join(ROOT, 'data', 'video-queue.json'), null);
  const queued = q && (Array.isArray(q.items) ? q.items : (Array.isArray(q.queue) ? q.queue : null));  // 16th 버그헌트 F5: curate 는 'items' 키로 씀(이전엔 'queue' 만 봐서 큐레이션 무시되고 항상 fallback)
  if (queued && queued.length) return queued;
  const rel = load(path.join(ROOT, 'data', 'releases.json'), { releases: [] }).releases || [];
  return rel.filter(r => r.important).slice(0, parseInt(arg('--limit', '3'), 10) || 3);
}

function main() {
  if (!fs.existsSync(HF)) { console.error('✗ video-hf/ 없음'); process.exit(1); }
  // 오디오 자산 준비(public → video-hf/assets) — git 중복 커밋 회피, CI 에서 런타임 복사.
  const adir = path.join(HF, 'assets'); fs.mkdirSync(adir, { recursive: true });
  for (const f of ['bgm.wav', 'sfx-pop.wav']) { const s = path.join(ROOT, 'public', f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(adir, f)); }
  const limit = parseInt(arg('--limit', '3'), 10) || 3;
  const fps = arg('--fps', '60');
  const releases = pickReleases().slice(0, limit);
  if (!releases.length) { console.log('렌더할 릴리스 없음 — skip'); return; }
  const rendered = [];
  for (const rel of releases) {
    for (const lang of ['ko', 'en']) {
      const html = buildHtml(rel, lang);
      fs.writeFileSync(path.join(HF, 'index.html'), html);
      // 구조 검증: lint 만(Chrome/FFmpeg 불필요 — validate/inspect/render 는 CI 의 Chrome+FFmpeg 에서). 0 error 면 통과(warning 허용).
      const chk = cp.spawnSync('npx hyperframes lint', { cwd: HF, encoding: 'utf8', shell: true, timeout: 180000 });
      const chkOut = (chk.stdout || '') + (chk.stderr || '');
      const lintOk = /0 error\(s\)/.test(chkOut) || (chk.status === 0 && !/[1-9]\d* error/.test(chkOut));
      console.log(`  ${lintOk ? '✓' : '✗'} ${rel.version}/${lang} lint${lintOk ? ' (0 error)' : '\n' + chkOut.split('\n').slice(-10).join('\n')}`);
      if (HAS('--check-only')) { rendered.push({ version: rel.version, lang, checkOnly: true, lintOk }); continue; }
      if (!lintOk) { rendered.push({ version: rel.version, lang, lintOk: false }); continue; }
      const outFile = path.join('out', `${rel.version}-${lang}.mp4`);
      const r = cp.spawnSync(`npx hyperframes render -f ${fps} -o ${JSON.stringify(outFile)}`, { cwd: HF, encoding: 'utf8', shell: true, timeout: 600000 });
      const ok = r.status === 0 && fs.existsSync(path.join(HF, outFile));
      console.log(`  ${ok ? '✓' : '✗'} ${rel.version}/${lang} render → ${outFile}`);
      // 썸네일: update 씬(릴리스별 내용) 프레임 추출 — upload-youtube 가 it.thumb 사용. ffmpeg 필요(CI).
      let thumb = null;
      if (ok) {
        const thumbAbs = path.join(HF, 'out', `${rel.version}-${lang}.jpg`);
        const tr = cp.spawnSync(`ffmpeg -y -ss 12.5 -i ${JSON.stringify(outFile)} -frames:v 1 -q:v 2 ${JSON.stringify(path.join('out', `${rel.version}-${lang}.jpg`))}`, { cwd: HF, encoding: 'utf8', shell: true, timeout: 60000 });
        if (tr.status === 0 && fs.existsSync(thumbAbs)) thumb = path.relative(ROOT, thumbAbs).replace(/\\/g, '/');
      }
      rendered.push({ version: rel.version, lang, file: path.relative(ROOT, path.join(HF, outFile)).replace(/\\/g, '/'), thumb, title: rel.title, summary: rel.summary, categoryKo: rel.categoryKo, categoryEn: rel.categoryEn, major: !!rel.important, ok });
    }
  }
  // rendered.json (정본 — upload-youtube/verify-video 가 읽는 표준 경로). render-shorts.cjs 의 drop-in 대체.
  const out = { generated: '', engine: 'hyperframes', items: rendered };
  if (!HAS('--check-only')) {  // 16th 버그헌트 F8: check-only 시엔 rendered.json/rendered-hf.json 둘 다 쓰지 않음(file 없는 checkOnly 항목이 이후 verify --rendered 를 깨뜨리던 문제)
    fs.writeFileSync(path.join(ROOT, 'data', 'rendered.json'), JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, 'data', 'rendered-hf.json'), JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`\n${HAS('--check-only') ? 'lint' : '렌더'} 완료: ${rendered.length}건 → data/rendered.json`);
}

if (require.main === module) main();
module.exports = { buildHtml, SC, TOTAL };
