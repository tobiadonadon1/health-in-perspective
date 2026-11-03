// After `vite build`, splits dist/ into the two sites that one Vercel project serves:
//   dist/app/   the dashboard (app.xeyo.ai)   dist/site/  the website (xeyo.ai)
// Nothing is left at the root except the hashed /assets/ the app loads and the shared 404 page,
// so vercel.json's host rules decide which site a request reaches (Vercel serves root files before rewrites).
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist', app = join(dist, 'app'), site = join(dist, 'site');
if (!existsSync(join(dist, 'index.html'))) throw Error('Run vite build first: dist/index.html is missing.');

rmSync(app, { recursive: true, force: true }); rmSync(site, { recursive: true, force: true });
mkdirSync(app);
for (const name of readdirSync(dist)) if (name !== 'assets' && name !== 'app') renameSync(join(dist, name), join(app, name));

// The website's sources and working files stay out of the deploy.
const skip = new Set(['work', 'DIRECTION.md', 'CRITIQUE.md', '.DS_Store']);
cpSync('landing', site, { recursive: true, filter: src => !skip.has(src.split('/').pop()) });

cpSync(join(app, '404.html'), join(dist, '404.html'));
// One data-use notice for both sites: the app's copy also serves xeyo.ai/privacy.html.
cpSync(join(app, 'privacy.html'), join(site, 'privacy.html'));
console.log('dist/app and dist/site ready');
