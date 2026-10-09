#!/usr/bin/env node
// Downloads the pinned official clangd release, verifies SHA256, caches the zip and extracts it to
// resources/clangd/<platform>-<arch>/{bin,lib}. Binaries are gitignored; electron-builder ships them.
//   node scripts/fetch-clangd.mjs                 # host platform
//   node scripts/fetch-clangd.mjs --platform mac,win
//   node scripts/fetch-clangd.mjs --all
// Env: NEXEL_CLANGD_CACHE (zip cache dir), NEXEL_CLANGD_FORCE=1 (re-extract).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';
import { CLANGD_VERSION, CLANGD_ASSETS, assetUrl, hostKey } from './clangd-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'resources', 'clangd');
const CACHE = process.env.NEXEL_CLANGD_CACHE
  || path.join(process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'nexel-clangd');

const sha256File = (p) => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

async function download(asset) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, asset.file);
  if (fs.existsSync(dest) && (await sha256File(dest)) === asset.sha256) { console.log(`cache hit  ${asset.file}`); return dest; }
  const url = assetUrl(asset.file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tmp = `${dest}.${process.pid}.part`;
    try {
      console.log(`download   ${url} (attempt ${attempt})`);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0; let got = 0, lastPct = -10;
      const h = crypto.createHash('sha256');
      const tap = new Transform({ transform(chunk, _e, cb) {
        h.update(chunk); got += chunk.length;
        const pct = total ? Math.floor((got / total) * 100) : 0;
        if (process.stdout.isTTY && pct >= lastPct + 10) { lastPct = pct; process.stdout.write(`  ${pct}%\r`); }
        cb(null, chunk);
      } });
      await pipeline(Readable.fromWeb(res.body), tap, fs.createWriteStream(tmp));
      const digest = h.digest('hex');
      if (digest !== asset.sha256) throw new Error(`SHA256 mismatch for ${asset.file}: got ${digest}`);
      fs.renameSync(tmp, dest);
      return dest;
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      if (attempt === 3 || /SHA256 mismatch/.test(String(e))) throw e;
      console.warn(`  ${e.message}; retrying`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function install(key) {
  const asset = CLANGD_ASSETS[key];
  const target = path.join(OUT, asset.dir);
  const stamp = path.join(target, '.version');
  if (!process.env.NEXEL_CLANGD_FORCE && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === `${CLANGD_VERSION} ${asset.sha256}`
      && fs.existsSync(path.join(target, 'bin', asset.exe))) { console.log(`up to date resources/clangd/${asset.dir}`); return; }
  const zip = await download(asset);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexel-clangd-'));
  try {
    await extract(zip, { dir: tmp });
    const inner = path.join(tmp, `clangd_${CLANGD_VERSION}`);
    if (!fs.existsSync(path.join(inner, 'bin', asset.exe))) throw new Error(`unexpected archive layout in ${asset.file}`);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    for (const part of ['bin', 'lib', 'LICENSE.TXT']) if (fs.existsSync(path.join(inner, part))) fs.cpSync(path.join(inner, part), path.join(target, part), { recursive: true });
    if (asset.exe === 'clangd') fs.chmodSync(path.join(target, 'bin', 'clangd'), 0o755);
    fs.writeFileSync(stamp, `${CLANGD_VERSION} ${asset.sha256}\n`);
    console.log(`installed  resources/clangd/${asset.dir} (clangd ${CLANGD_VERSION})`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function parseKeys(argv) {
  if (argv.includes('--all')) return Object.keys(CLANGD_ASSETS);
  const i = argv.indexOf('--platform');
  if (i >= 0) {
    const keys = String(argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const k of keys) if (!CLANGD_ASSETS[k]) throw new Error(`unknown platform "${k}" (use ${Object.keys(CLANGD_ASSETS).join(', ')})`);
    return keys;
  }
  const k = hostKey();
  if (!k) { console.warn(`No official clangd build for ${process.platform}-${process.arch}; Nexel will use clangd from PATH.`); return []; }
  return [k];
}

const keys = parseKeys(process.argv.slice(2));
for (const k of keys) await install(k);
