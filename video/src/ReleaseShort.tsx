import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { loadFont as loadKR } from '@remotion/google-fonts/NotoSansKR';
import { COPY, plainFor, SCENES, type Lang } from './copy';

// UR-0148: 한글 폰트 실제 로드(delayRender 자동 연동) — CI headless Chromium 에 한글 폰트 부재로 깨지던(tofu □) 문제 차단.
const { fontFamily: KR } = loadKR();

export interface ReleaseShortProps {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  categoryKo: string;
  categoryEn: string;
  lang: Lang;
  // 1.9.x: 버전별 sub-agent 생성 고유 카피(있으면 update 씬에 사용, 없으면 카테고리 평이 메시지)
  script?: { hook: string; what: string; benefit: string } | null;
}

const FONT = `${KR}, "Pretendard", -apple-system, "Segoe UI", system-ui, sans-serif`;
const MONO = `ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, ${KR}, monospace`;

// ── 모션 헬퍼 ──────────────────────────────────────────
const useEnter = (delay = 0, damping = 20) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
  return { opacity: interpolate(s, [0, 1], [0, 1]), y: interpolate(s, [0, 1], [40, 0]), s };
};

// 움직이는 배경: 떠다니는 광원 + 드리프트 그리드(모션그래픽)
const MovingBackground: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const gx = 50 + Math.sin(t * 0.5) * 18;
  const gy = 14 + Math.cos(t * 0.4) * 10;
  const drift = (frame % (fps * 6)) / (fps * 6) * 80; // 그리드 수직 드리프트
  return (
    <AbsoluteFill style={{ background: `radial-gradient(900px 900px at ${gx}% ${gy}%, ${accent}22 0%, #0a0b0f 60%)` }}>
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(#ffffff0a 1px, transparent 1px), linear-gradient(90deg, #ffffff0a 1px, transparent 1px)`,
        backgroundSize: '80px 80px', transform: `translateY(${drift}px)`, opacity: 0.5,
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(700px 500px at 50% 120%, ${accent}14 0%, transparent 70%)` }} />
    </AbsoluteFill>
  );
};

const Brand: React.FC<{ version: string; accent: string }> = ({ version, accent }) => (
  <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center' }}>
    <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 42, letterSpacing: -1 }}>leerness<span style={{ color: accent }}>.</span></span>
    <span style={{ fontFamily: MONO, color: '#5c6270', fontSize: 30, marginLeft: 14 }}>v{version}</span>
  </div>
);

const Scene: React.FC<{ accent: string; children: React.ReactNode }> = ({ accent, children }) => (
  <AbsoluteFill style={{ fontFamily: FONT, color: '#e7e9ee' }}>
    <MovingBackground accent={accent} />
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 96 }}>{children}</AbsoluteFill>
    {/* UR-0164: 상시 안내 스트립 (모든 씬 하단 고정) — 언어중립(브랜드+URL)이라 ko/en 혼용 없음. */}
    <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0, textAlign: 'center', fontFamily: MONO, fontSize: 26, color: '#7c828f', letterSpacing: 0.5 }}>
      leerness<span style={{ color: accent }}>.</span>&nbsp;&nbsp;·&nbsp;&nbsp;leerness.com
    </div>
  </AbsoluteFill>
);

// ── 애니메이션 아이콘(모션그래픽) ───────────────────────
const IconMemory: React.FC<{ color: string }> = ({ color }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const pulse = (i: number) => { const p = ((f - i * fps * 0.4) % (fps * 1.8)) / (fps * 1.8); return p < 0 ? 0 : p; };
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      {[0, 1, 2].map(i => { const p = pulse(i); return <circle key={i} cx="60" cy="60" r={18 + p * 36} fill="none" stroke={color} strokeWidth="3" opacity={(1 - p) * 0.8} />; })}
      <circle cx="60" cy="60" r="14" fill={color} />
    </svg>
  );
};
const IconCheck: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const prog = interpolate(f - delay, [0, fps * 0.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const len = 70;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="4" opacity="0.35" />
      <path d="M38 62 L54 78 L84 44" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={len} strokeDashoffset={len * (1 - prog)} />
    </svg>
  );
};
const IconShield: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const prog = interpolate(f - delay, [0, fps * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <path d="M60 16 L98 30 V62 C98 88 80 102 60 108 C40 102 22 88 22 62 V30 Z" fill={`${color}22`} stroke={color} strokeWidth="4" strokeLinejoin="round" />
      <path d="M44 60 L56 72 L80 46" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={60} strokeDashoffset={60 * (1 - prog)} />
    </svg>
  );
};
const ICONS: Record<string, React.FC<{ color: string; delay: number }>> = {
  memory: ({ color }) => <IconMemory color={color} />,
  check: IconCheck,
  shield: IconShield,
};

// 타이프라이터(설치 명령 모션)
const Typewriter: React.FC<{ text: string; delay: number; color: string }> = ({ text, delay, color }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - delay) / (fps * 0.045))));
  const shown = text.slice(0, n);
  const blink = Math.floor((f) / (fps * 0.4)) % 2 === 0;
  return (
    <span style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color }}>
      <span style={{ color: '#5c6270' }}>$ </span>{shown}<span style={{ opacity: n >= text.length ? (blink ? 1 : 0) : 1 }}>▋</span>
    </span>
  );
};

// 여러 줄(\n) 텍스트를 자연 줄바꿈으로 렌더(... 클램프 없음)
const MultiLine: React.FC<{ text: string; style: React.CSSProperties }> = ({ text, style }) => (
  <div style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere', ...style }}>
    {String(text).split('\n').map((ln, i) => <div key={i}>{ln}</div>)}
  </div>
);

// ── 메인 ───────────────────────────────────────────────
export const ReleaseShort: React.FC<ReleaseShortProps> = (props) => {
  const { version, lang } = props;
  const { fps } = useVideoConfig();
  const c = COPY[lang] || COPY.ko;
  const plain = plainFor(mapCat(props), lang);
  const accent = plain.accent;

  const F = (s: number) => Math.round(fps * s);
  let cur = 0; const at = (s: number) => { const f = cur; cur += F(s); return f; };
  const hook = at(SCENES.hook), whatIs = at(SCENES.whatIs), benefits = at(SCENES.benefits), update = at(SCENES.update), cta = at(SCENES.cta);

  const totalFrames = cur;
  return (
    <AbsoluteFill style={{ background: '#0a0b0f' }}>
      {/* 무료(CC0 자체생성) BGM — 전체 길이, 인트로 페이드인 + 끝 페이드아웃(볼륨 덕킹) */}
      <Audio src={staticFile('bgm.wav')} volume={(f) => interpolate(f, [0, F(1), totalFrames - F(2), totalFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {/* 섹션 전환 효과음(각 씬 시작) */}
      {[hook, whatIs, benefits, update, cta].map((from, i) => (
        <Sequence key={i} from={from} durationInFrames={F(0.2)} name={`sfx-${i}`}><Audio src={staticFile('sfx-pop.wav')} volume={0.5} /></Sequence>
      ))}
      <Sequence from={hook} durationInFrames={F(SCENES.hook)} name="hook">
        <Scene accent={accent}><HookScene tagline={c.tagline} version={version} accent={accent} /></Scene>
      </Sequence>

      <Sequence from={whatIs} durationInFrames={F(SCENES.whatIs)} name="whatIs">
        <Scene accent={accent}><Brand version={version} accent={accent} /><WhatIsScene text={c.whatIs} accent={accent} /></Scene>
      </Sequence>

      <Sequence from={benefits} durationInFrames={F(SCENES.benefits)} name="benefits">
        <Scene accent={accent}><Brand version={version} accent={accent} /><BenefitsScene title={c.benefitsTitle} items={c.benefits as any} accent={accent} /></Scene>
      </Sequence>

      <Sequence from={update} durationInFrames={F(SCENES.update)} name="update">
        <Scene accent={accent}><Brand version={version} accent={accent} /><UpdateScene label={c.updateLabel} version={version} script={props.script} h={plain.h} s={plain.s} accent={accent} /></Scene>
      </Sequence>

      <Sequence from={cta} durationInFrames={F(SCENES.cta)} name="cta">
        <Scene accent={accent}><Brand version={version} accent={accent} /><CtaScene top={c.ctaTop} site={c.site} accent={accent} /></Scene>
      </Sequence>
    </AbsoluteFill>
  );
};

// props 의 categoryKo 로 카테고리 키 역추출(plainFor 는 key 필요) — releases.json 의 category 키를 직접 못 받으므로 매핑
function mapCat(p: ReleaseShortProps): string {
  const m: Record<string, string> = { 보안: 'security', 데이터무결성: 'data-integrity', 신기능: 'feature', 호환성: 'compat', 일관성: 'consistency', 성능: 'performance', 리팩터: 'refactor', 수정: 'fix' };
  return m[p.categoryKo] || 'fix';
}

const HookScene: React.FC<{ tagline: string; version: string; accent: string }> = ({ tagline, version, accent }) => {
  const e = useEnter(2, 14); const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const dot = 1 + Math.sin(f / fps * 6) * 0.12;
  return (
    <div style={{ textAlign: 'center', transform: `scale(${interpolate(e.s, [0, 1], [0.8, 1])})`, opacity: e.opacity }}>
      <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 110, letterSpacing: -3 }}>leerness<span style={{ color: accent, display: 'inline-block', transform: `scale(${dot})` }}>.</span></div>
      <div style={{ color: '#9aa0ad', fontSize: 40, marginTop: 24 }}>{tagline}</div>
      <div style={{ display: 'inline-block', marginTop: 34, padding: '12px 28px', borderRadius: 999, background: `${accent}1a`, border: `2px solid ${accent}`, color: accent, fontFamily: MONO, fontSize: 36, fontWeight: 700 }}>v{version}</div>
    </div>
  );
};

const WhatIsScene: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const e = useEnter(2);
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ width: 90, height: 5, background: accent, borderRadius: 3, margin: '0 auto 40px' }} />
      <MultiLine text={text} style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.45, letterSpacing: -0.5 }} />
    </div>
  );
};

const BenefitsScene: React.FC<{ title: string; items: { icon: string; title: string; desc: string }[]; accent: string }> = ({ title, items, accent }) => {
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  return (
    <div style={{ width: '100%' }}>
      <div style={{ textAlign: 'center', transform: `translateY(${head.y}px)`, opacity: head.opacity, fontFamily: MONO, color: accent, fontSize: 38, fontWeight: 700, marginBottom: 56 }}>{title}</div>
      {items.map((it, i) => {
        const delay = Math.round(fps * (0.5 + i * 0.7));
        return <BenefitRow key={i} it={it} accent={accent} delay={delay} />;
      })}
    </div>
  );
};
const BenefitRow: React.FC<{ it: { icon: string; title: string; desc: string }; accent: string; delay: number }> = ({ it, accent, delay }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 18, mass: 0.6 } });
  const Icon = ICONS[it.icon] || ICONS.check;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginBottom: 44, transform: `translateX(${interpolate(s, [0, 1], [-60, 0])}px)`, opacity: s }}>
      <div style={{ width: 120, height: 120, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon color={accent} delay={delay} /></div>
      <div style={{ wordBreak: 'keep-all' }}>
        <div style={{ fontSize: 50, fontWeight: 800 }}>{it.title}</div>
        <div style={{ fontSize: 36, color: '#9aa0ad', marginTop: 8, lineHeight: 1.4 }}>{it.desc}</div>
      </div>
    </div>
  );
};

const UpdateScene: React.FC<{ label: string; version: string; script?: { hook: string; what: string; benefit: string } | null; h: string; s: string; accent: string }> = ({ label, version, script, h, s, accent }) => {
  const e = useEnter(2);
  const what = useEnter(8);   // 본문 약간 늦게
  // 버전별 고유 카피(script) 있으면 hook/what/benefit, 없으면 카테고리 평이 메시지(h/s)
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ display: 'inline-block', fontFamily: MONO, color: accent, fontSize: 32, fontWeight: 700, padding: '8px 22px', border: `2px solid ${accent}55`, borderRadius: 12, marginBottom: 36 }}>{label} · v{version}</div>
      {script ? (
        <>
          <MultiLine text={script.hook} style={{ fontSize: 46, fontWeight: 700, color: accent, lineHeight: 1.35, marginBottom: 28 }} />
          <div style={{ transform: `translateY(${what.y}px)`, opacity: what.opacity }}>
            <MultiLine text={script.what} style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.35, letterSpacing: -0.5 }} />
            <MultiLine text={script.benefit} style={{ fontSize: 38, color: '#9aa0ad', marginTop: 24, lineHeight: 1.45 }} />
          </div>
        </>
      ) : (
        <>
          <MultiLine text={h} style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.25, letterSpacing: -1 }} />
          <MultiLine text={s} style={{ fontSize: 42, color: '#9aa0ad', marginTop: 24, lineHeight: 1.45 }} />
        </>
      )}
    </div>
  );
};

const CtaScene: React.FC<{ top: string; site: string; accent: string }> = ({ top, site, accent }) => {
  const e = useEnter(2); const { fps } = useVideoConfig();
  return (
    <div style={{ transform: `translateY(${e.y}px)`, opacity: e.opacity, textAlign: 'center', width: '100%' }}>
      <div style={{ fontSize: 50, color: '#e7e9ee', fontWeight: 700, marginBottom: 36 }}>{top}</div>
      <div style={{ background: '#13151c', border: '2px solid #232733', borderRadius: 18, padding: '30px 28px', display: 'inline-block', minWidth: 560 }}>
        <Typewriter text="npm i -g leerness" delay={Math.round(fps * 0.4)} color={accent} />
      </div>
      <div style={{ marginTop: 48, fontSize: 52, color: '#e7e9ee', fontWeight: 800, letterSpacing: -0.5 }}>{site}</div>
    </div>
  );
};
