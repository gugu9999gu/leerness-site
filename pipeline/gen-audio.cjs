#!/usr/bin/env node
// -*- coding: utf-8 -*-
'use strict';
/**
 * gen-audio.cjs — 영상용 무료(CC0) BGM/효과음 자체 생성 (0 deps, WAV PCM 직접 작성).
 *   외부 음원 다운로드/라이선스 위험 0 — 사인 합성으로 잔잔한 앰비언트 패드 + UI 효과음 생성.
 *   출력: public/bgm.wav (배경음), public/sfx-pop.wav (섹션 전환 효과음).
 *   사용: node pipeline/gen-audio.cjs   (재생성 시)
 */
const fs = require('fs');
const path = require('path');
const SR = 32000; // sample rate

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return (buf.length / 1024).toFixed(0) + 'KB';
}

// ── BGM: 잔잔한 앰비언트 패드 (A major 화음, 느린 호흡 + 가벼운 비브라토) ──
function genBgm(seconds) {
  const N = Math.floor(SR * seconds);
  const out = new Float32Array(N);
  const chord = [110.0, 164.81, 220.0, 277.18, 329.63]; // A2 E3 A3 C#4 E4
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const lfo = 1 + 0.004 * Math.sin(2 * Math.PI * 0.18 * t); // 미세 detune
    const breath = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.06 * t); // 느린 음량 호흡
    let s = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c] * lfo;
      const partialAmp = 1 / (c + 1.5);
      s += partialAmp * Math.sin(2 * Math.PI * f * t);
    }
    s /= chord.length;
    // 전역 페이드 인(1.5s)/아웃(2.5s)
    let env = 1;
    if (t < 1.5) env = t / 1.5;
    if (t > seconds - 2.5) env = Math.max(0, (seconds - t) / 2.5);
    out[i] = s * breath * env * 0.16; // 낮은 마스터(배경)
  }
  return out;
}

// ── SFX: 부드러운 UI 팝 (사인 스윕 + 지수 감쇠) ──
function genPop() {
  const dur = 0.13, N = Math.floor(SR * dur);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = 520 + 520 * (t / dur); // 520→1040Hz 스윕
    const env = Math.exp(-t * 30);
    out[i] = Math.sin(2 * Math.PI * f * t) * env * 0.35;
  }
  return out;
}

const pub = path.resolve(__dirname, '..', 'public');
fs.mkdirSync(pub, { recursive: true });
const TOTAL = parseFloat(process.argv[2] || '18'); // 영상 길이(초)에 맞춤
console.log('bgm.wav', writeWav(path.join(pub, 'bgm.wav'), genBgm(TOTAL + 1)));
console.log('sfx-pop.wav', writeWav(path.join(pub, 'sfx-pop.wav'), genPop()));
console.log('✓ CC0 자체 생성 오디오 → public/');
