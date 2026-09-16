// Tiny zero-dependency static server for local development and the test suite.
// Service workers need a real http:// origin, so opening index.html from disk isn't enough.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^[/\\]+/, '');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        res.writeHead(200, {
            'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(PORT, '127.0.0.1', () => {
    console.log(`Steady is running at http://127.0.0.1:${PORT}`);
});
