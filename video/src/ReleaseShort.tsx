import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export type Lang = 'ko' | 'en';
export interface ReleaseShortProps {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  categoryKo: string;
  categoryEn: string;
  lang: Lang;
}

const COLORS: Record<string, string> = {
  보안: '#fbbf24', Security: '#fbbf24',
  데이터무결성: '#f472b6', 'Data integrity': '#f472b6',
  신기능: '#34d399', Feature: '#34d399',
  호환성: '#5eead4', Compatibility: '#5eead4',
  일관성: '#818cf8', Consistency: '#818cf8',
  성능: '#f59e0b', Performance: '#f59e0b',
};
const accentFor = (cat: string) => COLORS[cat] || '#5eead4';

const T = {
  ko: { tagline: 'AI 에이전트 PM CLI', whatsNew: '이번 업데이트', install: '지금 설치' },
  en: { tagline: 'PM CLI for AI agents', whatsNew: "What's new", install: 'Install now' },
};

const FONT = '"Pretendard", -apple-system, "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, monospace';

// 제목 정리: 끝의 (출처/UR 참조) 괄호 제거 + 백틱 제거
const cleanText = (s: string) => String(s || '').replace(/`/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const clamp = (s: string, n: number) => { const t = cleanText(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 20, mass: 0.6 } });
  return { opacity: interpolate(s, [0, 1], [0, 1]), y: interpolate(s, [0, 1], [36, 0]) };
};

// 모든 씬 공통: 상단 작은 브랜드 라벨(중앙 콘텐츠와 충분한 간격)
const Brand: React.FC<{ version: string; accent: string }> = ({ version, accent }) => (
  <div style={{ position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center' }}>
    <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 40, letterSpacing: -1 }}>leerness<span style={{ color: accent }}>.</span></span>
    <span style={{ fontFamily: MONO, color: '#5c6270', fontSize: 30, marginLeft: 14 }}>v{version}</span>
  </div>
);

const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: 'radial-gradient(1200px 900px at 50% 0%, #14202b 0%, #0a0b0f 62%)', fontFamily: FONT, color: '#e7e9ee', justifyContent: 'center', alignItems: 'center', padding: 90 }}>
    {children}
  </AbsoluteFill>
);

export const ReleaseShort: React.FC<ReleaseShortProps> = (props) => {
  const { version, title, summary, categoryKo, categoryEn, lang } = props;
  const { fps } = useVideoConfig();
  const t = T[lang] || T.ko;
  const cat = (lang === 'ko' ? categoryKo : categoryEn) || categoryKo;
  const accent = accentFor(cat);

  // 씬 구성(순차·비겹침). 요약 없으면 요약 씬 생략.
  const hasSummary = !!cleanText(summary);
  const D = { intro: Math.round(fps * 2.4), title: Math.round(fps * 3.2), summary: Math.round(fps * 3.2), outro: Math.round(fps * 3.0) };
  let cursor = 0;
  const at = (d: number) => { const f = cursor; cursor += d; return f; };
  const fIntro = at(D.intro), fTitle = at(D.title), fSummary = hasSummary ? at(D.summary) : -1, fOutro = at(D.outro);

  return (
    <AbsoluteFill style={{ background: '#0a0b0f' }}>
      <Sequence from={fIntro} durationInFrames={D.intro} name="intro">
        <Scene>
          <Brand version={version} accent={accent} />
          <Intro version={version} cat={cat} accent={accent} tagline={t.tagline} />
        </Scene>
      </Sequence>

      <Sequence from={fTitle} durationInFrames={D.title} name="title">
        <Scene>
          <Brand version={version} accent={accent} />
          <TitleScene title={cleanText(title)} accent={accent} label={t.whatsNew} />
        </Scene>
      </Sequence>

      {hasSummary && (
        <Sequence from={fSummary} durationInFrames={D.summary} name="summary">
          <Scene>
            <Brand version={version} accent={accent} />
            <SummaryScene summary={clamp(summary, 110)} accent={accent} />
          </Scene>
        </Sequence>
      )}

      <Sequence from={fOutro} durationInFrames={D.outro} name="outro">
        <Scene>
          <Brand version={version} accent={accent} />
          <Outro install={t.install} accent={accent} />
        </Scene>
      </Sequence>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ version: string; cat: string; accent: string; tagline: string }> = ({ version, cat, accent, tagline }) => {
  const e = useEnter(2);
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center' }}>
      <div style={{ color: '#9aa0ad', fontSize: 34, marginBottom: 30 }}>{tagline}</div>
      <div style={{ fontFamily: MONO, fontSize: 150, fontWeight: 800, color: accent, letterSpacing: -4, lineHeight: 1 }}>v{version}</div>
      <div style={{ display: 'inline-block', marginTop: 34, padding: '14px 34px', borderRadius: 999, border: `2px solid ${accent}`, color: accent, fontSize: 42, fontWeight: 700 }}>{cat}</div>
    </div>
  );
};

const TitleScene: React.FC<{ title: string; accent: string; label: string }> = ({ title, accent, label }) => {
  const e = useEnter(2);
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ fontFamily: MONO, color: accent, fontSize: 34, fontWeight: 700, marginBottom: 28 }}>{label}</div>
      <div style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.25, letterSpacing: -1, wordBreak: 'keep-all' }}>{title}</div>
    </div>
  );
};

const SummaryScene: React.FC<{ summary: string; accent: string }> = ({ summary, accent }) => {
  const e = useEnter(2);
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ width: 90, height: 5, background: accent, borderRadius: 3, margin: '0 auto 40px' }} />
      <div style={{ fontSize: 50, fontWeight: 500, lineHeight: 1.5, color: '#dfe3ea', wordBreak: 'keep-all' }}>{summary}</div>
    </div>
  );
};

const Outro: React.FC<{ install: string; accent: string }> = ({ install, accent }) => {
  const e = useEnter(2);
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ fontSize: 46, color: '#9aa0ad', marginBottom: 30 }}>{install}</div>
      <div style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: accent, background: '#13151c', border: '2px solid #232733', borderRadius: 18, padding: '28px 24px', display: 'inline-block' }}>
        <span style={{ color: '#5c6270' }}>$ </span>npm i -g leerness
      </div>
      <div style={{ marginTop: 46, fontSize: 40, color: '#e7e9ee', fontWeight: 800 }}>leerness.com</div>
    </div>
  );
};
