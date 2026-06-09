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

// 씬 길이(초) — copy.ts SCENES 와 동기화
const SC = { hook: 1.6, whatIs: 3.2, benefits: 5.4, update: 4.4, cta: 3.4 };
const T = { hook: 0 };
T.whatIs = T.hook + SC.hook; T.benefits = T.whatIs + SC.whatIs; T.update = T.benefits + SC.benefits; T.cta = T.update + SC.update;
const TOTAL = Object.values(SC).reduce((a, b) => a + b, 0);

// 비개발자 친화 정적 카피(copy.ts 미러)
const COPY = {
  ko: { tagline: 'AI 코딩 에이전트를 위한 작업 관리 비서', whatIs: 'AI가 코딩하다 빠뜨리거나 잊지 않도록 맥락·검증·보안을 자동으로 챙겨줘요',
    benefits: [['맥락을 기억해요', '세션이 끊겨도 하던 작업을 이어가요'], ['거짓 완료를 막아요', "'다 했어요'를 증거로 자동 검증해요"], ['실수를 예방해요', '비밀키 유출·한글 깨짐을 미리 막아요']],
    updateLabel: '이번 업데이트', ctaTop: '지금 무료로 시작하세요' },
  en: { tagline: 'A work-manager for your AI coding agent', whatIs: 'Keeps your AI from missing or forgetting things — context, checks, and security, automatically',
    benefits: [['Remembers context', 'Picks up where it left off across sessions'], ['Stops fake "done"', 'Verifies completion with real evidence'], ['Prevents mistakes', 'Blocks secret leaks & encoding breakage']],
    updateLabel: "What's new", ctaTop: 'Start free now' },
};
// 카테고리 → accent + 평이 테마(h)
const CAT = {
  security: { a: '#fbbf24', ko: '보안이 더 강해졌어요', en: 'Stronger security' },
  'data-integrity': { a: '#f472b6', ko: '데이터가 더 안전해졌어요', en: 'Safer data' },
  feature: { a: '#34d399', ko: '새로운 기능이 생겼어요', en: 'New feature added' },
  compat: { a: '#5eead4', ko: '호환성이 좋아졌어요', en: 'Better compatibility' },
  consistency: { a: '#818cf8', ko: '더 매끄럽게 다듬었어요', en: 'More polished' },
  performance: { a: '#f59e0b', ko: '더 빨라졌어요', en: 'Faster now' },
  stable: { a: '#22d3ee', ko: '안정판이 나왔어요', en: 'Stable release' },
  refactor: { a: '#94a3b8', ko: '내부를 더 탄탄하게', en: 'Sturdier inside' },
  fix: { a: '#94a3b8', ko: '안정성을 높였어요', en: 'More stable' },
};

function clip(start, dur, track, inner, extra = '') {
  return `<div class="clip scene" data-start="${start}" data-duration="${dur}" data-track-index="${track}" style="${extra}">${inner}</div>`;
}

// 릴리스+언어 → 완전한 HyperFrames HTML 컴포지션 (1080x1920 세로)
function buildHtml(rel, lang) {
  const c = COPY[lang]; const cat = CAT[rel.category] || CAT.fix; const accent = cat.a;
  const theme = lang === 'ko' ? cat.ko : cat.en;
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
    // update (릴리스별 — 복붙 탈피 핵심)
    clip(T.update, SC.update, 2, `<div class="center"><div class="brandsm">leerness <span style="color:#5c6270">v${esc(ver)}</span></div><div id="ulabel" style="display:inline-block;font-family:mono;color:${accent};font-size:34px;font-weight:700;padding:8px 24px;border:2px solid ${accent}55;border-radius:12px">${esc(c.updateLabel)} · v${esc(ver)}</div><div id="utheme" style="font-size:38px;color:${accent};font-weight:700;margin-top:28px">${esc(theme)}</div><div id="uhead" style="font-size:${headline.length > 26 ? 52 : 62}px;font-weight:800;line-height:1.25;color:#fff;margin-top:14px;max-width:980px">${esc(headline)}</div>${hlHtml}</div>`),
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
      .mono, [style*="mono"] { font-family: "JetBrains Mono", monospace; }
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
        .from("#ulabel", { opacity: 0, y: -20, duration: 0.4, ease }, ${T.update + 0.1})
        .from("#utheme", { opacity: 0, duration: 0.4, ease }, ${T.update + 0.4})
        .from("#uhead", { opacity: 0, y: 24, duration: 0.5, ease }, ${T.update + 0.6})
        .from(".hl", { opacity: 0, x: -24, duration: 0.4, stagger: 0.25, ease }, ${T.update + 1.1})
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
  if (q && Array.isArray(q.queue) && q.queue.length) return q.queue;
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
      rendered.push({ version: rel.version, lang, file: path.relative(ROOT, path.join(HF, outFile)).replace(/\\/g, '/'), title: rel.title, summary: rel.summary, categoryKo: rel.categoryKo, categoryEn: rel.categoryEn, ok });
    }
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'rendered-hf.json'), JSON.stringify({ generated: '', engine: 'hyperframes', items: rendered }, null, 2) + '\n');
  console.log(`\n${HAS('--check-only') ? 'lint/validate' : '렌더'} 완료: ${rendered.length}건 → data/rendered-hf.json`);
}

if (require.main === module) main();
module.exports = { buildHtml, SC, TOTAL };
