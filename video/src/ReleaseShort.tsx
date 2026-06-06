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
};
const accentFor = (cat: string) => COLORS[cat] || '#5eead4';

const T = {
  ko: { tagline: 'AI 에이전트 프로젝트 매니지먼트 CLI', whatsNew: '이번 업데이트', install: '지금 설치', cta: 'leerness.com · npm i -g leerness' },
  en: { tagline: 'Project management CLI for AI agents', whatsNew: "What's new", install: 'Install now', cta: 'leerness.com · npm i -g leerness' },
};

const FONT = '"Pretendard", -apple-system, "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, monospace';

export const ReleaseShort: React.FC<ReleaseShortProps> = (props) => {
  const { version, title, summary, highlights, categoryKo, categoryEn, lang } = props;
  const { fps } = useVideoConfig();
  const t = T[lang] || T.ko;
  const cat = lang === 'ko' ? categoryKo : categoryEn;
  const accent = accentFor(cat) || accentFor(categoryKo);

  const introEnd = Math.round(fps * 2.5);
  const perHl = Math.round(fps * 2.2);

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(1200px 900px at 50% 0%, #14202b 0%, #0a0b0f 60%)', fontFamily: FONT, color: '#e7e9ee' }}>
      {/* 상단 브랜드 바 (전체 노출) */}
      <AbsoluteFill style={{ padding: 70, justifyContent: 'flex-start' }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 54, letterSpacing: -1 }}>
          leerness<span style={{ color: accent }}>.</span>
        </div>
        <div style={{ color: '#9aa0ad', fontSize: 30, marginTop: 8 }}>{t.tagline}</div>
      </AbsoluteFill>

      {/* 인트로: 버전 + 카테고리 */}
      <Sequence durationInFrames={introEnd} name="intro">
        <Intro version={version} cat={cat} accent={accent} />
      </Sequence>

      {/* 제목 + 요약 */}
      <Sequence from={introEnd} name="title">
        <TitleBlock title={title} summary={summary} accent={accent} />
      </Sequence>

      {/* 하이라이트 (스태거) */}
      {highlights.map((h, i) => (
        <Sequence key={i} from={introEnd + Math.round(fps * 0.1) + i * perHl} durationInFrames={perHl + fps * 3} name={`hl-${i}`}>
          <Highlight text={h} index={i} accent={accent} label={t.whatsNew} />
        </Sequence>
      ))}

      {/* 아웃트로 CTA */}
      <Sequence from={introEnd + highlights.length * perHl} name="outro">
        <Outro install={t.install} cta={t.cta} accent={accent} />
      </Sequence>
    </AbsoluteFill>
  );
};

const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.7 } });
  return { opacity: interpolate(s, [0, 1], [0, 1]), y: interpolate(s, [0, 1], [40, 0]) };
};

const Intro: React.FC<{ version: string; cat: string; accent: string }> = ({ version, cat, accent }) => {
  const e = useEnter(3);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 150, fontWeight: 800, color: accent, letterSpacing: -4 }}>v{version}</div>
        <div style={{ display: 'inline-block', marginTop: 24, padding: '12px 30px', borderRadius: 999, border: `2px solid ${accent}`, color: accent, fontSize: 38, fontWeight: 700 }}>{cat}</div>
      </div>
    </AbsoluteFill>
  );
};

const TitleBlock: React.FC<{ title: string; summary: string; accent: string }> = ({ title, summary }) => {
  const e = useEnter(2);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: 80 }}>
      <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity }}>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.18, letterSpacing: -1 }}>{title}</div>
        {summary ? <div style={{ fontSize: 36, color: '#9aa0ad', marginTop: 28, lineHeight: 1.5 }}>{summary}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

const Highlight: React.FC<{ text: string; index: number; accent: string; label: string }> = ({ text, accent, label }) => {
  const e = useEnter(2);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: 80 }}>
      <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', color: accent, fontSize: 30, fontWeight: 700, marginBottom: 18 }}>{label}</div>
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: accent, marginTop: 18, flexShrink: 0 }} />
          <div style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.35 }}>{text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ install: string; cta: string; accent: string }> = ({ install, cta, accent }) => {
  const e = useEnter(2);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 70 }}>
      <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: 44, color: '#9aa0ad', marginBottom: 26 }}>{install}</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 46, fontWeight: 700, color: accent, background: '#13151c', border: '2px solid #232733', borderRadius: 18, padding: '26px 20px', display: 'inline-block' }}>
          <span style={{ color: '#5c6270' }}>$ </span>npm i -g leerness
        </div>
        <div style={{ marginTop: 40, fontSize: 34, color: '#e7e9ee', fontWeight: 700 }}>{cta}</div>
      </div>
    </AbsoluteFill>
  );
};
