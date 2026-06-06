#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * auth-youtube.js — YouTube 업로드용 OAuth2 refresh token 1회 발급 헬퍼 (0 deps, Node 내장만)
 *
 * client id/secret 만으론 헤드리스 업로드 불가 → 사용자가 1회 브라우저 동의 후 refresh token 발급.
 * 발급된 토큰을 .env 의 YOUTUBE_REFRESH_TOKEN 에 추가하면 파이프라인이 무인 업로드 가능.
 *
 * 사전 준비 (GCP 콘솔, PROJECT_ID):
 *   1) YouTube Data API v3 사용 설정.
 *   2) OAuth 클라이언트(데스크톱 또는 웹) — 웹이면 redirect URI 에 http://localhost:53682 추가.
 *   3) OAuth 동의화면에 본인 Google 계정을 test user 로 등록(미게시 앱).
 *
 * 사용: cd leerness-site && node pipeline/auth-youtube.js
 *   (.env 의 YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET 자동 로드 — 루트 또는 leerness-site/.env)
 */
const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

// .env 간이 로더 (루트 → leerness-site 순, 값에 = 포함 허용)
function loadEnv() {
  const candidates = [path.resolve(__dirname, '..', '..', '.env'), path.resolve(__dirname, '..', '.env')];
  const env = {};
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function postForm(hostname, pathname, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request({ hostname, path: pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('token 응답 파싱 실패: ' + d.slice(0, 200))); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  const env = loadEnv();
  const clientId = env.YOUTUBE_CLIENT_ID;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('✗ .env 에 YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 필요 (루트 또는 leerness-site/.env)');
    process.exit(1);
  }
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
  }).toString();

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, REDIRECT);
    const code = u.searchParams.get('code');
    if (!code) { res.writeHead(400); res.end('no code'); return; }
    try {
      const tok = await postForm('oauth2.googleapis.com', '/token', {
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: 'authorization_code',
      });
      if (tok.refresh_token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>✓ leerness YouTube 인증 완료</h2><p>터미널에 표시된 refresh token 을 .env 에 추가하세요. 이 창은 닫아도 됩니다.</p>');
        console.log('\n✓ refresh token 발급 완료. 아래를 .env 에 추가하세요:\n');
        console.log(`YOUTUBE_REFRESH_TOKEN=${tok.refresh_token}\n`);
        console.log('(보안: refresh token 은 절대 커밋 금지 — .env 는 .gitignore 보호 확인)');
      } else {
        res.writeHead(200); res.end('refresh_token 없음 — prompt=consent 재시도 필요');
        console.error('✗ refresh_token 미반환:', JSON.stringify(tok).slice(0, 200));
      }
    } catch (e) {
      res.writeHead(500); res.end('error');
      console.error('✗ 토큰 교환 실패:', e.message);
    } finally {
      setTimeout(() => { server.close(); process.exit(0); }, 500);
    }
  });
  server.listen(PORT, () => {
    console.log(`# leerness YouTube OAuth 헬퍼`);
    console.log(`로컬 콜백 대기: ${REDIRECT}`);
    console.log(`브라우저에서 동의화면을 엽니다. 안 열리면 아래 URL 수동 접속:\n${authUrl}\n`);
    openBrowser(authUrl);
  });
}

if (require.main === module) main();
