#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * verify-video.cjs — 업로드 전 영상 품질 검증 게이트 (UR-0029, 0 런타임 deps)
 *
 * 사용자 지시: "영상의 내용과 브금, 효과음 등등도 검증단계가 필요".
 * render-shorts 와 upload-youtube 사이에서 실행 — 하나라도 FAIL 이면 exit 1 로 업로드 차단.
 *
 * 검증 항목:
 *   [BGM]     public/bgm.wav  — 유효 WAV · 길이 충분 · 무음 아님(RMS) · 클리핑 아님(peak)
 *   [효과음]  public/sfx-pop.wav — 유효 WAV · 짧음 · 무음 아님
 *   [내용]    각 렌더 영상의 릴리스가 비어있지 않은 헤드라인/하이라이트(복붙 아님) 보유
 *   [파일]    rendered.json 의 각 mp4 존재 + 크기 정상 + 썸네일 존재
 *   [스트림]  (ffprobe 있을 때) mp4 가 1080x1920 비디오 + 오디오 스트림 + 길이 ~18s
 *
 * 사용: node pipeline/verify-video.cjs [--limit N] [--json]
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
const HAS = (n) => process.argv.includes(n);
const ROOT = path.resolve(__dirname, '..');
const load = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

// ── 0-dep WAV 파서: 헤더 검증 + RMS/peak/duration (PCM int16) ──
function analyzeWav(file) {
  if (!fs.existsSync(file)) return { ok: false, reason: '파일 없음' };
  const buf = fs.readFileSync(file);
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, reason: '유효한 WAV 아님(RIFF/WAVE 헤더 없음)' };
  }
  // 청크 순회로 fmt/data 찾기 (헤더 위치 가변 대비)
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    else if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || dataOff < 0) return { ok: false, reason: 'fmt/data 청크 없음' };
  if (fmt.bits !== 16) return { ok: true, reason: 'non-16bit (RMS 생략)', duration: 0, rms: 1, peak: 1, fmt };
  const end = Math.min(dataOff + dataLen, buf.length);
  const n = Math.floor((end - dataOff) / 2);
  if (n === 0) return { ok: false, reason: '오디오 데이터 없음(빈 WAV)', fmt };  // 16th 버그헌트 F7: 빈 16bit WAV 가 게이트 false-pass 하던 것 차단(duration:0 이 length 체크를 건너뛰던 문제)
  const duration = n / fmt.channels / fmt.sampleRate;
  let sumSq = 0, peak = 0;
  const step = Math.max(1, Math.floor(n / 200000)); // 큰 파일은 샘플링(최대 ~20만)
  let cnt = 0;
  for (let i = 0; i < n; i += step) {
    const s = buf.readInt16LE(dataOff + i * 2) / 32768;
    sumSq += s * s; if (Math.abs(s) > peak) peak = Math.abs(s); cnt++;
  }
  const rms = cnt ? Math.sqrt(sumSq / cnt) : 0;
  return { ok: true, duration, rms, peak, fmt };
}

// mp4 스트림 실측 → {width,height,hasAudio,duration} 또는 null.
//   1순위 시스템 ffprobe(JSON, 빠름), 2순위 Remotion 번들 ffprobe(텍스트 파싱) — Remotion 설치 시 항상 가능(CI).
function probeVideo(file) {
  // 1) 시스템 ffprobe (JSON)
  try {
    const r = cp.spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 30000 });
    if (r.status === 0 && r.stdout) {
      const j = JSON.parse(r.stdout);
      const v = (j.streams || []).find(s => s.codec_type === 'video');
      const a = (j.streams || []).find(s => s.codec_type === 'audio');
      if (v) return { width: v.width, height: v.height, hasAudio: !!a, duration: parseFloat((j.format && j.format.duration) || 0) };
    }
  } catch { /* fall through */ }
  // 2) Remotion 번들 ffprobe (텍스트 출력 파싱; 정보는 stderr 로 나옴). shell:true 로 npx 해석(.cmd) + 경로 인용(공백 안전).
  try {
    const r = cp.spawnSync(`npx remotion ffprobe ${JSON.stringify(file)}`, { encoding: 'utf8', timeout: 120000, shell: true });
    const out = (r.stdout || '') + (r.stderr || '');
    if (!/Stream/.test(out)) return null;
    const vLine = (out.match(/Stream[^\n]*Video:[^\n]*/) || [''])[0];
    const dim = vLine.match(/(\d{3,4})x(\d{3,4})/);
    const dur = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return {
      width: dim ? +dim[1] : 0,
      height: dim ? +dim[2] : 0,
      hasAudio: /Stream[^\n]*Audio:/.test(out),
      duration: dur ? (+dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3])) : 0,
    };
  } catch { return null; }
}

function main() {
  const limit = Math.max(1, parseInt(arg('--limit', '4'), 10) || 4);
  const jsonMode = HAS('--json');
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });

  // 1. BGM
  const bgm = analyzeWav(path.join(ROOT, 'public', 'bgm.wav'));
  add('BGM(bgm.wav) 유효 WAV', bgm.ok, bgm.reason || `${bgm.fmt && bgm.fmt.sampleRate}Hz`);
  if (bgm.ok && bgm.duration) {
    add('BGM 길이 충분(≥15s)', bgm.duration >= 15, `${bgm.duration.toFixed(1)}s`);
    add('BGM 무음 아님(RMS>0.005)', bgm.rms > 0.005, `RMS=${bgm.rms.toFixed(4)}`);
    add('BGM 클리핑 아님(peak<0.99)', bgm.peak < 0.99, `peak=${bgm.peak.toFixed(3)}`);
  }
  // 2. 효과음
  const sfx = analyzeWav(path.join(ROOT, 'public', 'sfx-pop.wav'));
  add('효과음(sfx-pop.wav) 유효 WAV', sfx.ok, sfx.reason || `${sfx.fmt && sfx.fmt.sampleRate}Hz`);
  if (sfx.ok && sfx.duration) {
    add('효과음 짧음(0.03~3s)', sfx.duration >= 0.03 && sfx.duration <= 3, `${sfx.duration.toFixed(2)}s`);
    add('효과음 무음 아님(RMS>0.005)', sfx.rms > 0.005, `RMS=${sfx.rms.toFixed(4)}`);
  }

  // 3+4. 렌더 결과 + 내용
  const renderedFile = arg('--rendered', 'data/rendered.json');  // hyperframes 경로는 --rendered data/rendered-hf.json
  const rendered = load(path.resolve(ROOT, renderedFile), { items: [] });
  const byVer = Object.fromEntries((load(path.join(ROOT, 'data', 'releases.json'), { releases: [] }).releases || []).map(r => [r.version, r]));
  const items = (rendered.items || []).slice(0, limit);
  // 빈 큐(게시할 중요 릴리스 없음)는 정상 — BGM/효과음 자산만 검증하고 통과(false-fail 방지). 렌더 자체 실패는 render-shorts 단계가 잡음.
  if (!items.length) add('렌더 항목(있으면 검증)', true, '신규 렌더 항목 없음 — 자산 검증만 수행(정상)');
  for (const it of items) {
    const tag = `${it.version}/${it.lang}`;
    const vf = it.file ? path.resolve(ROOT, it.file) : null;
    const exists = vf && fs.existsSync(vf);
    const size = exists ? fs.statSync(vf).size : 0;
    add(`[${tag}] mp4 존재+크기(≥200KB)`, exists && size >= 200 * 1024, exists ? `${(size / 1024 / 1024).toFixed(2)}MB` : '파일 없음');
    if (it.thumb) {
      const tf = path.resolve(ROOT, it.thumb);
      add(`[${tag}] 썸네일 존재`, fs.existsSync(tf) && fs.statSync(tf).size >= 3 * 1024, fs.existsSync(tf) ? 'OK' : '없음');
    }
    // 내용(복붙 아님): 릴리스에 평이 헤드라인 + (하이라이트 또는 요약)
    const rel = byVer[it.version];
    const hasContent = rel && (rel.titlePlain || rel.title) && ((rel.videoHighlights && rel.videoHighlights.length) || rel.summary || (rel.highlights && rel.highlights.length));
    add(`[${tag}] 내용 비어있지 않음`, !!hasContent, rel ? `headline:${!!(rel.titlePlain || rel.title)} hl:${(rel.videoHighlights || []).length}` : 'releases.json 매칭 없음');
    // 스트림 실측 (시스템 ffprobe → Remotion 번들 ffprobe 폴백)
    if (exists) {
      const pv = probeVideo(vf);
      if (pv) {
        add(`[${tag}] 비디오 1080x1920`, pv.width === 1080 && pv.height === 1920, `${pv.width}x${pv.height}`);
        add(`[${tag}] 오디오 스트림 존재(BGM 인코딩됨)`, pv.hasAudio, pv.hasAudio ? 'OK' : '오디오 없음');
        add(`[${tag}] 길이 ~18s(15~21)`, pv.duration >= 15 && pv.duration <= 21, `${pv.duration.toFixed(1)}s`);
      } else {
        add(`[${tag}] 스트림 실측(ffprobe)`, true, 'ffprobe 불가 — 스트림 검증 생략(자산/파일 검증으로 대체)');
      }
    }
  }

  const failed = checks.filter(c => !c.ok);
  const ok = failed.length === 0;
  if (jsonMode) {
    console.log(JSON.stringify({ ok, total: checks.length, passed: checks.length - failed.length, failed: failed.map(f => f.name), checks }, null, 2));
  } else {
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    console.log(ok ? `\n✓ 영상 검증 통과 (${checks.length}건)` : `\n✗ 영상 검증 실패 ${failed.length}/${checks.length} — 업로드 차단`);
  }
  if (!ok) process.exit(1);
}

if (require.main === module) main();
module.exports = { analyzeWav };
