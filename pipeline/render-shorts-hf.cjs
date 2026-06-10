#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * render-shorts-hf.cjs — HyperFrames 기반 릴리스 숏츠 렌더 (UR-0034 컷오버 완료 + UR-0050 변주 시스템)
 *
 * UR-0050 (사용자 명시): 매 영상이 "처음부터 끝까지" 이전 영상과 내용 구성·스타일이 달라야 함.
 *   → 버전 문자열 해시를 시드로 한 **결정적 변주**(같은 버전=같은 영상, 버전마다 다른 영상; Date.now/random 금지 — 멱등):
 *   - 스토리 구성 4종: A 브랜드-퍼스트 / B 업데이트-퍼스트(문제 훅) / C 질문 훅 / D 버전 빅넘버 훅
 *   - 배경 3종(radial/linear/diagonal) × 카피 풀 3종 × 모션 3종(y/x/scale) × 정렬 2종(중앙/좌)
 *   - 직전 릴리스와 같은 스토리 구성이 나오면 자동 +1 시프트(연속 영상 중복 회피)
 *
 * 사용: node pipeline/render-shorts-hf.cjs [--limit N] [--version X] [--check-only] [--fps 60]
 * 출력: video-hf/out/<ver>-<lang>.mp4 + data/rendered.json (+ rendered-hf.json)
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

// ── 카테고리 카탈로그 (accent + 해결/문제 문구 + 칩 태그) ──
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
const CAT_TAG = {
  security: ['보안', 'Security'], 'data-integrity': ['데이터', 'Data'], feature: ['새 기능', 'Feature'],
  compat: ['호환성', 'Compatibility'], consistency: ['일관성', 'Consistency'], performance: ['성능', 'Performance'],
  stable: ['안정판', 'Stable'], refactor: ['내부 개선', 'Internals'], fix: ['안정성', 'Stability'],
};

// ── 카피 풀 (변주 — copy 인덱스로 선택) ──
const POOL = {
  ko: {
    whatIs: [
      'AI 코딩의 빠뜨림·거짓완료·실수를 자동으로 막아줘요',
      'AI가 한 일, 진짜 했는지 증거로 확인하는 작업 비서예요',
      '기억·검증·보안을 한 줄 명령으로 챙기는 AI 코딩 하네스예요',
    ],
    ctaTop: ['지금 무료로 시작하세요', '설치는 한 줄이면 끝', '오늘부터 AI에게 증거를 요구하세요'],
    question: ['AI가 "다 했어요"라고 거짓말한다면?', '어제 AI가 하던 작업, 오늘 이어갈 수 있나요?', 'AI가 만든 코드, 정말 믿어도 될까요?'],
    benefits: [['맥락을 기억해요', '세션이 끊겨도 하던 작업을 이어가요'], ['거짓 완료를 막아요', "'다 했어요'를 증거로 자동 검증해요"], ['실수를 예방해요', '비밀키 유출·한글 깨짐을 미리 막아요']],
    updateLabel: '이번 업데이트', beforeL: '이전', afterL: '이제', whyL: '왜 좋아졌나',
  },
  en: {
    whatIs: [
      'Stops your AI from missing, faking done, or slipping up',
      'A work-manager that checks your AI really did the work — with evidence',
      'Memory, verification and guards for AI coding, in one command',
    ],
    ctaTop: ['Start free now', 'One line to install', 'Demand evidence from your AI'],
    question: ['What if your AI lies about "done"?', "Can today's session continue yesterday's work?", 'Can you really trust AI-written code?'],
    benefits: [['Remembers context', 'Picks up where it left off across sessions'], ['Stops fake "done"', 'Verifies completion with real evidence'], ['Prevents mistakes', 'Blocks secret leaks & encoding breakage']],
    updateLabel: "What's new", beforeL: 'Before', afterL: 'Now', whyL: 'Why it matters',
  },
};

// ── 변주 시드 (결정적 — Date.now/random 금지) ──
function seedOf(ver) { let h = 5381; for (const ch of String(ver)) h = (((h * 33) >>> 0) ^ ch.charCodeAt(0)) >>> 0; return h; }
function variantFor(ver, prevVer) {
  const h = seedOf(ver);
  let story = h % 4;
  if (prevVer) { const p = seedOf(prevVer); if (p % 4 === story) story = (story + 1) % 4; }  // 직전 영상과 같은 구성 회피
  const mix = ((h >>> 9) ^ (h >>> 13) ^ (h >>> 21)) >>> 0;  // 단일 비트 시프트는 버전 형식("1.X.0")에서 편향(left 33:3) — xor 믹싱으로 균형
  return { story, bg: (h >>> 3) % 3, copy: (h >>> 5) % 3, motion: (h >>> 7) % 3, align: mix % 2 };
}

// ── 모션 패턴 (fromTo — 끝상태 명시, seek 안정) ──
const FROMS = [{ y: 34 }, { x: -44 }, { scale: 0.82 }];
function anim(sel, at, motion, dur = 0.5, easeStr = 'ease') {
  const f = FROMS[motion % FROMS.length];
  const fromParts = ['opacity: 0'];
  if (f.y) fromParts.push(`y: ${f.y}`); if (f.x) fromParts.push(`x: ${f.x}`); if (f.scale) fromParts.push(`scale: ${f.scale}`);
  return `.fromTo("${sel}", { ${fromParts.join(', ')} }, { opacity: 1, y: 0, x: 0, scale: 1, duration: ${dur}, ease: ${easeStr} }, ${at.toFixed(2)})`;
}

function clip(start, dur, inner) {
  return `<div class="clip scene" data-start="${start.toFixed(2)}" data-duration="${dur}" data-track-index="2">${inner}</div>`;
}

// ── 씬 조각 빌더 (모든 씬: {dur, html(start), anims(start)} — 스토리가 조립) ──
function buildScenes(rel, lang, v) {
  const P = POOL[lang]; const cat = CAT[rel.category] || CAT.fix; const accent = cat.a;
  const catTag = (CAT_TAG[rel.category] || CAT_TAG.fix)[lang === 'ko' ? 0 : 1];
  const theme = lang === 'ko' ? cat.ko : cat.en;
  const prob = lang === 'ko' ? cat.probKo : cat.probEn;
  const headline = lang === 'ko' ? (rel.titlePlain || rel.title || '') : (rel.title || rel.titlePlain || '');
  const hls = (rel.videoHighlights || []).slice(0, 3);
  const ver = rel.version;
  const m = v.motion;
  const wrap = v.align === 1 ? 'leftbox' : 'center';
  const brandSm = `<div class="brandsm">leerness <span style="color:#5c6270">v${esc(ver)}</span></div>`;
  const hlHtml = hls.length ? `<div class="hls">${hls.map(h => `<div class="hl"><span style="color:${accent};font-weight:800">▸</span> ${esc(h)}</div>`).join('')}</div>` : '';
  const chip = (id) => `<div id="${id}" style="display:inline-block;padding:9px 26px;border-radius:999px;background:${accent};color:#0a0b0e;font-size:32px;font-weight:800">${esc(catTag)}</div>`;

  const S = {};
  // 브랜드 인트로 (스토리 A 시작 / C 후반)
  S.brand = { dur: 1.4, html: s => clip(s, 1.4, `<div class="center"><div id="brand" style="font-size:120px;font-weight:900;letter-spacing:-3px;color:#fff">leerness</div><div id="hookv" style="margin-top:28px;padding:12px 30px;border:2px solid ${accent};border-radius:999px;color:${accent};font-family:mono;font-size:42px;font-weight:700">v${esc(ver)}</div><div style="margin-top:24px">${chip('hookcat')}</div></div>`),
    anims: s => [anim('#brand', s, m), anim('#hookv', s + 0.3, m, 0.4), anim('#hookcat', s + 0.55, 2, 0.3, '"back.out(1.6)"')] };
  // 소개 한 줄
  S.whatIs = { dur: 2.2, html: s => clip(s, 2.2, `<div class="${wrap}">${brandSm}<div id="whatis" style="font-size:56px;font-weight:700;line-height:1.4;color:#e7e9ee;max-width:920px">${esc(P.whatIs[v.copy])}</div></div>`),
    anims: s => [anim('#whatis', s + 0.2, m, 0.6)] };
  // 혜택 3종
  S.benefits = { dur: 4.4, html: s => clip(s, 4.4, `<div class="${wrap}">${brandSm}<div style="display:flex;flex-direction:column;gap:46px">${P.benefits.map(([t, d]) => `<div class="brow"><div style="font-size:50px;font-weight:800;color:#fff">${esc(t)}</div><div style="font-size:34px;color:#9aa0ad;margin-top:8px">${esc(d)}</div></div>`).join('')}</div></div>`),
    anims: s => [`.fromTo(".brow", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.3, ease: ease }, ${(s + 0.2).toFixed(2)})`] };
  // 혜택 1개만 크게 (스토리 C)
  S.benefitOne = { dur: 2.4, html: s => { const [t, d] = P.benefits[v.copy % P.benefits.length]; return clip(s, 2.4, `<div class="${wrap}">${brandSm}<div id="b1t" style="font-size:64px;font-weight:900;color:#fff">${esc(t)}</div><div id="b1d" style="font-size:38px;color:#9aa0ad;margin-top:18px">${esc(d)}</div></div>`); },
    anims: s => [anim('#b1t', s + 0.15, m, 0.5), anim('#b1d', s + 0.5, m, 0.45)] };
  // 업데이트 (문제→해소 모션 — 릴리스별 핵심)
  S.update = { dur: 6.2, html: s => clip(s, 6.2, `<div class="${wrap}">${brandSm}<div id="ulabel" class="mono" style="display:inline-block;color:${accent};font-size:32px;font-weight:700;padding:8px 24px;border:2px solid ${accent}55;border-radius:12px">${esc(P.updateLabel)} · v${esc(ver)}</div><div id="uprob" style="margin-top:30px;font-size:38px;color:#9aa0ad;font-weight:700"><span style="color:#ef4444;font-weight:800">${P.beforeL}</span> ${esc(prob)}</div><div id="uarrow" style="width:0;height:0;border-left:22px solid transparent;border-right:22px solid transparent;border-top:28px solid ${accent};margin:18px ${v.align === 1 ? '0' : 'auto'}"></div><div id="utheme" style="font-size:46px;color:${accent};font-weight:800"><span style="color:#34d399">${P.afterL}</span> ${esc(theme)}</div><div id="uhead" style="font-size:${headline.length > 26 ? 46 : 54}px;font-weight:800;line-height:1.25;color:#fff;margin-top:14px;max-width:980px">${esc(headline)}</div>${hlHtml}</div>`),
    anims: s => [anim('#ulabel', s + 0.1, m, 0.4), anim('#uprob', s + 0.6, m, 0.45), `.fromTo("#uarrow", { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, ${(s + 1.5).toFixed(2)})`, `.fromTo("#utheme", { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${(s + 2.0).toFixed(2)})`, anim('#uhead', s + 2.6, m, 0.5), `.fromTo(".hl", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.25, ease: ease }, ${(s + 3.2).toFixed(2)})`],
    solveAt: 2.0 };
  // 문제 풀스크린 훅 (스토리 B 시작)
  S.bigProb = { dur: 2.6, html: s => clip(s, 2.6, `<div class="${wrap}"><div id="bp1" style="font-size:42px;color:#ef4444;font-weight:800;letter-spacing:2px">${P.beforeL}</div><div id="bp2" style="font-size:66px;font-weight:900;line-height:1.3;color:#e7e9ee;max-width:940px;margin-top:22px">${esc(prob)}</div></div>`),
    anims: s => [anim('#bp1', s + 0.1, m, 0.4), anim('#bp2', s + 0.45, m, 0.6)] };
  // 해소 (스토리 B — update 압축형: 해결+헤드라인+하이라이트)
  S.solve = { dur: 5.6, html: s => clip(s, 5.6, `<div class="${wrap}">${brandSm}<div id="sv1" style="font-size:48px;color:${accent};font-weight:800"><span style="color:#34d399">${P.afterL}</span> ${esc(theme)}</div><div id="sv2" style="font-size:${headline.length > 26 ? 46 : 54}px;font-weight:800;line-height:1.25;color:#fff;margin-top:16px;max-width:980px">${esc(headline)}</div><div id="sv3" class="mono" style="margin-top:22px;display:inline-block;color:${accent};font-size:30px;font-weight:700;padding:7px 22px;border:2px solid ${accent}55;border-radius:12px">v${esc(ver)} · ${esc(catTag)}</div>${hlHtml}</div>`),
    anims: s => [`.fromTo("#sv1", { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${(s + 0.15).toFixed(2)})`, anim('#sv2', s + 0.7, m, 0.5), anim('#sv3', s + 1.2, m, 0.4), `.fromTo(".hl", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.25, ease: ease }, ${(s + 1.7).toFixed(2)})`],
    solveAt: 0.15 };
  // 질문 훅 (스토리 C 시작)
  S.question = { dur: 2.4, html: s => clip(s, 2.4, `<div class="${wrap}"><div id="q1" style="font-size:44px;color:${accent};font-weight:800;letter-spacing:2px">Q.</div><div id="q2" style="font-size:64px;font-weight:900;line-height:1.32;color:#fff;max-width:940px;margin-top:20px">${esc(P.question[v.copy])}</div></div>`),
    anims: s => [anim('#q1', s + 0.1, 2, 0.35), anim('#q2', s + 0.4, m, 0.6)] };
  // 버전 빅넘버 훅 (스토리 D 시작)
  S.bigVer = { dur: 2.0, html: s => clip(s, 2.0, `<div class="center"><div id="bv1" style="font-family:mono;font-size:150px;font-weight:700;color:${accent};letter-spacing:-4px">v${esc(ver)}</div><div id="bv2" style="margin-top:18px;font-size:42px;font-weight:800;color:#e7e9ee">leerness</div><div style="margin-top:20px">${chip('bv3')}</div></div>`),
    anims: s => [`.fromTo("#bv1", { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.55, ease: "power3.out" }, ${(s + 0.05).toFixed(2)})`, anim('#bv2', s + 0.5, m, 0.4), anim('#bv3', s + 0.75, 2, 0.3, '"back.out(1.6)"')] };
  // 왜 좋아졌나 (스토리 D — 테마 크게)
  S.why = { dur: 2.4, html: s => clip(s, 2.4, `<div class="${wrap}">${brandSm}<div id="wh1" style="font-size:38px;color:#9aa0ad;font-weight:700">${P.whyL}</div><div id="wh2" style="font-size:62px;font-weight:900;color:${accent};margin-top:18px">${esc(theme)}</div></div>`),
    anims: s => [anim('#wh1', s + 0.15, m, 0.4), `.fromTo("#wh2", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.5)" }, ${(s + 0.5).toFixed(2)})`] };
  // CTA
  S.cta = { dur: 3.0, html: s => clip(s, 3.0, `<div class="center"><div id="ctatop" style="font-size:52px;color:#e7e9ee;font-weight:700">${esc(P.ctaTop[v.copy])}</div><div id="ctacmd" style="margin-top:36px;background:#13151c;border:2px solid ${accent};border-radius:18px;padding:30px 40px;font-family:mono;font-size:46px;color:${accent}">npm i -g leerness</div><div id="ctasite" style="margin-top:44px;font-size:56px;font-weight:800;color:#fff">leerness.com</div></div>`),
    anims: s => [anim('#ctatop', s + 0.1, m, 0.4), `.fromTo("#ctacmd", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: ease }, ${(s + 0.4).toFixed(2)})`, anim('#ctasite', s + 0.8, m, 0.4)] };

  // ── 스토리 4종 — 씬 시퀀스가 다름 (UR-0050 핵심: 구성 자체의 변주) ──
  const STORIES = [
    ['brand', 'whatIs', 'benefits', 'update', 'cta'],          // A 브랜드-퍼스트 (클래식)
    ['bigProb', 'solve', 'whatIs', 'cta'],                     // B 업데이트-퍼스트 (문제 훅)
    ['question', 'solve', 'benefitOne', 'brand', 'cta'],       // C 질문 훅
    ['bigVer', 'update', 'why', 'cta'],                        // D 버전 빅넘버 훅
  ];
  return STORIES[v.story].map(k => ({ key: k, ...S[k] }));
}

// ── 배경 변주 (글리프 무관 — CSS 그라데이션만) ──
function bgStyle(accent, bg) {
  if (bg === 1) return `linear-gradient(180deg, ${accent}24 0%, #0a0b0e 46%), #0a0b0e`;
  if (bg === 2) return `linear-gradient(135deg, ${accent}21 0%, #0a0b0e 52%), #0a0b0e`;
  return `radial-gradient(circle at 50% 26%, ${accent}1f, #0a0b0e 60%), #0a0b0e`;
}

// 릴리스+언어+변주 → 완전한 HyperFrames HTML 컴포지션 (1080x1920 세로)
function buildHtml(rel, lang, variant) {
  const v = variant || variantFor(rel.version, null);
  const cat = CAT[rel.category] || CAT.fix; const accent = cat.a;
  const scenes = buildScenes(rel, lang, v);
  let t = 0; const placed = [];
  for (const sc of scenes) { placed.push({ ...sc, start: t }); t += sc.dur; }
  const TOTAL = +t.toFixed(2);
  const sceneHtml = placed.map(sc => sc.html(sc.start)).join('\n      ');
  const animLines = placed.flatMap(sc => sc.anims(sc.start)).join('\n        ');
  // 효과음: 두 번째 씬부터 각 씬 시작 + 해소 순간(update/solve) 강조음
  const sfxStarts = placed.slice(1).map(sc => sc.start);
  let solveScene = placed.find(sc => sc.solveAt != null);
  // 강조음이 씬 시작 효과음(0.2s)과 겹치면 생략 — track 1 중첩은 lint error (solve 씬의 solveAt 이 작을 때 발생)
  if (solveScene && sfxStarts.some(s => Math.abs((solveScene.start + solveScene.solveAt) - s) < 0.25)) solveScene = null;
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
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: ${bgStyle(accent, v.bg)}; }
      body { font-family: "Noto Sans KR", sans-serif; color: #e7e9ee; }
      .mono, [style*="mono"] { font-family: "JetBrains Mono", "Noto Sans KR", monospace; }
      .scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 80px; }
      .center { text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; }
      .leftbox { text-align: left; width: 100%; display: flex; flex-direction: column; align-items: flex-start; padding-left: 40px; }
      .brandsm { position: absolute; top: 90px; left: 0; right: 0; text-align: center; font-family: "JetBrains Mono", monospace; font-size: 36px; font-weight: 700; color: #e7e9ee; }
      .hls { margin-top: 30px; display: flex; flex-direction: column; gap: 16px; align-items: ${v.align === 1 ? 'flex-start' : 'center'}; }
      .hl { font-size: 36px; color: #c7ccd6; max-width: 960px; line-height: 1.3; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <!-- BGM (track 0) + 씬 효과음 (track 1) — audio 는 id 필수(없으면 렌더 무음) -->
      <audio id="bgm" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-volume="0.5" src="assets/bgm.wav"></audio>
      ${sfxStarts.map((s, i) => `<audio id="sfx${i}" class="clip" data-start="${s.toFixed(2)}" data-duration="0.2" data-track-index="1" data-volume="0.45" src="assets/sfx-pop.wav"></audio>`).join('\n      ')}
      ${solveScene ? `<audio id="sfxsolve" class="clip" data-start="${(solveScene.start + solveScene.solveAt).toFixed(2)}" data-duration="0.2" data-track-index="1" data-volume="0.55" src="assets/sfx-pop.wav"></audio>` : ''}
      ${sceneHtml}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const ease = "power2.out";
      tl${animLines};
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
  const queued = q && (Array.isArray(q.items) ? q.items : (Array.isArray(q.queue) ? q.queue : null));  // 16th 버그헌트 F5
  if (queued && queued.length) return queued;
  const rel = load(path.join(ROOT, 'data', 'releases.json'), { releases: [] }).releases || [];
  return rel.filter(r => r.important).slice(0, parseInt(arg('--limit', '3'), 10) || 3);
}

// 직전 important 릴리스 버전 (변주 중복 회피용) — releases.json 은 최신순
function prevVersionOf(ver) {
  const rels = (load(path.join(ROOT, 'data', 'releases.json'), { releases: [] }).releases || []).filter(r => r.important);
  const i = rels.findIndex(r => r.version === ver);
  return i >= 0 && rels[i + 1] ? rels[i + 1].version : null;
}

function main() {
  if (!fs.existsSync(HF)) { console.error('✗ video-hf/ 없음'); process.exit(1); }
  const adir = path.join(HF, 'assets'); fs.mkdirSync(adir, { recursive: true });
  for (const f of ['bgm.wav', 'sfx-pop.wav']) { const s = path.join(ROOT, 'public', f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(adir, f)); }
  const limit = parseInt(arg('--limit', '3'), 10) || 3;
  const fps = arg('--fps', '60');
  const releases = pickReleases().slice(0, limit);
  if (!releases.length) { console.log('렌더할 릴리스 없음 — skip'); return; }
  const STORY_NAMES = ['brand-first', 'problem-hook', 'question-hook', 'bignum-hook'];
  const rendered = [];
  for (const rel of releases) {
    const variant = variantFor(rel.version, prevVersionOf(rel.version));
    console.log(`  ▶ ${rel.version} 변주: story=${STORY_NAMES[variant.story]} bg=${variant.bg} copy=${variant.copy} motion=${variant.motion} align=${variant.align === 1 ? 'left' : 'center'}`);
    for (const lang of ['ko', 'en']) {
      const html = buildHtml(rel, lang, variant);
      fs.writeFileSync(path.join(HF, 'index.html'), html);
      const chk = cp.spawnSync('npx hyperframes lint', { cwd: HF, encoding: 'utf8', shell: true, timeout: 180000 });
      const chkOut = (chk.stdout || '') + (chk.stderr || '');
      const lintOk = /0 error\(s\)/.test(chkOut) || (chk.status === 0 && !/[1-9]\d* error/.test(chkOut));
      console.log(`  ${lintOk ? '✓' : '✗'} ${rel.version}/${lang} lint${lintOk ? ' (0 error)' : '\n' + chkOut.split('\n').slice(-10).join('\n')}`);
      if (HAS('--check-only')) { rendered.push({ version: rel.version, lang, checkOnly: true, lintOk, variant }); continue; }
      if (!lintOk) { rendered.push({ version: rel.version, lang, lintOk: false, variant }); continue; }
      const outFile = path.join('out', `${rel.version}-${lang}.mp4`);
      const r = cp.spawnSync(`npx hyperframes render -f ${fps} -o ${JSON.stringify(outFile)}`, { cwd: HF, encoding: 'utf8', shell: true, timeout: 600000 });
      const ok = r.status === 0 && fs.existsSync(path.join(HF, outFile));
      console.log(`  ${ok ? '✓' : '✗'} ${rel.version}/${lang} render → ${outFile}`);
      // 썸네일: 해소/업데이트 씬 부근 프레임 — 구성마다 시점이 다르므로 총길이 70% 지점 사용
      let thumb = null;
      if (ok) {
        const scenes = buildScenes(rel, lang, variant);
        const total = scenes.reduce((a, s) => a + s.dur, 0);
        const ts = (total * 0.55).toFixed(1);
        const thumbAbs = path.join(HF, 'out', `${rel.version}-${lang}.jpg`);
        const tr = cp.spawnSync(`ffmpeg -y -ss ${ts} -i ${JSON.stringify(outFile)} -frames:v 1 -q:v 2 ${JSON.stringify(path.join('out', `${rel.version}-${lang}.jpg`))}`, { cwd: HF, encoding: 'utf8', shell: true, timeout: 60000 });
        if (tr.status === 0 && fs.existsSync(thumbAbs)) thumb = path.relative(ROOT, thumbAbs).replace(/\\/g, '/');
      }
      rendered.push({ version: rel.version, lang, file: path.relative(ROOT, path.join(HF, outFile)).replace(/\\/g, '/'), thumb, title: rel.title, summary: rel.summary, categoryKo: rel.categoryKo, categoryEn: rel.categoryEn, major: !!rel.important, ok, variant: { ...variant, storyName: STORY_NAMES[variant.story] } });
    }
  }
  const out = { generated: '', engine: 'hyperframes', items: rendered };
  if (!HAS('--check-only')) {  // 16th 버그헌트 F8
    fs.writeFileSync(path.join(ROOT, 'data', 'rendered.json'), JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, 'data', 'rendered-hf.json'), JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`\n${HAS('--check-only') ? 'lint' : '렌더'} 완료: ${rendered.length}건 → data/rendered.json`);
}

if (require.main === module) main();
module.exports = { buildHtml, buildScenes, variantFor, seedOf };
