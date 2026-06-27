const https = require('https');
const http = require('http');

function httpReq(method, url, body = null, headers = {}, timeout = 5000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,*/*',
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

// ── BACKGROUND CHECK MODULES ──

const BG_CHECKS = [
  // ── Sex Offender Registry (NSOPW) ──
  {
    name: 'Sex Offender Registry (NSOPW)',
    cat: 'Criminal',
    icon: '⚠️',
    type: 'name',
    check: async (query) => {
      const parts = query.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts[parts.length - 1] || '';
      if (!firstName || !lastName) return { found: false };
      const r = await httpReq('GET', `https://www.nsopw.gov/api/Search?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&stateId=0`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d && Array.isArray(d) && d.length > 0) {
            return { found: true, count: d.length, info: `${d.length} potential match(es) in national sex offender registry`, url: `https://www.nsopw.gov/Search?FirstName=${encodeURIComponent(firstName)}&LastName=${encodeURIComponent(lastName)}` };
          }
        } catch {}
      }
      return { found: false, info: 'No matches in NSOPW', url: `https://www.nsopw.gov/Search?FirstName=${encodeURIComponent(firstName)}&LastName=${encodeURIComponent(lastName)}` };
    }
  },

  // ── Federal Bureau of Prisons Inmate Locator ──
  {
    name: 'Federal Inmate Search (BOP)',
    cat: 'Criminal',
    icon: '🔒',
    type: 'name',
    check: async (query) => {
      const parts = query.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts[parts.length - 1] || '';
      if (!firstName || !lastName) return { found: false };
      const r = await httpReq('GET', `https://www.bop.gov/PublicInfo/execute/inmateloc?todo=query&output=json&nameFirst=${encodeURIComponent(firstName)}&nameLast=${encodeURIComponent(lastName)}`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.InmateLocator && d.InmateLocator.length > 0) {
            const inmates = d.InmateLocator;
            return {
              found: true,
              count: inmates.length,
              info: `${inmates.length} federal inmate record(s) found`,
              details: inmates.slice(0, 5).map(i => ({
                name: `${i.nameFirst || i.firstName || ''} ${i.nameLast || i.lastName || ''}`.trim(),
                age: i.age,
                race: i.race,
                sex: i.sex,
                facility: i.fapiName,
                register: i.registerNumber,
                releaseDate: i.projRelDate || i.actRelDate || 'Unknown',
              })),
              url: `https://www.bop.gov/inmateloc/`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'No federal inmate records', url: 'https://www.bop.gov/inmateloc/' };
    }
  },

  // ── US Court Records (PACER via RECAP/CourtListener) ──
  {
    name: 'Federal Court Records',
    cat: 'Court Records',
    icon: '⚖️',
    type: 'name',
    check: async (query) => {
      const r = await httpReq('GET', `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=r`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.count > 0 && d.results?.length > 0) {
            return {
              found: true,
              count: d.count,
              info: `${d.count} federal court record(s) found`,
              details: d.results.slice(0, 5).map(c => ({
                caseName: c.caseName,
                court: c.court,
                dateFiled: c.dateFiled,
                docketNumber: c.docketNumber,
              })),
              url: `https://www.courtlistener.com/?q=${encodeURIComponent(query)}&type=r`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'No federal court records found', url: `https://www.courtlistener.com/?q=${encodeURIComponent(query)}&type=r` };
    }
  },

  // ── State Business Registration (OpenCorporates) ──
  {
    name: 'Business Registrations',
    cat: 'Business Records',
    icon: '🏢',
    type: 'name',
    check: async (query) => {
      const r = await httpReq('GET', `https://api.opencorporates.com/v0.4/officers/search?q=${encodeURIComponent(query)}&per_page=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.results?.officers?.length > 0) {
            return {
              found: true,
              count: d.results.total_count,
              info: `${d.results.total_count} business registration(s) found`,
              details: d.results.officers.slice(0, 5).map(o => ({
                name: o.officer?.name,
                position: o.officer?.position,
                company: o.officer?.company?.name,
                jurisdiction: o.officer?.company?.jurisdiction_code,
                status: o.officer?.company?.company_status || 'Unknown',
              })),
              url: `https://opencorporates.com/officers?q=${encodeURIComponent(query)}`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'No business registrations found', url: `https://opencorporates.com/officers?q=${encodeURIComponent(query)}` };
    }
  },

  // ── US Patent & Trademark Office ──
  {
    name: 'USPTO Patents & Trademarks',
    cat: 'Business Records',
    icon: '📜',
    type: 'name',
    check: async (query) => {
      const r = await httpReq('GET', `https://developer.uspto.gov/ibd-api/v1/patent/application?searchText=${encodeURIComponent(query)}&rows=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.response?.numFound > 0 && d.response?.docs?.length > 0) {
            return {
              found: true,
              count: d.response.numFound,
              info: `${d.response.numFound} patent/trademark record(s)`,
              details: d.response.docs.slice(0, 5).map(p => ({
                title: p.inventionTitle,
                date: p.datePublished,
                applicant: p.applicantFileReference,
              })),
              url: `https://ppubs.uspto.gov/pubwebapp/static/pages/searchable/home.html`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },

  // ── FEC Political Donations ──
  {
    name: 'Political Donations (FEC)',
    cat: 'Public Records',
    icon: '🗳️',
    type: 'name',
    check: async (query) => {
      const parts = query.trim().split(/\s+/);
      const r = await httpReq('GET', `https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_name=${encodeURIComponent(query)}&per_page=5&api_key=DEMO_KEY`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.pagination?.count > 0 && d.results?.length > 0) {
            return {
              found: true,
              count: d.pagination.count,
              info: `${d.pagination.count} political donation(s) on record`,
              details: d.results.slice(0, 5).map(don => ({
                contributor: don.contributor_name,
                amount: '$' + (don.contribution_receipt_amount || 0).toFixed(2),
                date: don.contribution_receipt_date,
                committee: don.committee?.name,
                city: don.contributor_city,
                state: don.contributor_state,
                employer: don.contributor_employer,
                occupation: don.contributor_occupation,
              })),
              url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(query)}`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },

  // ── Wikipedia / Notable Person Check ──
  {
    name: 'Wikipedia',
    cat: 'Public Records',
    icon: '📖',
    type: 'name',
    check: async (query) => {
      const r = await httpReq('GET', `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, '_'))}`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.type === 'standard' && d.extract) {
            return {
              found: true,
              info: d.extract.substring(0, 200),
              avatar: d.thumbnail?.source || null,
              url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/\s+/g, '_'))}`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },

  // ── GitHub (by name search) ──
  {
    name: 'GitHub Profiles',
    cat: 'Digital Footprint',
    icon: '💻',
    type: 'name',
    check: async (query) => {
      const r = await httpReq('GET', `https://api.github.com/search/users?q=${encodeURIComponent(query)}+in:fullname&per_page=5`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.total_count > 0 && d.items?.length > 0) {
            return {
              found: true,
              count: d.total_count,
              info: `${d.total_count} GitHub profile(s) matching this name`,
              details: d.items.slice(0, 5).map(u => ({
                username: u.login,
                avatar: u.avatar_url,
                url: u.html_url,
              })),
              url: `https://github.com/search?q=${encodeURIComponent(query)}&type=users`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },

  // ── Gravatar (by name) ──
  {
    name: 'Gravatar Profile',
    cat: 'Digital Footprint',
    icon: '👤',
    type: 'name',
    check: async (query) => {
      const slug = query.toLowerCase().replace(/\s+/g, '');
      const r = await httpReq('GET', `https://en.gravatar.com/${slug}.json`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.entry?.[0]) {
            const e = d.entry[0];
            return {
              found: true,
              info: e.displayName || slug,
              avatar: e.thumbnailUrl,
              url: e.profileUrl,
              details: [{
                name: e.displayName,
                location: e.currentLocation,
                about: e.aboutMe,
                accounts: (e.accounts || []).map(a => a.shortname),
              }],
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },

  // ── Wayback Machine (Internet Archive) ──
  {
    name: 'Internet Archive History',
    cat: 'Digital Footprint',
    icon: '🕰️',
    type: 'name',
    check: async (query) => {
      const slug = query.toLowerCase().replace(/\s+/g, '');
      const urls = [`${slug}.com`, `${slug}.org`, `${slug}.net`];
      for (const testUrl of urls) {
        const r = await httpReq('GET', `https://archive.org/wayback/available?url=${testUrl}`, null, {}, 5000);
        if (r.status === 200) {
          try {
            const d = JSON.parse(r.body);
            if (d.archived_snapshots?.closest?.url) {
              return {
                found: true,
                info: `Web archive found for ${testUrl} (${d.archived_snapshots.closest.timestamp?.substring(0, 4) || 'unknown'})`,
                url: d.archived_snapshots.closest.url,
              };
            }
          } catch {}
        }
      }
      return { found: false };
    }
  },

  // ── Data Breach Check (Have I Been Pwned - name search) ──
  {
    name: 'Known Data Breaches',
    cat: 'Security',
    icon: '🛡️',
    type: 'email',
    check: async (query) => {
      // HIBP requires API key for email lookups, so we check the breach list and match
      const r = await httpReq('GET', 'https://haveibeenpwned.com/api/v3/breaches', null, {}, 5000);
      if (r.status === 200) {
        try {
          const breaches = JSON.parse(r.body);
          // Return the list of known breaches as context
          return {
            found: false,
            info: `${breaches.length} known data breaches in database. Full email check requires HIBP API key ($3.50/mo). Visit haveibeenpwned.com to check directly.`,
            url: `https://haveibeenpwned.com/`,
          };
        } catch {}
      }
      return { found: false };
    }
  },

  // ── Voter Registration (limited - some states) ──
  {
    name: 'Voter Registration',
    cat: 'Public Records',
    icon: '🗳️',
    type: 'name',
    check: async (query) => {
      return {
        found: false,
        info: 'Voter registration records vary by state. Check your state\'s Secretary of State website.',
        url: 'https://www.vote.org/am-i-registered-to-vote/',
      };
    }
  },

  // ── LinkedIn (public search) ──
  {
    name: 'LinkedIn Profiles',
    cat: 'Professional',
    icon: '💼',
    type: 'name',
    check: async (query) => {
      // Google-dorking LinkedIn
      const r = await httpReq('GET', `https://www.google.com/search?q=site:linkedin.com/in+${encodeURIComponent(query)}&num=5`, null, {}, 5000);
      if (r.status === 200 && r.body.includes('linkedin.com/in/')) {
        const matches = r.body.match(/https?:\/\/\w+\.linkedin\.com\/in\/[a-zA-Z0-9\-]+/g) || [];
        const unique = [...new Set(matches)].slice(0, 5);
        if (unique.length > 0) {
          return {
            found: true,
            count: unique.length,
            info: `${unique.length} LinkedIn profile(s) found`,
            details: unique.map(url => ({ url, username: url.split('/in/')[1] })),
            url: unique[0],
          };
        }
      }
      return { found: false, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}` };
    }
  },
];

async function runBackgroundCheck(query, type, onResult) {
  const startTime = Date.now();
  const checks = BG_CHECKS.filter(c => c.type === type || c.type === 'both');

  const promises = checks.map(async (checker, idx) => {
    try {
      const result = await checker.check(query);
      const data = {
        id: idx,
        module: checker.name,
        cat: checker.cat,
        icon: checker.icon,
        found: result.found,
        count: result.count || 0,
        info: result.info || null,
        details: result.details || null,
        avatar: result.avatar || null,
        url: result.url || null,
      };
      if (onResult) onResult(data);
      return data;
    } catch (e) {
      const data = { id: idx, module: checker.name, cat: checker.cat, icon: checker.icon, found: false, info: 'Check failed' };
      if (onResult) onResult(data);
      return data;
    }
  });

  const results = await Promise.allSettled(promises);
  const found = results.filter(r => r.status === 'fulfilled' && r.value?.found).map(r => r.value);

  return {
    found,
    total: checks.length,
    time: ((Date.now() - startTime) / 1000).toFixed(1),
  };
}

module.exports = { BG_CHECKS, runBackgroundCheck };
