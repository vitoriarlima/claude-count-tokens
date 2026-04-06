import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';
import { addToDaily, addToHourly, addToMonthly, localDateString, localHour } from './utils.js';

const CLAUDE_CODE_LAUNCH = new Date('2025-02-24');

export async function parseLogFiles(filePaths, daysBack = 3650) {
  const { dailyMap, hourlyMap, monthlyMap, modelMap, now, cutoff } = await parseLogFilesRaw(filePaths, daysBack);
  return buildOutput(now, cutoff, dailyMap, hourlyMap, monthlyMap, modelMap);
}

export async function parseLogFilesRaw(filePaths, daysBack = 3650) {
  const now = new Date();
  const cutoffByDays = new Date(now.getTime() - daysBack * 86400000);
  const cutoff = cutoffByDays > CLAUDE_CODE_LAUNCH ? cutoffByDays : CLAUDE_CODE_LAUNCH;
  const seenUuids = new Set();

  const dailyMap = new Map();
  const hourlyMap = new Map();
  const monthlyMap = new Map();
  const modelMap = new Map();

  for (const filePath of filePaths) {
    await parseConversationFile(filePath, cutoff, seenUuids, dailyMap, hourlyMap, monthlyMap, modelMap);
  }

  const historyPath = join(homedir(), '.claude', 'history.jsonl');
  const historyExists = await stat(historyPath).catch(() => null);
  if (historyExists?.isFile()) {
    await parseHistoryFile(historyPath, cutoff, dailyMap, hourlyMap, monthlyMap);
  }

  return { dailyMap, hourlyMap, monthlyMap, modelMap, now, cutoff };
}

export function mergeMaps(mapsA, mapsB) {
  const dailyMap = new Map(mapsA.dailyMap);
  const hourlyMap = new Map(mapsA.hourlyMap);
  const monthlyMap = new Map(mapsA.monthlyMap);
  const modelMap = new Map(mapsA.modelMap);

  for (const [dateStr, data] of mapsB.dailyMap) {
    addToDaily(dailyMap, dateStr, data.tokens, data.inputTokens, data.outputTokens, data.cacheCreationTokens, data.cacheReadTokens);
  }

  for (const [dateStr, hours] of mapsB.hourlyMap) {
    if (!hourlyMap.has(dateStr)) hourlyMap.set(dateStr, new Array(24).fill(0));
    const target = hourlyMap.get(dateStr);
    for (let i = 0; i < 24; i++) target[i] += hours[i] || 0;
  }

  for (const [monthStr, data] of mapsB.monthlyMap) {
    addToMonthly(monthlyMap, monthStr, data.tokens, data.inputTokens, data.outputTokens, data.cacheCreationTokens, data.cacheReadTokens);
  }

  for (const [model, tokens] of mapsB.modelMap) {
    modelMap.set(model, (modelMap.get(model) || 0) + tokens);
  }

  return { dailyMap, hourlyMap, monthlyMap, modelMap };
}

async function parseConversationFile(filePath, cutoff, seenUuids, dailyMap, hourlyMap, monthlyMap, modelMap) {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== 'assistant') continue;
    if (!entry.message?.usage) continue;
    if (!entry.timestamp) continue;

    if (entry.uuid) {
      if (seenUuids.has(entry.uuid)) continue;
      seenUuids.add(entry.uuid);
    }

    const ts = new Date(entry.timestamp);
    if (ts < cutoff) continue;

    const usage = entry.message.usage;
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    const dateStr = localDateString(ts);
    const hour = localHour(ts);
    const monthStr = dateStr.slice(0, 7);

    addToDaily(dailyMap, dateStr, totalTokens, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
    addToHourly(hourlyMap, dateStr, hour, totalTokens);
    addToMonthly(monthlyMap, monthStr, totalTokens, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);

    const model = entry.message.model || 'unknown';
    modelMap.set(model, (modelMap.get(model) || 0) + totalTokens);
  }
}

/**
 * Parse history.jsonl — has prompt entries with epoch timestamps but no token counts.
 * We use these to show activity (prompts per day) for dates that have no token data.
 * Each prompt is estimated at ~4000 tokens (rough average for a prompt+response cycle).
 */
async function parseHistoryFile(filePath, cutoff, dailyMap, hourlyMap, monthlyMap) {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const ESTIMATED_TOKENS_PER_PROMPT = 4000;

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (!entry.timestamp) continue;

    const ts = new Date(typeof entry.timestamp === 'number' ? entry.timestamp : entry.timestamp);
    if (isNaN(ts.getTime())) continue;
    if (ts < cutoff) continue;

    const dateStr = localDateString(ts);
    const hour = localHour(ts);
    const monthStr = dateStr.slice(0, 7);

    if (dailyMap.has(dateStr) && dailyMap.get(dateStr).tokens > ESTIMATED_TOKENS_PER_PROMPT * 10) continue;

    addToDaily(dailyMap, dateStr, ESTIMATED_TOKENS_PER_PROMPT, ESTIMATED_TOKENS_PER_PROMPT, 0, 0, 0);
    addToHourly(hourlyMap, dateStr, hour, ESTIMATED_TOKENS_PER_PROMPT);
    addToMonthly(monthlyMap, monthStr, ESTIMATED_TOKENS_PER_PROMPT, ESTIMATED_TOKENS_PER_PROMPT, 0, 0, 0);
  }
}

export function buildOutput(now, cutoff, dailyMap, hourlyMap, monthlyMap, modelMap) {
  const endDate = localDateString(now);
  const startDate = localDateString(cutoff);

  const daily = {};
  for (const [date, data] of dailyMap) daily[date] = data;

  const hourly = {};
  for (const [date, hours] of hourlyMap) hourly[date] = hours;

  const monthly = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({ month, ...data }));

  const models = {};
  for (const [model, tokens] of modelMap) models[model] = tokens;

  const totalTokens = Array.from(dailyMap.values()).reduce((sum, d) => sum + d.tokens, 0);
  const totalDays = dailyMap.size;
  const dailyAverage = totalDays > 0 ? Math.round(totalTokens / totalDays) : 0;

  let busiestDay = { date: endDate, tokens: 0 };
  for (const [date, data] of dailyMap) {
    if (data.tokens > busiestDay.tokens) busiestDay = { date, tokens: data.tokens };
  }

  let busiestMonth = { month: endDate.slice(0, 7), tokens: 0 };
  for (const [month, data] of monthlyMap) {
    if (data.tokens > busiestMonth.tokens) busiestMonth = { month, tokens: data.tokens };
  }

  return {
    generatedAt: now.toISOString(),
    range: { start: startDate, end: endDate },
    summary: { totalTokens, totalDays, dailyAverage, busiestDay, busiestMonth },
    daily, hourly, monthly, models,
  };
}
