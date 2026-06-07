// 비개발자 친화 내러티브 카피 (KO/EN) — 기술 원문을 쉬운 말 + 혜택으로 변환.
// 카테고리별 "이번 업데이트" 평이 메시지 + leerness 소개/혜택 정적 카피.

export type Lang = 'ko' | 'en';

export const COPY = {
  ko: {
    tagline: 'AI 코딩 에이전트를 위한 작업 관리 비서',
    whatIs: 'AI가 코딩하다 빠뜨리거나 잊지 않도록\n맥락·검증·보안을 자동으로 챙겨줘요',
    benefitsTitle: '이런 점이 좋아요',
    benefits: [
      { icon: 'memory', title: '맥락을 기억해요', desc: '세션이 끊겨도 하던 작업을 이어가요' },
      { icon: 'check', title: '거짓 완료를 막아요', desc: "'다 했어요'를 증거로 자동 검증해요" },
      { icon: 'shield', title: '실수를 예방해요', desc: '비밀키 유출·한글 깨짐을 미리 막아요' },
    ],
    updateLabel: '이번 업데이트',
    ctaTop: '지금 무료로 시작하세요',
    site: 'leerness.com',
  },
  en: {
    tagline: 'A work-manager for your AI coding agent',
    whatIs: "Keeps your AI from missing or forgetting things —\ncontext, checks, and security, automatically",
    benefitsTitle: 'Why people love it',
    benefits: [
      { icon: 'memory', title: 'Remembers context', desc: 'Picks up where it left off across sessions' },
      { icon: 'check', title: 'Stops fake "done"', desc: 'Verifies completion with real evidence' },
      { icon: 'shield', title: 'Prevents mistakes', desc: 'Blocks secret leaks & encoding breakage' },
    ],
    updateLabel: "What's new",
    ctaTop: 'Start free now',
    site: 'leerness.com',
  },
} as const;

// 카테고리 → 평이한 "이번 업데이트" 메시지(비개발자용)
export const CATEGORY_PLAIN: Record<string, { ko: { h: string; s: string }; en: { h: string; s: string }; accent: string }> = {
  security: { ko: { h: '보안이 더 강해졌어요', s: '민감한 정보 보호를 강화했어요' }, en: { h: 'Stronger security', s: 'Better protection for your secrets' }, accent: '#fbbf24' },
  'data-integrity': { ko: { h: '데이터가 더 안전해졌어요', s: '작업 기록이 깨지지 않게 보강했어요' }, en: { h: 'Safer data', s: 'Your work records stay intact' }, accent: '#f472b6' },
  feature: { ko: { h: '새로운 기능이 생겼어요', s: '더 편하게 쓸 수 있어요' }, en: { h: 'New feature added', s: 'Even easier to use' }, accent: '#34d399' },
  compat: { ko: { h: '호환성이 좋아졌어요', s: 'Windows 등 여러 환경에서 더 잘 동작해요' }, en: { h: 'Better compatibility', s: 'Works smoother on Windows & more' }, accent: '#5eead4' },
  consistency: { ko: { h: '더 매끄럽게 다듬었어요', s: '도구 사용 경험이 일관돼요' }, en: { h: 'More polished', s: 'A more consistent experience' }, accent: '#818cf8' },
  performance: { ko: { h: '더 빨라졌어요', s: '처리 속도를 개선했어요' }, en: { h: 'Faster now', s: 'Improved processing speed' }, accent: '#f59e0b' },
  refactor: { ko: { h: '내부를 더 탄탄하게', s: '유지보수가 쉬워지도록 정리했어요' }, en: { h: 'Sturdier inside', s: 'Cleaned up for maintainability' }, accent: '#94a3b8' },
  fix: { ko: { h: '안정성을 높였어요', s: '더 탄탄하게 개선했어요' }, en: { h: 'More stable', s: 'Made it more robust' }, accent: '#94a3b8' },
};

export const plainFor = (category: string, lang: Lang) => {
  const c = CATEGORY_PLAIN[category] || CATEGORY_PLAIN.fix;
  return { ...c[lang], accent: c.accent };
};

// 씬 길이(초) — 컴포지션과 Root 가 공유(총 길이/프레임 윈도우 동기화)
export const SCENES = { hook: 2.6, whatIs: 3.2, benefits: 5.4, update: 4.4, cta: 3.4 } as const;
export const TOTAL_SECONDS = Object.values(SCENES).reduce((a, b) => a + b, 0);
