// leerness.com sitemap — 정적 빌드 시 전 라우트 열거 (홈/기능/패치노트 + 버전별 상세)
import data from '../../data/releases.json';

const SITE = 'https://leerness.com';

export async function GET() {
  const releases: any[] = (data as any).releases || [];
  const today = new Date().toISOString().slice(0, 10);
  const urls: { loc: string; lastmod: string; priority: string }[] = [
    { loc: `${SITE}/`, lastmod: today, priority: '1.0' },
    { loc: `${SITE}/how-it-works`, lastmod: today, priority: '0.9' },
    { loc: `${SITE}/changelog`, lastmod: today, priority: '0.8' },
    ...releases.map(r => ({ loc: `${SITE}/changelog/${r.version}`, lastmod: r.date || today, priority: '0.4' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
