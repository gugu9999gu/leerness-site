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

  // important + 아직 한/영 둘 다 게시 안 된 릴리스 (양언어 정책)
  const langs = ['ko', 'en'];
  // 주요/대규모/안정화 = 영상으로 알릴만한 → 유튜브 전체공개. 그 외(소소한 fix/refactor/feature·consistency) → unlisted.
  //  핵심 카테고리(보안/데이터무결성/호환/성능)는 항상 public. feature 는 "주요 마커"(안정화/Stable/대규모/major/🎉) 있을 때만 public —
  //  README 배너 같은 소소한 feature 까지 전체공개되던 과확장 방지(사용자 의도: 주요/대규모/안정화만 전체공개).
  const CORE_PUBLIC = new Set(['security', 'data-integrity', 'compat', 'performance']);
  const MAJOR_MARK = /안정화|stable|대규모|major|마일스톤|milestone|🎉|🛡️|🛡/i;
  const queue = [];
  for (const r of (rel.releases || [])) {
    if (!r.important) continue;
    const text = `${r.title || ''} ${r.summary || ''} ${(r.highlights || []).join(' ')}`;
    const major = CORE_PUBLIC.has(r.category) || MAJOR_MARK.test(text);
    const privacy = major ? 'public' : 'unlisted';
    for (const lang of langs) {
      if (publishedSet.has(`${r.version}:${lang}`)) continue;
      queue.push({ version: r.version, lang, date: r.date, title: r.title, summary: r.summary, highlights: r.highlights, category: r.category, categoryKo: r.categoryKo, categoryEn: r.categoryEn, major, privacy });
    }
  }
  // 최신 우선 + limit (YouTube 쿼터 1600u/업로드, 기본 10k/일 보호)
  const sliced = queue.slice(0, limit);
  fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), total: queue.length, queued: sliced.length, items: sliced }, null, 2) + '\n');
  console.log(`✓ 영상 큐: ${sliced.length}/${queue.length} (important 미게시, 한/영) → ${path.relative(process.cwd(), outPath)}`);
  if (sliced[0]) console.log(`  다음: ${sliced[0].version} [${sliced[0].lang}] ${sliced[0].title.slice(0, 45)}`);
}

if (require.main === module) main();
module.exports = { main };
