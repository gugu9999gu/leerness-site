#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * curate.js — releases.json 에서 "중요 업데이트"를 선별해 영상 제작 큐 생성 (0 deps)
 *
 * 사용자 결정(트리거 정책): "중요 업데이트 큐레이션" — 데이터무결성/보안/신기능/호환성 등
 * important=true 인 릴리스만 영상화. 이미 게시된 것은 data/published.json 원장으로 중복 제외.
 *
 * 사용: node pipeline/curate.js [--limit N]
 * 출력: data/video-queue.json (아직 게시 안 된 important 릴리스 목록, 최신순)
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
function parseLimit(raw, def) { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : def; }  // leerness 1.9.407 교훈

function load(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } }

function main() {
  const here = __dirname;
  const releasesPath = path.resolve(here, '..', 'data', 'releases.json');
  const publishedPath = path.resolve(here, '..', 'data', 'published.json');
  const outPath = path.resolve(here, '..', 'data', 'video-queue.json');
  const limit = parseLimit(arg('--limit', '20'), 20);

  const rel = load(releasesPath, { releases: [] });
  const published = load(publishedPath, { videos: [] });   // [{version, lang, youtubeId, at}]
  const publishedSet = new Set((published.videos || []).map(v => `${v.version}:${v.lang}`));

  // UR-0158 (사용자 정책): 영상은 "알릴만한 이슈"(대규모 업데이트/안정화/마일스톤/보안 등)일 때만 그 내용으로 생성.
  //   newsworthy = 핵심 카테고리(보안/데이터무결성/호환/성능) OR 주요 마커(안정화/Stable/대규모/major/마일스톤/🎉/🛡).
  //   routine(fix/refactor/chore/소소한 feature)은 영상 미생성(큐 제외) — 일부공개도 X. 모든 큐 항목은 newsworthy → 전체공개(public).
  const langs = ['ko', 'en'];
  const CORE_PUBLIC = new Set(['security', 'data-integrity', 'compat', 'performance']);
  const MAJOR_MARK = /안정화|stable|대규모|major|마일스톤|milestone|🎉|🛡️|🛡/i;
  const isNewsworthy = (r) => CORE_PUBLIC.has(r.category) || MAJOR_MARK.test(`${r.title || ''} ${r.summary || ''} ${(r.highlights || []).join(' ')}`);
  const queue = [];
  let skippedRoutine = 0;
  for (const r of (rel.releases || [])) {
    if (!r.important) continue;
    if (!isNewsworthy(r)) { skippedRoutine++; continue; }  // 알릴만한 이슈 아님 → 영상 미생성
    for (const lang of langs) {
      if (publishedSet.has(`${r.version}:${lang}`)) continue;
      // newsworthy 만 큐잉되므로 major:true · privacy:'public'
      queue.push({ version: r.version, lang, date: r.date, title: r.title, summary: r.summary, highlights: r.highlights, category: r.category, categoryKo: r.categoryKo, categoryEn: r.categoryEn, major: true, privacy: 'public' });
    }
  }
  // 최신 우선 + limit (YouTube 쿼터 1600u/업로드, 기본 10k/일 보호)
  const sliced = queue.slice(0, limit);
  fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), total: queue.length, queued: sliced.length, items: sliced }, null, 2) + '\n');
  console.log(`✓ 영상 큐: ${sliced.length}/${queue.length} (newsworthy 미게시, 한/영) · routine 제외 ${skippedRoutine}건(영상 미생성) → ${path.relative(process.cwd(), outPath)}`);
  if (sliced[0]) console.log(`  다음: ${sliced[0].version} [${sliced[0].lang}] ${sliced[0].title.slice(0, 45)}`);
  else console.log('  (게시 대상 newsworthy 릴리스 없음 — 영상 생성 안 함)');
}

if (require.main === module) main();
module.exports = { main };
