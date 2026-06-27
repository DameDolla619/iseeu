const https = require('https');
const http = require('http');
const crypto = require('crypto');
const dns = require('dns');

function httpReq(method, url, body = null, headers = {}, timeout = 4000) {
  return new Promise((resolve) => {
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
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', headers: {} }); });
    if (body) req.write(body);
    req.end();
  });
}

// Each checker returns: { found: boolean, platform: string, cat: string, url: string|null, avatar: string|null, info: string|null }

const EMAIL_CHECKERS = [
  {
    name: 'Gravatar', cat: 'Identity', icon: 'gravatar.com',
    check: async (email) => {
      const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
      const r = await httpReq('GET', `https://en.gravatar.com/${hash}.json`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          const e = d.entry?.[0];
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
          if (d.total_count > 0 && d.items?.[0]) {
            const u = d.items[0];
            return { found: true, url: u.html_url, avatar: u.avatar_url, info: u.login };
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
        try {
          const d = JSON.parse(r.body);
          if (d.status === 20) return { found: true, url: 'https://open.spotify.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Microsoft / Outlook', cat: 'Email', icon: 'microsoft.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://login.live.com/GetCredentialType.srf',
        JSON.stringify({ username: email, uaid: '', isOtherIdpSupported: false, checkPhones: false, isRemoteNGCSupported: true, isCookieBannerShown: false, isFidoSupported: false }),
        { 'Content-Type': 'application/json' }
      );
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.IfExistsResult === 0 || d.IfExistsResult === 5 || d.IfExistsResult === 6) {
            return { found: true, url: 'https://outlook.live.com', avatar: null, info: 'Microsoft account exists' };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Discord', cat: 'Social Media', icon: 'discord.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://discord.com/api/v9/auth/forgot',
        JSON.stringify({ email }),
        { 'Content-Type': 'application/json' }
      );
      // Discord returns 204 if email exists (password reset sent), 400 if not
      if (r.status === 204) return { found: true, url: 'https://discord.com', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Twitter / X', cat: 'Social Media', icon: 'x.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://api.twitter.com/i/users/email_available.json?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.valid === false) return { found: true, url: 'https://x.com', avatar: null, info: 'Email taken (account exists)' };
        } catch {}
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
          if (d.users && d.users.length > 0) {
            const u = d.users[0];
            return { found: true, url: `https://www.duolingo.com/profile/${u.username}`, avatar: u.picture ? `https://simg-ssl.duolingo.com/avatars/${u.id}/${u.picture}/xlarge` : null, info: u.username };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'WordPress', cat: 'Writing', icon: 'wordpress.com',
    check: async (email) => {
      const body = `user_login=${encodeURIComponent(email)}&redirect_to=`;
      const r = await httpReq('POST', 'https://wordpress.com/wp-login.php?action=lostpassword', body, { 'Content-Type': 'application/x-www-form-urlencoded' });
      // If account exists, usually redirects or shows success; if not, shows error
      if (r.status === 302 || (r.body && !r.body.toLowerCase().includes('no account') && !r.body.toLowerCase().includes('invalid'))) {
        if (r.body && r.body.toLowerCase().includes('check your email')) return { found: true, url: 'https://wordpress.com', avatar: null, info: 'Account registered' };
      }
      return { found: false };
    }
  },
  {
    name: 'Pinterest', cat: 'Social Media', icon: 'pinterest.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.pinterest.com/resource/EmailExistsResource/get/?source_url=/&data={"options":{"email":"${email}"}}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.resource_response?.data === true) return { found: true, url: 'https://pinterest.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Adobe', cat: 'Software', icon: 'adobe.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://auth.services.adobe.com/signin/v2/users/accounts',
        JSON.stringify({ email }),
        { 'Content-Type': 'application/json' }
      );
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.length > 0 || (Array.isArray(d) && d.some(a => a.type))) return { found: true, url: 'https://account.adobe.com', avatar: null, info: 'Adobe account exists' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Flickr', cat: 'Photography', icon: 'flickr.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.flickr.com/signup/checkemailaddress?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('taken')) return { found: true, url: 'https://flickr.com', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Tumblr', cat: 'Social Media', icon: 'tumblr.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://www.tumblr.com/api/v2/register/email_available',
        JSON.stringify({ email }),
        { 'Content-Type': 'application/json' }
      );
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.response?.available === false) return { found: true, url: 'https://tumblr.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Patreon', cat: 'Creator', icon: 'patreon.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.patreon.com/api/auth/email-available?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.available === false) return { found: true, url: 'https://patreon.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Lastfm', cat: 'Music', icon: 'last.fm',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.last.fm/join/partial/validate?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('already')) return { found: true, url: 'https://last.fm', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Imgur', cat: 'Images', icon: 'imgur.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://api.imgur.com/account/v1/emails/${encodeURIComponent(email)}`, null, { Authorization: 'Client-ID 546c25a59c58ad7' });
      if (r.status === 200) return { found: true, url: 'https://imgur.com', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Snapchat', cat: 'Social Media', icon: 'snapchat.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://accounts.snapchat.com/accounts/merlin/check_email',
        JSON.stringify({ email }),
        { 'Content-Type': 'application/json' }
      );
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.email_taken) return { found: true, url: 'https://snapchat.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Evernote', cat: 'Productivity', icon: 'evernote.com',
    check: async (email) => {
      const r = await httpReq('POST', 'https://www.evernote.com/Registration.action',
        `email=${encodeURIComponent(email)}&stage=checkEmailAddress`,
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
      if (r.status === 200 && r.body.includes('already')) return { found: true, url: 'https://evernote.com', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
  {
    name: 'Wattpad', cat: 'Writing', icon: 'wattpad.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.wattpad.com/api/v3/users/validate?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.taken || d.email_taken) return { found: true, url: 'https://wattpad.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Chess.com', cat: 'Gaming', icon: 'chess.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://www.chess.com/callback/email/available?email=${encodeURIComponent(email)}`);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.isEmailAvailable === false) return { found: true, url: 'https://chess.com', avatar: null, info: 'Account registered' };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Shopify', cat: 'Commerce', icon: 'shopify.com',
    check: async (email) => {
      const r = await httpReq('GET', `https://accounts.shopify.com/lookup?email=${encodeURIComponent(email)}`);
      if (r.status === 200 && r.body.includes('found')) return { found: true, url: 'https://shopify.com', avatar: null, info: 'Account registered' };
      return { found: false };
    }
  },
];

// MX-based email provider detection
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

// Run all email checks in parallel — FAST
async function checkEmail(email, onResult) {
  const startTime = Date.now();

  // Fire all checks at once
  const promises = EMAIL_CHECKERS.map(async (checker, idx) => {
    try {
      const result = await checker.check(email);
      const data = {
        id: idx,
        platform: checker.name,
        cat: checker.cat,
        icon: checker.icon,
        found: result.found,
        url: result.url || null,
        avatar: result.avatar || null,
        info: result.info || null,
        verified: result.found,
      };
      onResult(data);
      return data;
    } catch {
      onResult({ id: idx, platform: checker.name, cat: checker.cat, icon: checker.icon, found: false });
      return null;
    }
  });

  const results = await Promise.allSettled(promises);
  const found = results.filter(r => r.status === 'fulfilled' && r.value?.found).map(r => r.value);

  return {
    found,
    total: EMAIL_CHECKERS.length,
    time: ((Date.now() - startTime) / 1000).toFixed(1),
  };
}

module.exports = { EMAIL_CHECKERS, checkEmail, detectEmailProvider };
