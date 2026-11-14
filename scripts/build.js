const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const site = require('../src/site');
const { prepareProjects, projectsListPage, projectPage, projectPath, PROJECTS_PATH, prepareCatalog, homePage, categoryPage, productPage, notFoundPage, categoryPath, productPath, absoluteUrl, CATEGORIES } = require('../src/render');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'products.json');
const PROJECTS_FILE = path.join(ROOT, 'data', 'projects.json');

async function writePage(urlPath, html) {
  const file = path.join(DIST_DIR, urlPath, urlPath.endsWith('/') ? 'index.html' : '');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
}

async function assetVersion() {
  const hash = crypto.createHash('sha1');
  // Only top-level files (CSS, JS) are versioned; folders such as products/ hold images.
  for (const entry of await fs.readdir(PUBLIC_DIR, { withFileTypes: true })) {
    if (entry.isFile()) hash.update(await fs.readFile(path.join(PUBLIC_DIR, entry.name)));
  }
  return hash.digest('hex').slice(0, 10);
}

function sitemap(paths, lastmod) {
  const urls = paths.map((p) => `  <url><loc>${absoluteUrl(p)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robots() {
  if (site.noindexAll) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`;
}

async function build() {
  const products = prepareCatalog(JSON.parse(await fs.readFile(PRODUCTS_FILE, 'utf8')));
  const projects = prepareProjects(JSON.parse(await fs.readFile(PROJECTS_FILE, 'utf8')), products);
  const version = await assetVersion();
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.cp(PUBLIC_DIR, DIST_DIR, { recursive: true });

  const pages = [['/', homePage(products, projects, version)]];
  for (const category of Object.keys(CATEGORIES)) pages.push([categoryPath(category), categoryPage(category, products, version)]);
  for (const product of products) pages.push([productPath(product), productPage(product, products, projects, version)]);
  pages.push([PROJECTS_PATH, projectsListPage(projects, version)]);
  for (const project of projects) pages.push([projectPath(project), projectPage(project, projects, version)]);

  await Promise.all(pages.map(([urlPath, html]) => writePage(urlPath, html)));
  await writePage('/404.html', notFoundPage(version));
  await fs.writeFile(path.join(DIST_DIR, 'sitemap.xml'), sitemap(pages.map(([p]) => p).filter((p) => !projects.some((project) => project.draft && projectPath(project) === p)), new Date().toISOString().slice(0, 10)));
  await fs.writeFile(path.join(DIST_DIR, 'robots.txt'), robots());
  return pages.length;
}

if (require.main === module) {
  build()
    .then((count) => console.log(`Зібрано ${count} сторінок у dist/`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { build, DIST_DIR };
