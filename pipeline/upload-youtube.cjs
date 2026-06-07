#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * upload-youtube.cjs — data/rendered.json 의 mp4 들을 YouTube Shorts 로 업로드 (0 deps, https 만)
 *
 * refresh token 으로 access token 획득 → resumable upload(videos.insert) → 영상 ID 회수 →
 * data/published.json 원장에 기록(curate 중복 제외용). 한/영 제목·설명·#Shorts 태그 자동.
 *
 * 사용: cd leerness-site && node pipeline/upload-youtube.cjs [--limit N]
 * 요구 .env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *   (refresh token 은 `node pipeline/auth-youtube.cjs` 로 1회 발급)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');

function arg(name, def) { const i = process.argv.indexOf(name); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def; }
function parseLimit(raw, def) { const n = parseInt(raw, 10); return Number.isFinite(n) && n > 0 ? n : def; }

function loadEnv() {
  const env = {};
  for (const f of [path.resolve(__dirname, '..', '..', '.env'), path.resolve(__dirname, '..', '.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function reqJson(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, json: d ? JSON.parse(d) : null }); } catch { resolve({ status: res.statusCode, headers: res.headers, raw: d }); } }); });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}

async function getAccessToken(env) {
  const body = new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await reqJson({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, body);
  if (!r.json || !r.json.access_token) throw new Error('access token 획득 실패: ' + JSON.stringify(r.json || r.raw).slice(0, 200));
  return r.json.access_token;
}

const PRIVACY = (() => { const i = process.argv.indexOf('--privacy'); const v = i >= 0 ? process.argv[i + 1] : 'public'; return ['public', 'unlisted', 'private'].includes(v) ? v : 'public'; })();  // 1차 검토용 --privacy unlisted 지원

function meta(item) {
  const ko = item.lang === 'ko';
  const title = `leerness v${item.version} — ${item.title}`.slice(0, 100);
  const desc = [
    ko ? `leerness ${item.version} 업데이트` : `leerness ${item.version} update`,
    item.summary || '',
    '',
    ko ? '설치: npm i -g leerness' : 'Install: npm i -g leerness',
    'https://leerness.com',
    'https://github.com/gugu9999gu/leerness',
    '',
    '#leerness #AI #devtools #CLI #Shorts',
  ].join('\n').slice(0, 5000);
  return { snippet: { title, description: desc, tags: ['leerness', 'AI', 'devtools', 'CLI'], categoryId: '28', defaultLanguage: item.lang }, status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false } };
}

// resumable upload: 1) 세션 시작 2) 파일 PUT
function uploadVideo(accessToken, metadata, filePath) {
  return new Promise((resolve, reject) => {
    const metaBody = JSON.stringify(metadata);
    const stat = fs.statSync(filePath);
    const initReq = https.request({
      hostname: 'www.googleapis.com', path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(metaBody), 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': stat.size },
    }, res => {
      const loc = res.headers.location;
      res.on('data', () => {}); res.on('end', () => {});
      if (res.statusCode !== 200 || !loc) return reject(new Error('resumable 세션 시작 실패: status ' + res.statusCode));
      const u = new URL(loc);
      const put = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': stat.size } }, pres => {
        let d = ''; pres.on('data', c => d += c); pres.on('end', () => { try { const j = JSON.parse(d); j.id ? resolve(j.id) : reject(new Error('업로드 응답에 id 없음: ' + d.slice(0, 200))); } catch { reject(new Error('업로드 응답 파싱 실패: ' + d.slice(0, 200))); } });
      });
      put.on('error', reject);
      fs.createReadStream(filePath).pipe(put);
    });
    initReq.on('error', reject); initReq.write(metaBody); initReq.end();
  });
}

async function main() {
  const env = loadEnv();
  for (const k of ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']) {
    if (!env[k]) { console.error(`✗ .env 에 ${k} 필요. (refresh token 은 node pipeline/auth-youtube.cjs 로 발급)`); process.exit(1); }
  }
  const root = path.resolve(__dirname, '..');
  const rendered = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rendered.json'), 'utf8'));
  const items = (rendered.items || []).filter(i => fs.existsSync(i.file)).slice(0, parseLimit(arg('--limit', '6'), 6));
  if (!items.length) { console.log('업로드할 렌더 파일 없음 (data/rendered.json)'); return; }

  const token = await getAccessToken(env);
  const publishedPath = path.join(root, 'data', 'published.json');
  let published = { videos: [] }; try { published = JSON.parse(fs.readFileSync(publishedPath, 'utf8')); } catch {}
  for (const it of items) {
    try {
      console.log(`▶ upload ${it.version} [${it.lang}] ${path.basename(it.file)}`);
      const id = await uploadVideo(token, meta(it), it.file);
      console.log(`  ✓ https://youtube.com/shorts/${id}`);
      published.videos.push({ version: it.version, lang: it.lang, youtubeId: id, at: new Date().toISOString().slice(0, 10) });
    } catch (e) { console.error(`  ✗ 실패: ${e.message}`); }
  }
  fs.writeFileSync(publishedPath, JSON.stringify(published, null, 2) + '\n');
  console.log(`✓ published.json 갱신 (총 ${published.videos.length})`);
}

if (require.main === module) main().catch(e => { console.error('✗', e.message); process.exit(1); });
