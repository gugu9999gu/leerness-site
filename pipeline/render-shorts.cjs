#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * render-shorts.cjs — video-queue.json 의 각 항목을 Remotion 으로 렌더 (9:16 mp4)
 *
 * 각 큐 항목(버전×언어)에 대해 `npx remotion render ReleaseShort` 를 props 와 함께 실행 →
 * video/out/<version>-<lang>.mp4 생성. 렌더된 목록을 data/rendered.json 에 기록(업로드 단계 입력).
 *
 * 사용: cd leerness-site && node pipeline/render-shorts.cjs [--limit N] [--dry]
 * 요구: npm install (remotion, @remotion/cli) + 헤드리스 Chromium(최초 자동 다운로드).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
function parseLimit(raw, def) { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : def; }
const dry = process.argv.includes('--dry');

function main() {
  const root = path.resolve(__dirname, '..');
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'data', 'video-queue.json'), 'utf8'));
  const items = (queue.items || []).slice(0, parseLimit(arg('--limit', '10'), 10));
  const outDir = path.join(root, 'video', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const rel = JSON.parse(fs.readFileSync(path.join(root, 'data', 'releases.json'), 'utf8'));
  const byVer = Object.fromEntries((rel.releases || []).map(r => [r.version, r]));

  const rendered = [];
  for (const it of items) {
    const r = byVer[it.version] || it;
    const props = {
      version: r.version, date: r.date, title: it.title, summary: it.summary || r.summary,
      highlights: (it.highlights || r.highlights || []).slice(0, 3),
      categoryKo: r.categoryKo, categoryEn: r.categoryEn, lang: it.lang,
    };
    const outFile = path.join(outDir, `${r.version}-${it.lang}.mp4`);
    console.log(`▶ render ${r.version} [${it.lang}] → ${path.relative(root, outFile)}`);
    if (dry) { rendered.push({ ...it, file: outFile, dry: true }); continue; }
    const propsArg = `--props=${JSON.stringify(props)}`;
    const res = spawnSync('npx', ['remotion', 'render', 'video/src/index.ts', 'ReleaseShort', outFile, propsArg], {
      cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (res.status !== 0) { console.error(`✗ render 실패: ${r.version} [${it.lang}]`); continue; }
    rendered.push({ version: r.version, lang: it.lang, title: it.title, summary: props.summary, file: outFile });
  }
  fs.writeFileSync(path.join(root, 'data', 'rendered.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items: rendered }, null, 2) + '\n');
  console.log(`✓ 렌더 ${rendered.length}/${items.length} → data/rendered.json`);
}

if (require.main === module) main();
