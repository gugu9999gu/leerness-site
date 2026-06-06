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
  const queue = [];
  for (const r of (rel.releases || [])) {
    if (!r.important) continue;
    for (const lang of langs) {
      if (publishedSet.has(`${r.version}:${lang}`)) continue;
      queue.push({ version: r.version, lang, date: r.date, title: r.title, summary: r.summary, highlights: r.highlights, category: r.category, categoryKo: r.categoryKo, categoryEn: r.categoryEn });
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
