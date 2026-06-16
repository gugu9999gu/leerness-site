#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * verify-deploy.cjs — 배포 후 production(leerness.com) 이 방금 빌드한 최신 릴리스를 노출하는지 검증.
 *
 * 배경(근본원인): wrangler pages deploy 가 --branch 누락 시 CI(detached HEAD)에서 production 브랜치
 *   추론에 실패해 preview(<hash>.pages.dev)로만 배포됨. 그 결과 leerness.com(production) 이 옛 배포에
 *   동결되는데, continue-on-error 로 CI 는 계속 'success' 를 보고 → green-but-stale(정직성 위반).
 *   이 스크립트는 배포 직후 live production HTML 에 releases.json 최신 버전이 실제로 노출되는지
 *   CDN 전파를 감안해 재시도 확인하고, 불일치 시 exit 1 로 run 을 실패시켜 동결을 가시화한다.
 *
 * 사용: node pipeline/verify-deploy.cjs [--url https://leerness.com] [--expect 1.31.2]
 *                                       [--retries 6] [--delay 15000] [--releases ./data/releases.json]
 *   --expect 미지정 시 releases.json 의 최신(releases[0].version) 을 기대값으로 사용.
 * 0 런타임 deps (Node 18+ 내장 fetch).
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function expectedVersion() {
  const explicit = arg('--expect', null);
  if (explicit) return explicit;
  const relPath = path.resolve(process.cwd(), arg('--releases', './data/releases.json'));
  if (!fs.existsSync(relPath)) {
    console.error(`✗ releases.json 없음: ${relPath} (--expect <version> 로 명시 가능)`);
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(relPath, 'utf8'));
  const releases = data.releases || (Array.isArray(data) ? data : []);
  const v = releases[0] && releases[0].version;
  if (!v) { console.error('✗ releases.json 에서 최신 버전을 찾지 못함'); process.exit(2); }
  return v;
}

async function fetchText(url) {
  // 캐시버스트 — CDN(특히 production 도메인)이 옛 HTML 을 돌려주지 않도록.
  const bust = (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(url + bust, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  if (typeof fetch !== 'function') { console.error('✗ 이 Node 버전엔 전역 fetch 없음 (Node 18+ 필요)'); process.exit(2); }
  const url = arg('--url', 'https://leerness.com');
  const expect = expectedVersion();
  const retries = parseInt(arg('--retries', '6'), 10);
  const delay = parseInt(arg('--delay', '15000'), 10);
  // 정확 매칭: 'v1.31.2' 또는 '1.31.2' 가 더 긴 버전의 접두어로 오탐되지 않게 경계 확인.
  const re = new RegExp('v?' + expect.replace(/\./g, '\\.') + '(?![0-9.])');

  console.log(`# verify-deploy — url=${url} expect=${expect} (retries=${retries}, delay=${delay}ms)`);
  let lastSeen = '(none)';
  for (let i = 1; i <= retries; i++) {
    let html = '';
    try { html = await fetchText(url); }
    catch (e) { console.log(`  [${i}/${retries}] fetch 실패: ${e.message}`); await sleep(delay); continue; }
    if (re.test(html)) {
      console.log(`✓ production 이 최신 버전(${expect}) 노출 확인 — 시도 ${i}/${retries}`);
      process.exit(0);
    }
    const seen = (html.match(/v?\d+\.\d+\.\d+/g) || []);
    // 페이지에서 관측된 최대 버전(디버그용)
    const cmp = (a, b) => a.split('.').map(Number).reduce((acc, n, k) => acc || (n - (b.split('.').map(Number)[k] || 0)), 0);
    const norm = seen.map((s) => s.replace(/^v/, '')).filter((s) => /^\d+\.\d+\.\d+$/.test(s));
    lastSeen = norm.length ? norm.reduce((m, v) => (cmp(v, m) > 0 ? v : m), norm[0]) : '(none)';
    console.log(`  [${i}/${retries}] 아직 미반영 — 페이지 최대 버전: ${lastSeen} (CDN 전파 대기)`);
    if (i < retries) await sleep(delay);
  }
  // GitHub Actions 주석 + 실패 — green-but-stale 차단.
  console.log(`::error title=leerness.com 배포 동결 감지::production(${url}) 이 최신 ${expect} 미노출 (관측 최대 ${lastSeen}). wrangler --branch=main(production) 배포 여부 확인 필요.`);
  console.error(`✗ production 이 최신 버전(${expect}) 미노출 — ${retries}회 재시도 후 실패 (관측 최대 ${lastSeen})`);
  process.exit(1);
}

if (require.main === module) main();
module.exports = { expectedVersion };
