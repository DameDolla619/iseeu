const https = require('https');
const http = require('http');
const crypto = require('crypto');
const dns = require('dns');

function httpReq(method, url, body = null, headers = {}, timeout = 4000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const opts = {
        hostname: u.hostname, port: u.port, path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...headers,
        },
        timeout,
      };
      const req = mod.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      });
      req.on('error', () => resolve({ status: 0, body: '', headers: {} }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', headers: {} })); });
      if (body) req.write(body);
      req.end();
    } catch { resolve({ status: 0, body: '', headers: {} }); }
  });
}

const EMAIL_CHECKERS = [

  // ═══ VERIFIED API CHECKS (these actually confirm registration) ═══

  {
    name: 'Gravatar', cat: 'Identity', icon: 'gravatar.com',
    check: async (email) => {
      const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
      const r = await httpReq('GET', `https://en.gravatar.com/${hash}.json`);
      if (r.status === 200) {
        try {
          const e = JSON.parse(r.body).entry?.[0];
          if (e) return { found: true, url: e.profileUrl, avatar: e.thumbnailUrl, info: e.displayName || null };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'GitHub', cat: 'Development', icon: 'github.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.total_count > 0 && d.items?.[0]) return { found: true, url: d.items[0].html_url, avatar: d.items[0].avatar_url, info: d.items[0].login };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Twitter / X', cat: 'Social Media', icon: 'x.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://api.twitter.com/i/users/email_available.json?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try { if (JSON.parse(r.body).valid === false) return { found: true, url: 'https://x.com', info: 'Email registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Duolingo', cat: 'Education', icon: 'duolingo.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.duolingo.com/2017-06-30/users?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.users?.length > 0) {
            const u = d.users[0];
            return { found: true, url: `https://www.duolingo.com/profile/${u.username}`, avatar: u.picture ? `https://simg-ssl.duolingo.com/avatars/${u.id}/${u.picture}/xlarge` : null, info: u.username };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Spotify', cat: 'Music', icon: 'spotify.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try { if (JSON.parse(r.body).status === 20) return { found: true, url: 'https://open.spotify.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Microsoft / Outlook', cat: 'Email', icon: 'microsoft.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://login.live.com/GetCredentialType.srf',
        JSON.stringify({ username: email }), { 'Content-Type': 'application/json' });
      if (r.status === 200) {
        try { const d = JSON.parse(r.body); if ([0,5,6].includes(d.IfExistsResult)) return { found: true, url: 'https://outlook.live.com', info: 'Microsoft account exists' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Discord', cat: 'Social Media', icon: 'discord.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://discord.com/api/v9/auth/forgot',
        JSON.stringify({ email }), { 'Content-Type': 'application/json' });
      if (r.status === 204) return { found: true, url: 'https://discord.com', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Chess.com', cat: 'Gaming', icon: 'chess.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.chess.com/callback/email/available?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try { if (JSON.parse(r.body).isEmailAvailable === false) return { found: true, url: 'https://chess.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Pinterest', cat: 'Social Media', icon: 'pinterest.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.pinterest.com/resource/EmailExistsResource/get/?source_url=/&data={"options":{"email":"${email}"}}`);
      if (r.status === 200) {
        try { if (JSON.parse(r.body).resource_response?.data === true) return { found: true, url: 'https://pinterest.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Adobe', cat: 'Software', icon: 'adobe.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://auth.services.adobe.com/signin/v2/users/accounts',
        JSON.stringify({ email }), { 'Content-Type': 'application/json' });
      if (r.status === 200) {
        try { const d = JSON.parse(r.body); if (Array.isArray(d) && d.length > 0) return { found: true, url: 'https://account.adobe.com', info: 'Adobe account exists' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Imgur', cat: 'Images', icon: 'imgur.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://api.imgur.com/account/v1/emails/${encodeURIComponent(email)}`, null, { Authorization: 'Client-ID 546c25a59c58ad7' });
      if (r.status === 200) return { found: true, url: 'https://imgur.com', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'WordPress', cat: 'Writing', icon: 'wordpress.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://wordpress.com/wp-login.php?action=lostpassword',
        `user_login=${encodeURIComponent(email)}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
      if (r.body && r.body.toLowerCase().includes('check your email')) return { found: true, url: 'https://wordpress.com', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Tumblr', cat: 'Social Media', icon: 'tumblr.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://www.tumblr.com/api/v2/register/email_available',
        JSON.stringify({ email }), { 'Content-Type': 'application/json' });
      if (r.status === 200) {
        try { if (JSON.parse(r.body).response?.available === false) return { found: true, url: 'https://tumblr.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Patreon', cat: 'Creator', icon: 'patreon.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.patreon.com/api/auth/email-available?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try { if (JSON.parse(r.body).available === false) return { found: true, url: 'https://patreon.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Last.fm', cat: 'Music', icon: 'last.fm',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.last.fm/join/partial/validate?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('already')) return { found: true, url: 'https://last.fm', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Snapchat', cat: 'Social Media', icon: 'snapchat.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://accounts.snapchat.com/accounts/merlin/check_email',
        JSON.stringify({ email }), { 'Content-Type': 'application/json' });
      if (r.status === 200) {
        try { if (JSON.parse(r.body).email_taken) return { found: true, url: 'https://snapchat.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Flickr', cat: 'Photography', icon: 'flickr.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.flickr.com/signup/checkemailaddress?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('taken')) return { found: true, url: 'https://flickr.com', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Wattpad', cat: 'Writing', icon: 'wattpad.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.wattpad.com/api/v3/users/validate?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try { const d = JSON.parse(r.body); if (d.taken || d.email_taken) return { found: true, url: 'https://wattpad.com', info: 'Account registered' }; } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Evernote', cat: 'Productivity', icon: 'evernote.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://www.evernote.com/Registration.action',
        `email=${encodeURIComponent(email)}&stage=checkEmailAddress`, { 'Content-Type': 'application/x-www-form-urlencoded' });
      if (r.status === 200 && r.body.includes('already')) return { found: true, url: 'https://evernote.com', info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Shopify', cat: 'Commerce', icon: 'shopify.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://accounts.shopify.com/lookup?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('found')) return { found: true, url: 'https://shopify.com', info: 'Account registered' };
      return { found: false };
    }
  },

  // ═══ DIRECT SEARCH LINKS (user clicks to verify — always shown) ═══

  { name: 'Google Account', cat: 'Email', icon: 'google.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check if Google account exists', url: `https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin&Email=${encodeURIComponent(email)}` }) },
  { name: 'Facebook', cat: 'Social Media', icon: 'facebook.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Facebook password reset', url: `https://www.facebook.com/login/identify/?ctx=recover&email=${encodeURIComponent(email)}` }) },
  { name: 'Instagram', cat: 'Social Media', icon: 'instagram.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Instagram password reset', url: `https://www.instagram.com/accounts/password/reset/` }) },
  { name: 'TikTok', cat: 'Social Media', icon: 'tiktok.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check TikTok account recovery', url: `https://www.tiktok.com/login/phone-or-email/email` }) },
  { name: 'Amazon', cat: 'Shopping', icon: 'amazon.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Amazon password reset', url: `https://www.amazon.com/ap/forgotpassword?email=${encodeURIComponent(email)}` }) },
  { name: 'Apple ID', cat: 'Tech', icon: 'apple.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Apple ID existence', url: `https://iforgot.apple.com/password/verify/appleid` }) },
  { name: 'Netflix', cat: 'Streaming', icon: 'netflix.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Netflix account', url: `https://www.netflix.com/LoginHelp` }) },
  { name: 'LinkedIn', cat: 'Professional', icon: 'linkedin.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check LinkedIn password reset', url: `https://www.linkedin.com/checkpoint/rp/request-password-reset?email=${encodeURIComponent(email)}` }) },
  { name: 'Reddit', cat: 'Social Media', icon: 'reddit.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Reddit password reset', url: `https://www.reddit.com/password?email=${encodeURIComponent(email)}` }) },
  { name: 'Twitch', cat: 'Streaming', icon: 'twitch.tv', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Twitch account recovery', url: `https://passport.twitch.tv/password_resets/new` }) },
  { name: 'Steam', cat: 'Gaming', icon: 'store.steampowered.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Steam account', url: `https://help.steampowered.com/wizard/HelpWithLoginInfo?issueid=406` }) },
  { name: 'Epic Games', cat: 'Gaming', icon: 'epicgames.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Epic Games account', url: `https://www.epicgames.com/id/forgot-password?email=${encodeURIComponent(email)}` }) },
  { name: 'PayPal', cat: 'Finance', icon: 'paypal.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check PayPal account', url: `https://www.paypal.com/authflow/password-recovery/` }) },
  { name: 'Venmo', cat: 'Finance', icon: 'venmo.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Venmo account', url: `https://venmo.com/forgot-password` }) },
  { name: 'Cash App', cat: 'Finance', icon: 'cash.app', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Cash App account', url: `https://cash.app/login` }) },
  { name: 'Uber', cat: 'Services', icon: 'uber.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Uber account', url: `https://auth.uber.com/v2/?breeze_init_req_id=1&next_url=https://m.uber.com/` }) },
  { name: 'DoorDash', cat: 'Services', icon: 'doordash.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check DoorDash account', url: `https://identity.doordash.com/auth/user/password/reset` }) },
  { name: 'Airbnb', cat: 'Travel', icon: 'airbnb.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Airbnb account', url: `https://www.airbnb.com/login` }) },
  { name: 'Dropbox', cat: 'Cloud', icon: 'dropbox.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Dropbox account', url: `https://www.dropbox.com/forgot?email_address=${encodeURIComponent(email)}` }) },
  { name: 'Zoom', cat: 'Communication', icon: 'zoom.us', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Zoom account', url: `https://zoom.us/forgot_password?email=${encodeURIComponent(email)}` }) },
  { name: 'Slack', cat: 'Communication', icon: 'slack.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Slack workspaces', url: `https://slack.com/signin/find` }) },
  { name: 'OnlyFans', cat: 'Adult', icon: 'onlyfans.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check OnlyFans account', url: `https://onlyfans.com/forgot-password` }) },
  { name: 'Pornhub', cat: 'Adult', icon: 'pornhub.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Pornhub account', url: `https://www.pornhub.com/user/reset_password` }) },
  { name: 'Chaturbate', cat: 'Adult', icon: 'chaturbate.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check Chaturbate account', url: `https://chaturbate.com/auth/password_reset/` }) },
  { name: 'Have I Been Pwned', cat: 'Security', icon: 'haveibeenpwned.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Check all known data breaches for this email — shows which services were compromised', url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}` }) },
  { name: 'DeHashed', cat: 'Security', icon: 'dehashed.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Search leaked databases and breaches', url: `https://www.dehashed.com/search?query=${encodeURIComponent(email)}` }) },
  { name: 'IntelX', cat: 'Security', icon: 'intelx.io', directLink: true,
    check: async (email) => ({ found: false, info: 'Intelligence search — leaked data, pastes, dark web', url: `https://intelx.io/?s=${encodeURIComponent(email)}` }) },
  { name: 'Holehe (Email OSINT)', cat: 'Security', icon: 'github.com', directLink: true,
    check: async (email) => ({ found: false, info: 'Run Holehe locally for comprehensive email registration checks (pip install holehe)', url: `https://github.com/megadose/holehe` }) },
];

async function detectEmailProvider(email) {
  const domain = email.split('@')[1];
  try {
    const mx = await new Promise((res, rej) => dns.resolveMx(domain, (e, r) => e ? rej(e) : res(r)));
    const mxList = mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
    const top = (mxList[0] || '').toLowerCase();
    let provider = top;
    if (top.includes('google')) provider = 'Google / Gmail';
    else if (top.includes('outlook') || top.includes('microsoft')) provider = 'Microsoft 365 / Outlook';
    else if (top.includes('yahoo')) provider = 'Yahoo Mail';
    else if (top.includes('proton')) provider = 'ProtonMail';
    else if (top.includes('zoho')) provider = 'Zoho Mail';
    else if (top.includes('icloud') || top.includes('apple')) provider = 'Apple iCloud';
    return { domain, provider, mx: mxList };
  } catch {
    return { domain, provider: 'Unknown', mx: [] };
  }
}

async function checkEmail(email, onResult) {
  const startTime = Date.now();
  const promises = EMAIL_CHECKERS.map(async (checker, idx) => {
    try {
      const result = await checker.check(email);
      const data = {
        id: idx, platform: checker.name, cat: checker.cat, icon: checker.icon,
        found: result.found, url: result.url || null, avatar: result.avatar || null,
        info: result.info || null, verified: result.found,
        directLink: checker.directLink || false,
      };
      onResult(data);
      return data;
    } catch {
      onResult({ id: idx, platform: checker.name, cat: checker.cat, icon: checker.icon, found: false, directLink: checker.directLink || false });
      return null;
    }
  });
  const results = await Promise.allSettled(promises);
  const found = results.filter(r => r.status === 'fulfilled' && r.value?.found).map(r => r.value);
  return { found, total: EMAIL_CHECKERS.length, time: ((Date.now() - startTime) / 1000).toFixed(1) };
}

module.exports = { EMAIL_CHECKERS, checkEmail, detectEmailProvider };
