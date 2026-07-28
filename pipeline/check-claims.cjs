#!/usr/bin/env node
/**
 * check-claims — 사이트 소스에 **손으로 적힌 수치 주장**이 남아 있으면 빌드를 실패시킨다.
 *
 * 왜: "MCP 88 도구"가 배포본 89 와 어긋난 채 공개돼 있었고, 같은 파일 FAQ 는 86 이었다.
 *   숫자를 한 번 고치는 건 그 인스턴스만 고치는 것이다 — 다음 릴리스에 똑같이 낡는다.
 *   이 가드는 **클래스**를 막는다: 측정값(data/facts.json)에서 오지 않은 수치 주장은 통과하지 못한다.
 *
 * 규율: false-BLOCK 을 피하려고 패턴은 좁게 잡는다(도구 수·의존성 수·selftest 수처럼
 *   릴리스마다 변하는 것만). 연도·버전 표기·CSS 값 등은 대상이 아니다.
 *
 * 사용: node pipeline/check-claims.cjs   (exit 1 이면 낡을 수 있는 주장이 남아 있음)
 */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const siteRoot = path.resolve(here, '..');
const factsPath = path.join(siteRoot, 'data', 'facts.json');
if (!fs.existsSync(factsPath)) {
  console.error('✗ data/facts.json 없음 — 먼저 node pipeline/derive-facts.cjs 를 실행하세요.');
  process.exit(1);
}
const measured = JSON.parse(fs.readFileSync(factsPath, 'utf8')).measured || {};

// 스캔 대상: 사이트가 실제로 발행하는 소스만 (node_modules/dist 제외)
const targets = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(astro|ts|js|mjs|txt|md|html)$/.test(e.name)) targets.push(p);
  }
};
for (const d of ['src', 'public']) { const p = path.join(siteRoot, d); if (fs.existsSync(p)) walk(p); }

// 대상은 **릴리스마다 변하는 카운트**로 좁힌다. 첫 판에서 5/5 가 오탐이었다 —
//   주석, `F.x` 파생 표현, 그리고 "0 의존성"(그래프 HTML 이 self-contained 하다는 **다른 개념**)까지 잡았다.
//   false-BLOCK 은 그 자체가 버그이므로 false-PASS 쪽으로 편향한다: 실제로 낡은 이력이 있는 두 수치만 본다.
//   ("0 의존성"은 패키지 정체성이자 구조적 사실이고, 소비처는 이미 측정값 가드(F.runtimeDeps===0)를 통과해야
//    출력되므로 리터럴로 굳어질 위험이 없다.)
const RULES = [
  // 주의: JS 의 \b 는 ASCII 단어문자 기준이라 **한글 뒤에서는 성립하지 않는다**.
  //   `(?:도구|tools?)\b` 로 두면 "MCP 88 도구{...}" 가 매칭되지 않아 가드가 조용히 무력해진다(실측으로 발견).
  //   경계가 필요한 건 영문 tools 쪽뿐이므로 그쪽에만 붙인다.
  { key: 'mcpTools', re: /\b(\d{2,3})\s*(?:개\s*)?(?:MCP\s*)?(?:도구|tools?\b)/gi, label: 'MCP 도구 수' },
  { key: 'selftestCases', re: /selftest[^\n]{0,12}?\b(\d{2,4})\b/gi, label: 'selftest 케이스 수' },
];
// 파생 표현(`${F.mcpTools} 도구`)에는 **리터럴 숫자가 아예 없다** — 규칙이 숫자를 요구하므로 따로 스킵할 필요가 없다.
//   (첫 판은 "F. 가 있는 줄은 통째로 스킵"이었는데, 파생과 하드코딩이 한 줄에 공존하면 회귀를 놓쳤다 —
//    차별적 통제에서 실제로 그 구멍이 드러났다: "MCP 88 도구"를 되살려도 통과했다.)
// 버전 표기(1.36.81)는 카운트 주장이 아니다 — 스캔 전에 지워 selftest 규칙의 오탐을 없앤다.
const VERSIONISH = /\bv?\d+\.\d+(?:\.\d+)?\b/g;
// 주석 줄은 주장이 아니다. 완벽한 파서 대신 **넉넉히 걸러낸다** — 과하게 거르면 false-PASS(허용),
//   덜 거르면 false-BLOCK(버그). 편향 방향을 의도적으로 고른다.
const COMMENTISH = /^\s*(?:\/\/|\/\*|\*|<!--|#)/;

const offenders = [];
for (const f of targets) {
  const rel = path.relative(siteRoot, f).replace(/\\/g, '/');
  // 이 가드 자신과 facts 생성기는 제외 — 자기참조 트랩(패턴 문자열이 스캔 대상이 됨)
  if (rel.startsWith('pipeline/')) continue;
  const src = fs.readFileSync(f, 'utf8');
  src.split('\n').forEach((rawLine, i) => {
    if (COMMENTISH.test(rawLine)) return;
    const line = rawLine.replace(VERSIONISH, ' ');
    for (const r of RULES) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(line)) !== null) {
        const n = Number(m[1]);
        // 0 의존성처럼 측정값과 우연히 같아도, **리터럴로 적혀 있으면** 다음 릴리스에 낡는다 → 여전히 위반
        offenders.push({ file: rel, line: i + 1, label: r.label, found: n, measured: measured[r.key], text: rawLine.trim().slice(0, 120) });
      }
    }
  });
}

if (!offenders.length) {
  console.log('✓ 사이트 소스에 손으로 적힌 수치 주장 0건 — 모든 수치가 측정값에서 옵니다.');
  process.exit(0);
}
console.error(`✗ 손으로 적힌 수치 주장 ${offenders.length}건 — data/facts.json 의 측정값을 쓰세요(낡습니다):`);
for (const o of offenders) {
  const drift = o.measured != null && o.found !== o.measured ? `  ⚠ 이미 어긋남(측정=${o.measured})` : '';
  console.error(`   ${o.file}:${o.line}  [${o.label}] ${o.found}${drift}`);
  console.error(`      ${o.text}`);
}
process.exit(1);
