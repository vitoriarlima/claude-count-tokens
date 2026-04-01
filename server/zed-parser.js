import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { platform } from 'node:process';
import initSqlJs from 'sql.js';
import { decompress } from 'fzstd';

const CLAUDE_CODE_LAUNCH = new Date('2025-02-24');

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localHour(date) {
  return date.getHours();
}

function addToDaily(map, dateStr, tokens, input, output, cacheCreate, cacheRead) {
  const day = map.get(dateStr) || { tokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  day.tokens += tokens;
  day.inputTokens += input;
  day.outputTokens += output;
  day.cacheCreationTokens += cacheCreate;
  day.cacheReadTokens += cacheRead;
  map.set(dateStr, day);
}

function addToHourly(map, dateStr, hour, tokens) {
  if (!map.has(dateStr)) map.set(dateStr, new Array(24).fill(0));
  map.get(dateStr)[hour] += tokens;
}

function addToMonthly(map, monthStr, tokens, input, output, cacheCreate, cacheRead) {
  const m = map.get(monthStr) || { tokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  m.tokens += tokens;
  m.inputTokens += input;
  m.outputTokens += output;
  m.cacheCreationTokens += cacheCreate;
  m.cacheReadTokens += cacheRead;
  map.set(monthStr, m);
}

function emptyResult() {
  return {
    dailyMap: new Map(),
    hourlyMap: new Map(),
    monthlyMap: new Map(),
    modelMap: new Map(),
  };
}

export function getZedThreadsDbPath() {
  const home = homedir();
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Zed', 'threads', 'threads.db');
  }
  if (platform === 'linux') {
    const xdgDataHome = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
    return join(xdgDataHome, 'zed', 'threads', 'threads.db');
  }
  return null;
}

function extractTokenUsage(requestTokenUsage) {
  if (!requestTokenUsage) return null;

  let entries;
  if (Array.isArray(requestTokenUsage)) {
    entries = requestTokenUsage;
  } else if (typeof requestTokenUsage === 'object') {
    entries = Object.values(requestTokenUsage);
  } else {
    return null;
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheCreate = 0;
  let totalCacheRead = 0;

  for (const usage of entries) {
    if (!usage || typeof usage !== 'object') continue;
    totalInput += usage.input_tokens || 0;
    totalOutput += usage.output_tokens || 0;
    totalCacheCreate += usage.cache_creation_input_tokens || 0;
    totalCacheRead += usage.cache_read_input_tokens || 0;
  }

  const totalTokens = totalInput + totalOutput + totalCacheCreate + totalCacheRead;
  if (totalTokens === 0) return null;

  return { totalTokens, totalInput, totalOutput, totalCacheCreate, totalCacheRead };
}

export async function parseZedThreads(daysBack = 3650) {
  try {
    const dbPath = getZedThreadsDbPath();
    if (!dbPath) return emptyResult();

    let buffer;
    try {
      buffer = await readFile(dbPath);
    } catch {
      return emptyResult();
    }

    const now = new Date();
    const cutoffByDays = new Date(now.getTime() - daysBack * 86400000);
    const cutoff = cutoffByDays > CLAUDE_CODE_LAUNCH ? cutoffByDays : CLAUDE_CODE_LAUNCH;

    const SQL = await initSqlJs();
    const db = new SQL.Database(buffer);

    const dailyMap = new Map();
    const hourlyMap = new Map();
    const monthlyMap = new Map();
    const modelMap = new Map();

    try {
      const results = db.exec('SELECT id, created_at, data FROM threads WHERE parent_id IS NULL');
      if (!results.length) return emptyResult();

      const rows = results[0].values;

      for (const row of rows) {
        try {
          const createdAt = row[1];
          const dataBlob = row[2];

          if (!createdAt || !dataBlob) continue;

          const ts = new Date(createdAt);
          if (Number.isNaN(ts.getTime()) || ts < cutoff) continue;

          const decompressed = decompress(new Uint8Array(dataBlob));
          const json = new TextDecoder().decode(decompressed);
          const threadData = JSON.parse(json);

          const usage = extractTokenUsage(threadData.request_token_usage);
          if (!usage) continue;

          const dateStr = localDateString(ts);
          const hour = localHour(ts);
          const monthStr = dateStr.slice(0, 7);

          addToDaily(dailyMap, dateStr, usage.totalTokens, usage.totalInput, usage.totalOutput, usage.totalCacheCreate, usage.totalCacheRead);
          addToHourly(hourlyMap, dateStr, hour, usage.totalTokens);
          addToMonthly(monthlyMap, monthStr, usage.totalTokens, usage.totalInput, usage.totalOutput, usage.totalCacheCreate, usage.totalCacheRead);

          if (threadData.model && typeof threadData.model === 'object' && threadData.model.provider && threadData.model.model) {
            const modelKey = `${threadData.model.provider}/${threadData.model.model}`;
            modelMap.set(modelKey, (modelMap.get(modelKey) || 0) + usage.totalTokens);
          }
        } catch {
          continue;
        }
      }
    } finally {
      db.close();
    }

    return { dailyMap, hourlyMap, monthlyMap, modelMap };
  } catch (err) {
    console.warn('Warning: failed to parse Zed threads database:', err.message);
    return emptyResult();
  }
}