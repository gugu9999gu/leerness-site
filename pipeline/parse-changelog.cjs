#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * parse-changelog.js — leerness CHANGELOG.md → data/releases.json (0 runtime deps)
 *
 * leerness-pkg 의 CHANGELOG.md 를 읽기전용으로 파싱해 버전/일자/요약/하이라이트/카테고리를
 * 구조화 JSON 으로 변환한다. Astro 사이트 페이지 생성 + Remotion 영상 스크립트의 단일 데이터 소스.
 *
 * 사용: node pipeline/parse-changelog.js [--changelog <path>] [--out <path>]
 * 기본: --changelog ../leerness-pkg/CHANGELOG.md  --out ./data/releases.json
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}

// BOM strip + CRLF/CR → LF (leerness 1.9.408 교훈: 줄바꿈 정규화)
function normalize(text) {
  return String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

// 제목/요약으로 카테고리 추론 (큐레이션 important 판정에 사용)
// UR-0166: '안정화/Stable/대규모/마일스톤/🎉/🛡' 마커는 최우선 'stable'(중요) 카테고리 — 이전엔 매칭 룰이 없어 안정 minor(1.10.0)가 default 'fix'(important=false)로 분류돼 영상 큐·사이트 중요표시에서 누락됐음.
const CATEGORY_RULES = [
  { key: 'stable', ko: '안정화', en: 'Stable', re: /안정화|stable|대규모|마일스톤|milestone|🎉|🛡️|🛡/i, important: true },
  { key: 'security', ko: '보안', en: 'Security', re: /보안|시크릿|secret|취약|권한경계|injection|크래시|crash|FN|FP/i, important: true },
  { key: 'data-integrity', ko: '데이터무결성', en: 'Data integrity', re: /데이터\s*무결성|injection|lost-update|동시|손상|무결성|data integrity/i, important: true },
  { key: 'feature', ko: '신기능', en: 'Feature', re: /신기능|추가|feature|지원|도입|새/i, important: true },
  { key: 'consistency', ko: '일관성', en: 'Consistency', re: /일관성|--json|구조화|consistency/i, important: false },
  { key: 'performance', ko: '성능', en: 'Performance', re: /성능|perf|O\(N|배치|속도|performance/i, important: false },
  { key: 'compat', ko: '호환성', en: 'Compatibility', re: /호환|Windows|CRLF|BOM|셸|shell|encoding/i, important: true },
  { key: 'refactor', ko: '리팩터', en: 'Refactor', re: /모듈화|리팩터|refactor|분리|추출/i, important: false },
];

function classify(title, summary) {
  const hay = (title || '') + ' ' + (summary || '');
  for (const r of CATEGORY_RULES) if (r.re.test(hay)) return { key: r.key, ko: r.ko, en: r.en, important: r.important };
  return { key: 'fix', ko: '수정', en: 'Fix', important: false };
}

// 영상 캡션용 정제(UR-0023 Phase 1): **볼드 리드**(평이 요약) 우선 추출 → 마크다운/이모지/추적코드/버전 제거.
function cleanVideoHighlight(s, max = 40) {
  let t = String(s || '');
  const bold = t.match(/\*\*\s*([^*]+?)\s*\*\*/);      // 볼드 리드 우선(없으면 콜론/대시 앞부분)
  t = bold ? bold[1] : t.split(/:\s|—|\s-\s/)[0];
  t = t.replace(/\([^)]*(?:[A-Za-z]{1,3}-\d|\d+\.\d+)[^)]*\)/g, ' ');  // 추적코드(UR-/CV-/R-)·버전 든 괄호만 제거 — 설명 괄호('생각하고 코딩' 등)는 보존(UR-0038)
  t = t.replace(/\b\d+\.\d+(?:\.\d+)?\b/g, ' ');       // 버전 번호
  t = t.replace(/[\[\]【】`*#>~|]/g, ' ');             // 마크다운/대괄호
  t = t.replace(/[^\p{Script=Hangul}A-Za-z0-9\s.·/+\-]/gu, ' ');  // 한글/영문/숫자/·(중점 U+00B7)/일부기호만, 이모지·특수 → 공백
  t = t.replace(/\s+/g, ' ').replace(/^[\s/.\-]+/, '').trim();
  t = t.replace(/^(안정화\s*\/?\s*Stable( hotfix)?|Stable( hotfix)?|안정화)\s+/i, '').trim();  // 릴리스 라벨 접두어 제거(헤드라인 가독)
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim();
  return t;
}

function parseChangelog(text) {
  const md = normalize(text);
  const releases = [];
  // '## ' 헤더 위치(코드펜스 무시: CHANGELOG 는 코드펜스 안에 ## 거의 없음 — 안전하게 줄 시작만)
  const lines = md.split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^## \d+\.\d+\.\d+\b/.test(lines[i])) heads.push(i);
  }
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1] : lines.length;
    const block = lines.slice(start, end);
    const headLine = block[0];
    const ver = (headLine.match(/(\d+\.\d+\.\d+)/) || [])[1] || '';
    const date = (headLine.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    // 제목: 날짜 뒤 ' — ' 이후 (없으면 버전 뒤)
    let title = '';
    const afterDate = date ? headLine.split(date)[1] : '';
    if (afterDate) title = afterDate.replace(/^\s*[—-]\s*/, '').trim();
    if (!title) title = headLine.replace(/^##\s*/, '').replace(ver, '').replace(/^\s*[—-]\s*/, '').trim();
    const body = block.slice(1).join('\n').trim();
    // 요약: 첫 **...** 볼드
    const sm = body.match(/\*\*([^*]+)\*\*/);
    const summary = sm ? sm[1].replace(/^[🔌🧭⚡🛡🔒🔐🪟🐚🚦🔧⭐✅🎉\s]+/u, '').trim() : '';
    // 하이라이트: '### 구현' 또는 '- ' 불릿 상위 3개 (영상 캡션용)
    const rawBullets = (body.match(/^[-•]\s+.+$/gm) || []).map(b => b.replace(/^[-•]\s+/, '').trim()).filter(Boolean);
    const highlights = rawBullets.map(b => b.replace(/`/g, '').trim()).slice(0, 3);
    // 영상용 정제 하이라이트(릴리스별 실제 변경 — 복붙 탈피, UR-0023 Phase 1):
    //   불릿의 **볼드 리드** 우선 추출 → (UR-xxxx)/버전/이모지/마크다운 제거 → 첫 구절 ≤34자. 검증/메타 불릿 제외.
    const videoHighlights = rawBullets
      .filter(b => /\*\*[^*]{2,40}\*\*/.test(b))  // 짧은(2~40자) 볼드 리드 불릿 = 큐레이션된 변경 하이라이트(장문 prose/동작변경 노트 제외)
      .filter(b => !/^(selftest|e2e|patch|회귀|검증|verified|npmgate|배포정책)/i.test(b.replace(/[*\s]/g, '')))
      .map(b => cleanVideoHighlight(b))  // 주의: .map(fn) 은 (요소,index,배열) 전달 → max=index 로 잘림. 명시 래핑 필수.
      .filter(t => t.length >= 4)
      .slice(0, 3);
    const cat = classify(title, summary);
    releases.push({
      version: ver,
      date,
      title: title.replace(/`/g, ''),
      titlePlain: cleanVideoHighlight(title, 60),
      summary,
      highlights,
      videoHighlights,
      category: cat.key,
      categoryKo: cat.ko,
      categoryEn: cat.en,
      important: cat.important,
    });
  }
  return releases;
}

function main() {
  const here = __dirname;
  // 명시적 --changelog/--out 은 CWD 기준(표준 CLI 동작) — CI 가 repo 루트에 받은 CHANGELOG.source.md 를 찾을 수 있게.
  //   기본값(미지정)만 스크립트 디렉토리(pipeline/) 기준(로컬: ../../leerness-pkg/CHANGELOG.md).
  const clArg = arg('--changelog', null);
  const outArg = arg('--out', null);
  const changelogPath = clArg ? path.resolve(process.cwd(), clArg) : path.resolve(here, '..', '..', 'leerness-pkg', 'CHANGELOG.md');
  const outPath = outArg ? path.resolve(process.cwd(), outArg) : path.resolve(here, '..', 'data', 'releases.json');
  if (!fs.existsSync(changelogPath)) {
    console.error(`✗ CHANGELOG 없음: ${changelogPath}`);
    process.exit(1);
  }
  const releases = parseChangelog(fs.readFileSync(changelogPath, 'utf8'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: releases.length, releases }, null, 2) + '\n');
  const imp = releases.filter(r => r.important).length;
  console.log(`✓ ${releases.length}개 릴리스 파싱 → ${path.relative(process.cwd(), outPath)} (important: ${imp})`);
  if (releases[0]) console.log(`  최신: ${releases[0].version} (${releases[0].date}) [${releases[0].categoryKo}] ${releases[0].title.slice(0, 50)}`);
}

if (require.main === module) main();
module.exports = { parseChangelog, classify, normalize };
