#!/usr/bin/env node
/**
 * derive-facts — 사이트가 주장하는 수치를 **패키지에서 측정**해 data/facts.json 으로 낸다.
 *
 * 왜: leerness.com 이 "MCP 88 도구"를 하드코딩해 두고 있었는데 실제 배포본은 89 였다(같은 index.astro 안의
 *   FAQ 는 또 86 이라, 한 파일에 세 수치가 공존했다). 릴리스마다 사람이 손으로 맞춰야 하는 수치는 반드시 낡는다 —
 *   leerness 자신이 "측정되지 않은 수치를 주장하지 말라"고 강제하는 도구인데 자기 홈페이지가 그걸 어겼다.
 *
 * 규율: **측정 실패 시 추측하지 않는다.** 값을 못 구하면 null 로 두고, 소비하는 쪽이 그 통계를 통째로 빼도록 한다
 *   (낡은 숫자를 보여주느니 아무 숫자도 안 보여주는 게 정직하다).
 *
 * 사용: node pipeline/derive-facts.cjs [--pkg <leerness-pkg 경로>] [--out <path>]
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const here = __dirname;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const pkgDir = path.resolve(process.cwd(), arg('--pkg', path.resolve(here, '..', '..', 'leerness-pkg')));
const outPath = path.resolve(process.cwd(), arg('--out', path.resolve(here, '..', 'data', 'facts.json')));

const facts = { generated: new Date().toISOString().slice(0, 10), source: path.basename(pkgDir), measured: {}, unmeasured: [] };
const record = (key, fn) => {
  try {
    const v = fn();
    if (v === undefined || v === null || Number.isNaN(v)) throw new Error('빈 값');
    facts.measured[key] = v;
  } catch (e) {
    facts.unmeasured.push({ key, reason: String(e && e.message || e).slice(0, 200) });
  }
};

record('version', () => JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version);
record('runtimeDeps', () => Object.keys(JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).dependencies || {}).length);
// MCP 도구 수 — 정의 모듈의 실제 length (제품 내부 _mcpToolCount 와 동일 출처)
record('mcpTools', () => {
  const mod = require(path.join(pkgDir, 'lib', 'mcp-tools.js'));
  const n = Array.isArray(mod) ? mod.length : (Array.isArray(mod.TOOLS) ? mod.TOOLS.length : null);
  if (!n) throw new Error('mcp-tools 모듈이 배열이 아님');
  return n;
});
// core 프로필 도구 수 — 하드코딩된 "20 essential tools" 주장의 근거
record('mcpCoreTools', () => {
  // 제품이 실제로 쓰는 정의와 같은 출처: `_ALL_TOOLS.CORE` (bin 의 --profile core 필터가 이 배열을 참조)
  const mod = require(path.join(pkgDir, 'lib', 'mcp-tools.js'));
  const core = mod.CORE;
  if (!Array.isArray(core) || !core.length) throw new Error('mcp-tools.CORE 배열 없음');
  const list = Array.isArray(mod) ? mod : (mod.TOOLS || []);
  // 실존 확인 — CORE 에 오타/삭제된 이름이 있으면 사이트가 주장할 수 없는 수치가 된다
  const missing = core.filter(n => !list.some(t => t && t.name === n));
  if (missing.length) throw new Error(`CORE 에 실존하지 않는 도구 ${missing.length}개: ${missing.slice(0, 3).join(', ')}`);
  return core.length;
});
// selftest 케이스 수 — CLI 를 실제로 돌려서 얻는다(소스 카운트 추정 금지)
record('selftestCases', () => {
  const r = cp.spawnSync(process.execPath, [path.join(pkgDir, 'bin', 'leerness.js'), 'selftest', '--json'],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  const j = JSON.parse(r.stdout);
  const n = j.total != null ? j.total : (Array.isArray(j.cases) ? j.cases.length : null);
  if (!n) throw new Error('selftest --json 에 total 없음');
  return n;
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(facts, null, 2) + '\n');
const m = facts.measured;
console.log(`✓ facts → ${path.relative(process.cwd(), outPath)}  v${m.version} · MCP ${m.mcpTools}${m.mcpCoreTools ? ` (core ${m.mcpCoreTools})` : ''} · deps ${m.runtimeDeps} · selftest ${m.selftestCases}`);
if (facts.unmeasured.length) {
  console.log(`⚠ 측정 실패 ${facts.unmeasured.length}건 — 해당 수치는 사이트에서 표시하지 않습니다(낡은 숫자 대신 공백):`);
  facts.unmeasured.forEach(u => console.log(`   - ${u.key}: ${u.reason}`));
}
// 개별 실패는 그 수치만 빼면 되지만, **전량 실패는 설정이 깨진 것**이다 —
//   그대로 두면 통계가 통째로 사라진 사이트가 조용히 배포된다(아무도 눈치채지 못한다). 빌드를 세운다.
if (Object.keys(facts.measured).length === 0) {
  console.error(`✗ 아무 수치도 측정하지 못했습니다 — 패키지 경로를 확인하세요: ${pkgDir}`);
  console.error('  (일부 실패는 해당 수치만 생략하고 진행하지만, 전량 실패는 빌드를 중단합니다)');
  process.exit(1);
}
