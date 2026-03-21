#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverLogFiles } from './discovery.js';
import { parseLogFiles } from './parser.js';
import { createWatcher } from './watcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const isExport = args[0] === 'export';

function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

const port = parseInt(getArg('--port', '7890'), 10);
const days = parseInt(getArg('--days', '3650'), 10); // 10 years — parse all available data
const projectsDir = getArg('--projects-dir', null);
const projectFilter = getArg('--project', null);

// --- State ---
let currentData = null;
const sseClients = new Set();

async function refreshData() {
  const files = await discoverLogFiles(projectsDir, projectFilter);
  currentData = await parseLogFiles(files, days);
  // Notify all SSE clients
  for (const res of sseClients) {
    res.write(`data: updated\n\n`);
  }
}

// --- Export mode ---
if (isExport) {
  const outputPath = getArg('-o', getArg('--output', './claude-token-data.json'));
  await refreshData();
  await writeFile(outputPath, JSON.stringify(currentData, null, 2));
  console.log(`Exported token data to ${outputPath}`);
  process.exit(0);
}

// --- Server mode ---
async function serveFile(res, filePath, contentType) {
  try {
    const content = await readFile(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;

  // CORS headers for embedding
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (path === '/' || path === '/index.html') {
    await serveFile(res, join(ROOT, 'index.html'), 'text/html; charset=utf-8');
  } else if (path === '/widget/claude-token-heatmap.js') {
    await serveFile(res, join(ROOT, 'widget', 'claude-token-heatmap.js'), 'application/javascript; charset=utf-8');
  } else if (path === '/api/data') {
    if (!currentData) await refreshData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentData));
  } else if (path === '/api/events') {
    // Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: connected\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Initial parse
console.log('Parsing Claude Code logs...');
await refreshData();

const totalTokens = currentData.summary.totalTokens;
const totalDays = currentData.summary.totalDays;
console.log(`Found ${formatTokens(totalTokens)} tokens across ${totalDays} days`);

// Start watcher
const watcher = createWatcher(async () => {
  console.log('Log changes detected, refreshing...');
  await refreshData();
}, projectsDir);

// Start server
server.listen(port, () => {
  console.log(`\n  claude-count-tokens is running\n`);
  console.log(`  Dashboard:  http://localhost:${port}`);
  console.log(`  API:        http://localhost:${port}/api/data`);
  console.log(`  Live:       watching ~/.claude/projects/ for changes\n`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  watcher.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  watcher.close();
  server.close();
  process.exit(0);
});

function formatTokens(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
