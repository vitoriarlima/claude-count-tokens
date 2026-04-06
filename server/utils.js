export function addToDaily(map, dateStr, tokens, input, output, cacheCreate, cacheRead) {
  const day = map.get(dateStr) || { tokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  day.tokens += tokens;
  day.inputTokens += input;
  day.outputTokens += output;
  day.cacheCreationTokens += cacheCreate;
  day.cacheReadTokens += cacheRead;
  map.set(dateStr, day);
}

export function addToHourly(map, dateStr, hour, tokens) {
  if (!map.has(dateStr)) map.set(dateStr, new Array(24).fill(0));
  map.get(dateStr)[hour] += tokens;
}

export function addToMonthly(map, monthStr, tokens, input, output, cacheCreate, cacheRead) {
  const m = map.get(monthStr) || { tokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  m.tokens += tokens;
  m.inputTokens += input;
  m.outputTokens += output;
  m.cacheCreationTokens += cacheCreate;
  m.cacheReadTokens += cacheRead;
  map.set(monthStr, m);
}

export function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localHour(date) {
  return date.getHours();
}
