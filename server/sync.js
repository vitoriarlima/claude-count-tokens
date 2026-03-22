import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';
import { getConfig, saveConfig } from './config.js';
import { refreshSession } from './auth.js';
import { discoverLogFiles } from './discovery.js';
import { parseLogFiles } from './parser.js';

/**
 * Sync token data to Supabase Storage.
 * Exports local Claude Code logs and uploads to cloud.
 */
export async function sync(options = {}) {
  // 1. Check config
  const config = await getConfig();
  if (!config?.supabaseAccessToken) {
    console.error('  ✗ Not logged in. Run: npx claude-count-tokens login\n');
    process.exit(1);
  }

  let { supabaseAccessToken, supabaseRefreshToken, username, userId } = config;

  // 2. Parse local logs
  const { days = 3650, projectsDir = null, projectFilter = null } = options;
  console.log('  Parsing local Claude Code logs...');
  const files = await discoverLogFiles(projectsDir, projectFilter);
  const data = await parseLogFiles(files, days);

  const totalTokens = data.summary.totalTokens;
  const totalDays = data.summary.totalDays;
  console.log(`  Found ${formatTokens(totalTokens)} tokens across ${totalDays} days`);

  // 3. Upload to Supabase Storage
  console.log('  Uploading to cloud...');

  let res = await uploadToStorage(supabaseAccessToken, username, data);

  // If 401, try refreshing the token
  if (res.status === 401 && supabaseRefreshToken) {
    console.log('  Token expired, refreshing...');
    const newSession = await refreshSession(supabaseRefreshToken);
    if (newSession) {
      supabaseAccessToken = newSession.access_token;
      supabaseRefreshToken = newSession.refresh_token;
      await saveConfig({ ...config, supabaseAccessToken, supabaseRefreshToken });
      res = await uploadToStorage(supabaseAccessToken, username, data);
    }
  }

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ✗ Upload failed: ${err}\n`);
    process.exit(1);
  }

  console.log(`\n  ✓ Synced to cloud. Widget is live.`);
  console.log(`  Public URL: ${SUPABASE_URL}/storage/v1/object/public/token-data/${username}.json\n`);
}

/**
 * Upload JSON data to Supabase Storage.
 * Uses upsert (POST with x-upsert header) to create or overwrite.
 */
async function uploadToStorage(accessToken, username, data) {
  return fetch(`${SUPABASE_URL}/storage/v1/object/token-data/${username}.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(data),
  });
}

function formatTokens(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
