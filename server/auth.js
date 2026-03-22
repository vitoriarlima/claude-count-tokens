import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';
import { saveConfig, clearConfig } from './config.js';

/**
 * Open a URL in the user's default browser (cross-platform).
 */
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

/**
 * Log in via GitHub OAuth through Supabase.
 * 1. Starts a local HTTP server on a random port
 * 2. Opens browser to Supabase GitHub OAuth
 * 3. Receives callback with auth code
 * 4. Exchanges code for session
 * 5. Saves credentials locally
 */
export async function login() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Missing auth code');
        server.close();
        reject(new Error('No auth code received'));
        return;
      }

      try {
        // Exchange the code for a session
        const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          throw new Error(`Token exchange failed: ${err}`);
        }

        const session = await tokenRes.json();

        // Get user profile (GitHub username)
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        });

        if (!userRes.ok) throw new Error('Failed to fetch user profile');
        const user = await userRes.json();

        const username = user.user_metadata?.user_name
          || user.user_metadata?.preferred_username
          || user.email?.split('@')[0]
          || 'unknown';

        // Save config locally
        await saveConfig({
          supabaseAccessToken: session.access_token,
          supabaseRefreshToken: session.refresh_token,
          username,
          userId: user.id,
        });

        // Send success page to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fafafa;">
              <div style="text-align: center;">
                <h1 style="color: #333;">&#10003; Logged in!</h1>
                <p style="color: #666;">You can close this window and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);

        server.close();

        console.log(`\n  ✓ Logged in as ${username}\n`);
        console.log(`  Your widget embed:`);
        console.log(`  <claude-token-heatmap user="${username}" palette="spring">\n`);

        resolve({ username, userId: user.id });
      } catch (err) {
        res.writeHead(500);
        res.end('Authentication failed');
        server.close();
        reject(err);
      }
    });

    // Listen on random port
    server.listen(0, () => {
      const port = server.address().port;
      const redirectTo = encodeURIComponent(`http://localhost:${port}/callback`);
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${redirectTo}`;

      console.log('Opening browser for GitHub login...');
      openBrowser(authUrl);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Login timed out — no callback received within 2 minutes'));
    }, 120_000);
  });
}

/**
 * Log out — clear local credentials.
 */
export async function logout() {
  await clearConfig();
  console.log('  ✓ Logged out. Config cleared.\n');
}

/**
 * Refresh an expired access token using the refresh token.
 * Returns the new session or null if refresh fails.
 */
export async function refreshSession(refreshToken) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
