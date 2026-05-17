import { readFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const DOCS_DIR = fileURLToPath(new URL('docs', import.meta.url));
const PORT = 4000;

const HTML_TEMPLATE = (title, body) => `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Docs</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117;
    color: #e6edf3;
    line-height: 1.7;
    padding: 2rem 1rem;
  }
  .container { max-width: 900px; margin: 0 auto; }
  nav {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #30363d;
  }
  nav a { color: #58a6ff; text-decoration: none; margin-right: 1.5rem; font-size: 0.95rem; }
  nav a:hover { text-decoration: underline; }
  h1 { font-size: 2rem; margin: 1.5rem 0 1rem; border-bottom: 1px solid #21262d; padding-bottom: .5rem; }
  h2 { font-size: 1.5rem; margin: 1.5rem 0 .75rem; }
  h3 { font-size: 1.2rem; margin: 1.2rem 0 .5rem; }
  p { margin: .75rem 0; }
  ul, ol { margin: .75rem 0; padding-left: 1.5rem; }
  li { margin: .3rem 0; }
  code {
    background: #161b22;
    padding: .15rem .4rem;
    border-radius: 4px;
    font-size: .88em;
    color: #f0c674;
  }
  pre {
    background: #161b22;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid #30363d;
    margin: 1rem 0;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: .85rem; }
  blockquote {
    border-left: 4px solid #30363d;
    padding-left: 1rem;
    margin: 1rem 0;
    color: #8b949e;
  }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #30363d; padding: .5rem .75rem; text-align: left; }
  th { background: #161b22; }
  tr:nth-child(even) td { background: #0d1117; }
  a { color: #58a6ff; }
  hr { border: none; border-top: 1px solid #21262d; margin: 2rem 0; }
  .file-list { list-style: none; padding: 0; }
  .file-list li {
    padding: .75rem 1rem;
    border: 1px solid #30363d;
    border-radius: 6px;
    margin-bottom: .5rem;
    background: #161b22;
  }
  .file-list a { font-size: 1.1rem; font-weight: 500; }
  .file-list .desc { color: #8b949e; font-size: .88rem; margin-top: .25rem; }
  @media (max-width: 600px) {
    body { padding: 1rem .5rem; }
    h1 { font-size: 1.5rem; }
  }
</style>
</head>
<body>
<div class="container">
  <nav>
    <a href="/">🏠 Beranda</a>
    <a href="/nestjs-vs-laravel">NestJS vs Laravel</a>
    <a href="/panduan-awam">Panduan Awam</a>
    <a href="/crud-contact-comparison">CRUD Contact</a>
    <a href="/prisma-vs-eloquent">Prisma vs Eloquent</a>
  </nav>
  ${body}
</div>
</body>
</html>`;

const FILES = [
  {
    path: 'panduan-awam.md',
    title: '📘 Panduan Sistem — Untuk Pemula NestJS',
    desc: 'Penjelasan sistem listener-stream dari awal, cocok untuk yang baru belajar NestJS',
  },
  {
    path: 'nestjs-vs-laravel.md',
    title: '⚡ NestJS vs Laravel — Padanan Istilah',
    desc: 'Perbandingan konsep NestJS dengan Laravel untuk yang sudah paham Laravel',
  },
  {
    path: 'crud-contact-comparison.md',
    title: '📊 CRUD Contact — NestJS vs Laravel',
    desc: 'Perbandingan realistis baris-per-baris membuat CRUD Contact di kedua framework',
  },
  {
    path: 'prisma-vs-eloquent.md',
    title: '🗄️ Prisma vs Eloquent — Perbandingan ORM',
    desc: 'Perbandingan Prisma (NestJS) dengan Eloquent (Laravel) untuk akses database',
  },
];

function renderMarkdown(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  return marked.parse(raw);
}

function serveFile(res, filePath, title) {
  try {
    const html = renderMarkdown(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_TEMPLATE(title, html));
  } catch (err) {
    res.writeHead(500);
    res.end('Error rendering file');
  }
}

function serveIndex(res) {
  const items = FILES.map(
    (f) =>
      `<li><a href="/${f.path.replace('.md', '')}">${f.title}</a><div class="desc">${f.desc}</div></li>`,
  ).join('');
  const body = `<h1>📚 Dokumentasi Listener Stream</h1><p>Pilih dokumentasi yang ingin dibaca:</p><ul class="file-list">${items}</ul>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML_TEMPLATE('Beranda', body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = url.pathname.replace(/\/$/, '') || '/index';

  if (path === '/index') {
    return serveIndex(res);
  }

  const match = FILES.find(
    (f) => `/${f.path.replace('.md', '')}` === path || `/${f.path}` === path,
  );
  if (match) {
    return serveFile(res, join(DOCS_DIR, match.path), match.title);
  }

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    HTML_TEMPLATE(
      '404',
      '<h1>404 — Halaman tidak ditemukan</h1><p><a href="/">Kembali ke beranda</a></p>',
    ),
  );
});

server.listen(PORT, () => {
  console.log(`📚 Docs server: http://localhost:${PORT}`);
});
