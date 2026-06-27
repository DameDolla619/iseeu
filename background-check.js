const https = require('https');
const http = require('http');

function httpReq(method, url, body = null, headers = {}, timeout = 6000) {
  return new Promise((resolve) => {
    try {
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
    } catch { resolve({ status: 0, body: '', headers: {} }); }
  });
}

const BG_CHECKS = [

  // ═══════════════════ CRIMINAL ═══════════════════

  {
    name: 'National Sex Offender Registry (NSOPW)', cat: 'Criminal Records', icon: '⚠️', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      if (!first || !last) return { found: false };
      return { found: false, info: 'Search the national registry directly', url: `https://www.nsopw.gov/Search?FirstName=${encodeURIComponent(first)}&LastName=${encodeURIComponent(last)}`, directLink: true };
    }
  },
  {
    name: 'Federal Inmate Locator (BOP)', cat: 'Criminal Records', icon: '🔒', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      if (!first || !last) return { found: false };
      const r = await httpReq('GET', `https://www.bop.gov/PublicInfo/execute/inmateloc?todo=query&output=json&nameFirst=${encodeURIComponent(first)}&nameLast=${encodeURIComponent(last)}`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.InmateLocator && d.InmateLocator.length > 0) {
            return {
              found: true, count: d.InmateLocator.length,
              info: `${d.InmateLocator.length} federal inmate record(s)`,
              details: d.InmateLocator.slice(0, 8).map(i => ({
                Name: `${i.nameFirst || ''} ${i.nameLast || ''}`.trim() || 'Unknown',
                Age: i.age || 'N/A', Race: i.race || 'N/A', Sex: i.sex || 'N/A',
                Facility: i.fapiName || 'N/A',
                'Register #': i.registerNumber || 'N/A',
                'Release Date': i.projRelDate || i.actRelDate || 'Unknown',
              })),
              url: 'https://www.bop.gov/inmateloc/',
            };
          }
        } catch {}
      }
      return { found: false, info: 'No federal inmate records', url: 'https://www.bop.gov/inmateloc/' };
    }
  },
  {
    name: 'State Prison Inmate Search', cat: 'Criminal Records', icon: '🏚️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search state DOC databases directly', url: 'https://www.vinelink.com/', directLink: true };
    }
  },
  {
    name: 'Most Wanted (FBI)', cat: 'Criminal Records', icon: '🚨', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://api.fbi.gov/wanted/v1/list?title=${encodeURIComponent(q)}&pageSize=5`, null, {}, 6000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.items && d.items.length > 0) {
            return {
              found: true, count: d.items.length,
              info: `${d.items.length} FBI wanted record(s)`,
              details: d.items.slice(0, 5).map(i => ({
                Title: i.title, Subject: i.subjects?.join(', ') || 'N/A',
                Description: (i.description || '').substring(0, 120),
                Reward: i.reward_text || 'N/A',
              })),
              avatar: d.items[0]?.images?.[0]?.thumb,
              url: `https://www.fbi.gov/wanted#702-702=${encodeURIComponent(q)}`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'Not on FBI wanted list' };
    }
  },
  {
    name: 'DEA Fugitives', cat: 'Criminal Records', icon: '💊', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search DEA fugitive database', url: 'https://www.dea.gov/fugitives', directLink: true };
    }
  },
  {
    name: 'US Marshals Fugitives', cat: 'Criminal Records', icon: '🎯', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search US Marshals most wanted', url: 'https://www.usmarshals.gov/what-we-do/fugitive-operations', directLink: true };
    }
  },
  {
    name: 'ICE Most Wanted', cat: 'Criminal Records', icon: '🧊', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search ICE most wanted fugitives', url: 'https://www.ice.gov/most-wanted', directLink: true };
    }
  },

  // ═══════════════════ COURT RECORDS ═══════════════════

  {
    name: 'Federal Court Records (RECAP)', cat: 'Court Records', icon: '⚖️', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(q)}&type=r`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.count > 0 && d.results?.length > 0) {
            return {
              found: true, count: d.count,
              info: `${d.count} federal court record(s)`,
              details: d.results.slice(0, 5).map(c => ({
                'Case Name': c.caseName || 'N/A', Court: c.court || 'N/A',
                'Date Filed': c.dateFiled || 'N/A', 'Docket #': c.docketNumber || 'N/A',
              })),
              url: `https://www.courtlistener.com/?q=${encodeURIComponent(q)}&type=r`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'No federal court records', url: `https://www.courtlistener.com/?q=${encodeURIComponent(q)}&type=r` };
    }
  },
  {
    name: 'Federal Case Law (Opinions)', cat: 'Court Records', icon: '📋', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(q)}&type=o`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.count > 0) {
            return {
              found: true, count: d.count,
              info: `${d.count} case law opinion(s) mentioning this name`,
              details: d.results?.slice(0, 3).map(c => ({
                'Case': c.caseName || 'N/A', 'Court': c.court || 'N/A', 'Date': c.dateFiled || 'N/A',
              })),
              url: `https://www.courtlistener.com/?q=${encodeURIComponent(q)}&type=o`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Bankruptcy Records (PACER)', cat: 'Court Records', icon: '💸', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search federal bankruptcy records on PACER', url: `https://pcl.uscourts.gov/pcl/pages/search/create/party.jsf`, directLink: true };
    }
  },

  // ═══════════════════ PUBLIC RECORDS ═══════════════════

  {
    name: 'Political Donations (FEC)', cat: 'Public Records', icon: '🗳️', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_name=${encodeURIComponent(q)}&per_page=5&sort=-contribution_receipt_date&api_key=DEMO_KEY`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.pagination?.count > 0 && d.results?.length > 0) {
            return {
              found: true, count: d.pagination.count,
              info: `${d.pagination.count} political donation(s) on record`,
              details: d.results.slice(0, 5).map(don => ({
                Donor: don.contributor_name || 'N/A',
                Amount: '$' + (don.contribution_receipt_amount || 0).toFixed(2),
                Date: don.contribution_receipt_date || 'N/A',
                Committee: don.committee?.name || 'N/A',
                City: don.contributor_city || 'N/A',
                State: don.contributor_state || 'N/A',
                Employer: don.contributor_employer || 'N/A',
                Occupation: don.contributor_occupation || 'N/A',
              })),
              url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(q)}`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Federal Lobbying Records', cat: 'Public Records', icon: '🏛️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search lobbying disclosure records', url: `https://lda.senate.gov/filings/public/filing/search/?registrant_name=&lobbyist_name=${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'Wikipedia', cat: 'Public Records', icon: '📖', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/\s+/g, '_'))}`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.type === 'standard' && d.extract) {
            return { found: true, info: d.extract.substring(0, 250), avatar: d.thumbnail?.source || null, url: d.content_urls?.desktop?.page };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'OFAC Sanctions List (Treasury)', cat: 'Public Records', icon: '🏦', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://search.ofac-api.com/v3?name=${encodeURIComponent(q)}&score=95`, null, {}, 6000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.results && d.results.length > 0) {
            return {
              found: true, count: d.results.length,
              info: `${d.results.length} OFAC sanctions match(es) — this person may be on the US Treasury sanctions list`,
              details: d.results.slice(0, 3).map(s => ({
                Name: s.name || 'N/A', Type: s.type || 'N/A', Program: s.programs?.join(', ') || 'N/A',
              })),
              url: `https://sanctionssearch.ofac.treas.gov/`,
            };
          }
        } catch {}
      }
      return { found: false, info: 'Not on OFAC sanctions list' };
    }
  },
  {
    name: 'SEC Filings (EDGAR)', cat: 'Public Records', icon: '📊', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&dateRange=custom&startdt=2000-01-01&forms=&hits.hits.total=true&hits.hits._source=file_date,display_names,form_type`, null, { 'Accept': 'application/json' }, 6000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.hits?.total?.value > 0) {
            return { found: true, count: d.hits.total.value, info: `${d.hits.total.value} SEC filing(s)`, url: `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(q)}%22` };
          }
        } catch {}
      }
      // Fallback EDGAR full-text
      const r2 = await httpReq('GET', `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(q)}%22&forms=`, null, {}, 6000);
      if (r2.status === 200) try { const d2 = JSON.parse(r2.body); if (d2.hits?.total?.value > 0) return { found: true, count: d2.hits.total.value, info: `${d2.hits.total.value} SEC filing(s)`, url: `https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=${encodeURIComponent(q)}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany` }; } catch {}
      return { found: false, url: `https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=${encodeURIComponent(q)}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany` };
    }
  },

  // ═══════════════════ BUSINESS RECORDS ═══════════════════

  {
    name: 'Business Registrations (OpenCorporates)', cat: 'Business Records', icon: '🏢', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://api.opencorporates.com/v0.4/officers/search?q=${encodeURIComponent(q)}&per_page=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.results?.officers?.length > 0) {
            return {
              found: true, count: d.results.total_count,
              info: `${d.results.total_count} business officer record(s)`,
              details: d.results.officers.slice(0, 5).map(o => ({
                Name: o.officer?.name || 'N/A', Position: o.officer?.position || 'N/A',
                Company: o.officer?.company?.name || 'N/A',
                Jurisdiction: o.officer?.company?.jurisdiction_code?.toUpperCase() || 'N/A',
                Status: o.officer?.company?.company_status || 'N/A',
              })),
              url: `https://opencorporates.com/officers?q=${encodeURIComponent(q)}`,
            };
          }
        } catch {}
      }
      return { found: false, url: `https://opencorporates.com/officers?q=${encodeURIComponent(q)}` };
    }
  },
  {
    name: 'Company Search (OpenCorporates)', cat: 'Business Records', icon: '🏗️', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(q)}&per_page=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.results?.companies?.length > 0) {
            return {
              found: true, count: d.results.total_count,
              info: `${d.results.total_count} company registration(s)`,
              details: d.results.companies.slice(0, 5).map(c => ({
                Company: c.company?.name || 'N/A',
                Number: c.company?.company_number || 'N/A',
                Jurisdiction: c.company?.jurisdiction_code?.toUpperCase() || 'N/A',
                Status: c.company?.current_status || 'N/A',
                Incorporated: c.company?.incorporation_date || 'N/A',
                Address: c.company?.registered_address_in_full || 'N/A',
              })),
              url: `https://opencorporates.com/companies?q=${encodeURIComponent(q)}`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'USPTO Patents & Trademarks', cat: 'Business Records', icon: '📜', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://developer.uspto.gov/ibd-api/v1/patent/application?searchText=${encodeURIComponent(q)}&rows=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.response?.numFound > 0) {
            return {
              found: true, count: d.response.numFound,
              info: `${d.response.numFound} patent record(s)`,
              details: d.response.docs?.slice(0, 3).map(p => ({ Title: p.inventionTitle || 'N/A', Published: p.datePublished || 'N/A' })),
              url: 'https://ppubs.uspto.gov/pubwebapp/',
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'IRS Tax Exempt Orgs', cat: 'Business Records', icon: '📑', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search IRS exempt organization database', url: `https://apps.irs.gov/app/eos/allSearch?name1=${encodeURIComponent(q)}&resultsPerPage=25`, directLink: true };
    }
  },

  // ═══════════════════ PROFESSIONAL ═══════════════════

  {
    name: 'LinkedIn Profiles', cat: 'Professional', icon: '💼', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search LinkedIn directly', url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'Professional Licenses', cat: 'Professional', icon: '📋', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Check state licensing boards for professional licenses (medical, legal, real estate, etc.)', url: `https://www.google.com/search?q=${encodeURIComponent(q)}+professional+license+lookup`, directLink: true };
    }
  },
  {
    name: 'Medical License (NPI Registry)', cat: 'Professional', icon: '🏥', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      if (!first || !last) return { found: false };
      const r = await httpReq('GET', `https://npiregistry.cms.hhs.gov/api/?version=2.1&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&limit=5`, null, {}, 8000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.result_count > 0 && d.results?.length > 0) {
            return {
              found: true, count: d.result_count,
              info: `${d.result_count} medical provider record(s) in NPI registry`,
              details: d.results.slice(0, 5).map(n => ({
                Name: `${n.basic?.first_name || ''} ${n.basic?.last_name || ''}`.trim(),
                NPI: n.number || 'N/A',
                Credential: n.basic?.credential || 'N/A',
                Specialty: n.taxonomies?.[0]?.desc || 'N/A',
                State: n.addresses?.[0]?.state || 'N/A',
                City: n.addresses?.[0]?.city || 'N/A',
                Status: n.basic?.status === 'A' ? 'Active' : 'Inactive',
              })),
              url: `https://npiregistry.cms.hhs.gov/search?name=${encodeURIComponent(q)}`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Attorney Search', cat: 'Professional', icon: '⚖️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search state bar associations for attorney records', url: `https://www.google.com/search?q=${encodeURIComponent(q)}+attorney+bar+association+lookup`, directLink: true };
    }
  },

  // ═══════════════════ DIGITAL FOOTPRINT ═══════════════════

  {
    name: 'GitHub Profiles', cat: 'Digital Footprint', icon: '💻', type: 'name',
    check: async (q) => {
      const r = await httpReq('GET', `https://api.github.com/search/users?q=${encodeURIComponent(q)}+in:fullname&per_page=5`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          if (d.total_count > 0 && d.items?.length > 0) {
            return {
              found: true, count: d.total_count,
              info: `${d.total_count} GitHub profile(s)`,
              details: d.items.slice(0, 5).map(u => ({ Username: u.login, URL: u.html_url })),
              avatar: d.items[0]?.avatar_url,
              url: `https://github.com/search?q=${encodeURIComponent(q)}&type=users`,
            };
          }
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Gravatar Identity', cat: 'Digital Footprint', icon: '👤', type: 'name',
    check: async (q) => {
      const slug = q.toLowerCase().replace(/\s+/g, '');
      const r = await httpReq('GET', `https://en.gravatar.com/${slug}.json`, null, {}, 5000);
      if (r.status === 200) {
        try {
          const d = JSON.parse(r.body);
          const e = d.entry?.[0];
          if (e) return { found: true, info: e.displayName, avatar: e.thumbnailUrl, url: e.profileUrl,
            details: [{ Name: e.displayName, Location: e.currentLocation || 'N/A', About: (e.aboutMe || '').substring(0, 150),
              'Linked Accounts': (e.accounts || []).map(a => a.shortname).join(', ') || 'None' }] };
        } catch {}
      }
      return { found: false };
    }
  },
  {
    name: 'Internet Archive (Wayback Machine)', cat: 'Digital Footprint', icon: '🕰️', type: 'name',
    check: async (q) => {
      const slug = q.toLowerCase().replace(/\s+/g, '');
      for (const ext of ['.com', '.org', '.net', '.io']) {
        const r = await httpReq('GET', `https://archive.org/wayback/available?url=${slug}${ext}`, null, {}, 4000);
        if (r.status === 200) {
          try {
            const d = JSON.parse(r.body);
            if (d.archived_snapshots?.closest?.url) {
              return { found: true, info: `Web archive for ${slug}${ext} (${d.archived_snapshots.closest.timestamp?.substring(0, 4) || '?'})`, url: d.archived_snapshots.closest.url };
            }
          } catch {}
        }
      }
      return { found: false };
    }
  },
  {
    name: 'Google Scholar Publications', cat: 'Digital Footprint', icon: '🎓', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search academic publications', url: `https://scholar.google.com/scholar?q=author:${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'ResearchGate', cat: 'Digital Footprint', icon: '🔬', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search ResearchGate profiles', url: `https://www.researchgate.net/search?q=${encodeURIComponent(q)}`, directLink: true };
    }
  },

  // ═══════════════════ PROPERTY & ASSETS ═══════════════════

  {
    name: 'Property Records', cat: 'Property & Assets', icon: '🏠', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search county assessor / property records', url: `https://www.google.com/search?q=${encodeURIComponent(q)}+property+records+county+assessor`, directLink: true };
    }
  },
  {
    name: 'FAA Aircraft Registry', cat: 'Property & Assets', icon: '✈️', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      if (!last) return { found: false };
      return { found: false, info: 'Search FAA registered aircraft owners', url: `https://registry.faa.gov/aircraftinquiry/Search/NameResult?LastName=${encodeURIComponent(last)}&FirstName=${encodeURIComponent(first)}`, directLink: true };
    }
  },
  {
    name: 'Boat Registration (USCG)', cat: 'Property & Assets', icon: '🚢', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search Coast Guard vessel documentation', url: `https://www.st.nmfs.noaa.gov/pls/webpls/ves_search.results?p_search_type=1&p_name=${encodeURIComponent(q)}`, directLink: true };
    }
  },

  // ═══════════════════ NEWS & MEDIA ═══════════════════

  {
    name: 'News Mentions (Google News)', cat: 'News & Media', icon: '📰', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search news articles', url: `https://news.google.com/search?q=${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'Obituary Search', cat: 'News & Media', icon: '🕊️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search obituary records', url: `https://www.legacy.com/obituaries/search?firstName=${encodeURIComponent(q.split(' ')[0])}&lastName=${encodeURIComponent(q.split(' ').pop())}`, directLink: true };
    }
  },

  // ═══════════════════ VOTER & GOVERNMENT ═══════════════════

  {
    name: 'Voter Registration', cat: 'Government', icon: '🗳️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Check voter registration status by state', url: 'https://www.vote.org/am-i-registered-to-vote/', directLink: true };
    }
  },
  {
    name: 'Federal Employee Directory', cat: 'Government', icon: '🏛️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search federal employee directory', url: `https://www.usajobs.gov/Search/Results?k=${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'Military Records (DPAA)', cat: 'Government', icon: '🎖️', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Search military personnel records (limited public access)', url: `https://dpaa-mil.sites.crmforce.mil/dpaaFamWebCaseSearch?last_name=${encodeURIComponent(q.split(' ').pop())}`, directLink: true };
    }
  },

  // ═══════════════════ SOCIAL DEEP SEARCH ═══════════════════

  {
    name: 'Google Deep Search', cat: 'Deep Search', icon: '🔍', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Deep Google search for this person', url: `https://www.google.com/search?q=%22${encodeURIComponent(q)}%22`, directLink: true };
    }
  },
  {
    name: 'People Finder Aggregator', cat: 'Deep Search', icon: '🔎', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      return { found: false, info: 'Search across multiple people-finder databases', url: `https://www.fastpeoplesearch.com/name/${encodeURIComponent(first)}-${encodeURIComponent(last)}`, directLink: true };
    }
  },
  {
    name: 'That\'s Them (Free)', cat: 'Deep Search', icon: '📇', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      return { found: false, info: 'Free people search with addresses and phones', url: `https://thatsthem.com/name/${encodeURIComponent(first)}-${encodeURIComponent(last)}`, directLink: true };
    }
  },
  {
    name: 'TruePeopleSearch (Free)', cat: 'Deep Search', icon: '🧑', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Free people search — addresses, phones, relatives', url: `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(q)}`, directLink: true };
    }
  },
  {
    name: 'FastPeopleSearch (Free)', cat: 'Deep Search', icon: '⚡', type: 'name',
    check: async (q) => {
      const [first, ...rest] = q.trim().split(/\s+/);
      const last = rest.pop() || '';
      return { found: false, info: 'Free — addresses, phone numbers, emails, relatives', url: `https://www.fastpeoplesearch.com/name/${encodeURIComponent(first)}-${encodeURIComponent(last)}`, directLink: true };
    }
  },
  {
    name: 'Whitepages', cat: 'Deep Search', icon: '📞', type: 'name',
    check: async (q) => {
      return { found: false, info: 'Phone, address, and background lookup', url: `https://www.whitepages.com/name/${encodeURIComponent(q.replace(/\s+/g, '-'))}`, directLink: true };
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
        id: idx, module: checker.name, cat: checker.cat, icon: checker.icon,
        found: result.found, count: result.count || 0, info: result.info || null,
        details: result.details || null, avatar: result.avatar || null,
        url: result.url || null, directLink: result.directLink || false,
      };
      if (onResult) onResult(data);
      return data;
    } catch {
      const data = { id: idx, module: checker.name, cat: checker.cat, icon: checker.icon, found: false, info: 'Check failed' };
      if (onResult) onResult(data);
      return data;
    }
  });

  await Promise.allSettled(promises);
  return { time: ((Date.now() - startTime) / 1000).toFixed(1) };
}

module.exports = { BG_CHECKS, runBackgroundCheck };
