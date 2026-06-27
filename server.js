const express = require('express');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const dns = require('dns');
const path = require('path');

const { EMAIL_CHECKERS, checkEmail, detectEmailProvider } = require('./email-checker');
const { BG_CHECKS, runBackgroundCheck } = require('./background-check');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── HTTP GET ───
function httpGet(url, timeout = 7000, followRedirects = true) {
  return new Promise((resolve, reject) => {
    const doReq = (reqUrl, depth = 0) => {
      if (depth > 3) return resolve({ status: 0, body: '', headers: {} });
      const mod = reqUrl.startsWith('https') ? https : http;
      const req = mod.get(reqUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout,
      }, (res) => {
        if (followRedirects && [301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith('/')) { const u = new URL(reqUrl); loc = u.origin + loc; }
          return doReq(loc, depth + 1);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', () => resolve({ status: 0, body: '', headers: {} }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', headers: {} }); });
    };
    doReq(url);
  });
}

// ─── PLATFORM DATABASE ───
const PLATFORMS = [
  // ── Social Media ──
  { name: 'Facebook', url: 'https://www.facebook.com/{u}', cat: 'Social Media', icon: 'fb', anti: ['page not found', 'content isn\'t available'] },
  { name: 'Instagram', url: 'https://www.instagram.com/{u}/', cat: 'Social Media', icon: 'ig', ind: ['instagram'], anti: ['sorry, this page', 'page not found'] },
  { name: 'Twitter / X', url: 'https://x.com/{u}', cat: 'Social Media', icon: 'x', anti: ['this account doesn', 'doesn\'t exist', 'hmm...this page'] },
  { name: 'TikTok', url: 'https://www.tiktok.com/@{u}', cat: 'Social Media', icon: 'tt', ind: ['tiktok'], anti: ["couldn't find this account", 'page not available'] },
  { name: 'Snapchat', url: 'https://www.snapchat.com/add/{u}', cat: 'Social Media', icon: 'sc', ind: ['snapchat', 'snapcode'] },
  { name: 'Pinterest', url: 'https://www.pinterest.com/{u}/', cat: 'Social Media', icon: 'pi', anti: ['did you mean', 'page not found'] },
  { name: 'Tumblr', url: 'https://{u}.tumblr.com', cat: 'Social Media', icon: 'tu', anti: ['not found', 'no posts', 'there\'s nothing here'] },
  { name: 'Reddit', url: 'https://www.reddit.com/user/{u}/about.json', cat: 'Social Media', icon: 're', json: true, check: b => { try { const d = JSON.parse(b); return d.data && !d.error; } catch { return false; } } },
  { name: 'Threads', url: 'https://www.threads.net/@{u}', cat: 'Social Media', icon: 'th', anti: ['sorry', 'not found'] },
  { name: 'Mastodon', url: 'https://mastodon.social/@{u}', cat: 'Social Media', icon: 'ma', anti: ['page not found'] },
  { name: 'Bluesky', url: 'https://bsky.app/profile/{u}.bsky.social', cat: 'Social Media', icon: 'bs', anti: ['not found', 'unable'] },
  { name: 'VK', url: 'https://vk.com/{u}', cat: 'Social Media', icon: 'vk', anti: ['not found', 'page not found', 'deleted'] },
  { name: 'Minds', url: 'https://www.minds.com/{u}', cat: 'Social Media', icon: 'mi', anti: ['not found'] },
  { name: 'Gab', url: 'https://gab.com/{u}', cat: 'Social Media', icon: 'ga', anti: ['not found'] },
  { name: 'Truth Social', url: 'https://truthsocial.com/@{u}', cat: 'Social Media', icon: 'ts', anti: ['not found'] },
  { name: 'Clubhouse', url: 'https://www.clubhouse.com/@{u}', cat: 'Social Media', icon: 'ch', anti: ['not found'] },
  { name: 'Quora', url: 'https://www.quora.com/profile/{u}', cat: 'Social Media', icon: 'qu', anti: ['page not found'] },
  { name: 'Disqus', url: 'https://disqus.com/by/{u}/', cat: 'Social Media', icon: 'dq', anti: ['not found'] },

  // ── Dating Sites ──
  { name: 'Tinder', url: 'https://tinder.com/@{u}', cat: 'Dating', icon: 'tn', anti: ['not found', 'looking for someone', 'page not found'] },
  { name: 'Bumble', url: 'https://bumble.com/profile/{u}', cat: 'Dating', icon: 'bm', anti: ['not found', 'page not found'] },
  { name: 'OkCupid', url: 'https://www.okcupid.com/profile/{u}', cat: 'Dating', icon: 'ok', anti: ['not found', 'page not found', 'we couldn'] },
  { name: 'Plenty of Fish', url: 'https://www.pof.com/viewprofile.aspx?profile_id={u}', cat: 'Dating', icon: 'pf', anti: ['not found', 'error'] },
  { name: 'Match.com', url: 'https://www.match.com/profile/{u}', cat: 'Dating', icon: 'mc', anti: ['not found', 'page not found'] },
  { name: 'Hinge', url: 'https://hinge.co/{u}', cat: 'Dating', icon: 'hi', anti: ['not found'] },
  { name: 'Grindr', url: 'https://grindr.com/{u}', cat: 'Dating', icon: 'gr', anti: ['not found'] },
  { name: 'HER', url: 'https://weareher.com/{u}', cat: 'Dating', icon: 'hr', anti: ['not found'] },
  { name: 'Zoosk', url: 'https://www.zoosk.com/personals/{u}', cat: 'Dating', icon: 'zk', anti: ['not found'] },
  { name: 'Coffee Meets Bagel', url: 'https://coffeemeetsbagel.com/{u}', cat: 'Dating', icon: 'cm', anti: ['not found'] },
  { name: 'Badoo', url: 'https://badoo.com/profile/{u}', cat: 'Dating', icon: 'bd', anti: ['not found', 'page not found'] },
  { name: 'Happn', url: 'https://www.happn.com/{u}', cat: 'Dating', icon: 'hp', anti: ['not found'] },
  { name: 'eHarmony', url: 'https://www.eharmony.com/{u}', cat: 'Dating', icon: 'eh', anti: ['not found'] },
  { name: 'Christian Mingle', url: 'https://www.christianmingle.com/{u}', cat: 'Dating', icon: 'cm', anti: ['not found'] },
  { name: 'JDate', url: 'https://www.jdate.com/{u}', cat: 'Dating', icon: 'jd', anti: ['not found'] },
  { name: 'EliteSingles', url: 'https://www.elitesingles.com/{u}', cat: 'Dating', icon: 'es', anti: ['not found'] },
  { name: 'Silver Singles', url: 'https://www.silversingles.com/{u}', cat: 'Dating', icon: 'ss', anti: ['not found'] },
  { name: 'AdultFriendFinder', url: 'https://adultfriendfinder.com/p/{u}', cat: 'Dating', icon: 'af', anti: ['not found'] },
  { name: 'Ashley Madison', url: 'https://www.ashleymadison.com/{u}', cat: 'Dating', icon: 'am', anti: ['not found'] },
  { name: 'Seeking', url: 'https://www.seeking.com/{u}', cat: 'Dating', icon: 'sk', anti: ['not found'] },

  // ── Adult ──
  { name: 'Pornhub', url: 'https://www.pornhub.com/users/{u}', cat: 'Adult', icon: 'ph', anti: ['page not found', '404', 'the page you'] },
  { name: 'XVideos', url: 'https://www.xvideos.com/profiles/{u}', cat: 'Adult', icon: 'xv', anti: ['not found', '404', 'no user', 'page not found'] },
  { name: 'XNXX', url: 'https://www.xnxx.com/pornstar/{u}', cat: 'Adult', icon: 'xn', anti: ['not found', '404'] },
  { name: 'xHamster', url: 'https://xhamster.com/users/{u}', cat: 'Adult', icon: 'xh', anti: ['not found', '404', 'page not found'] },
  { name: 'Chaturbate', url: 'https://chaturbate.com/{u}/', cat: 'Adult', icon: 'cb', anti: ['not found', 'room is currently offline', 'bio not found'] },
  { name: 'OnlyFans', url: 'https://onlyfans.com/{u}', cat: 'Adult', icon: 'of', anti: ['not found', 'sorry, this page'] },
  { name: 'Fansly', url: 'https://fansly.com/{u}', cat: 'Adult', icon: 'fn', anti: ['not found'] },
  { name: 'MyFreeCams', url: 'https://profiles.myfreecams.com/{u}', cat: 'Adult', icon: 'mf', anti: ['not found', '404'] },
  { name: 'Stripchat', url: 'https://stripchat.com/{u}', cat: 'Adult', icon: 'sc', anti: ['not found', '404'] },
  { name: 'BongaCams', url: 'https://bongacams.com/{u}', cat: 'Adult', icon: 'bg', anti: ['not found', '404'] },
  { name: 'CamSoda', url: 'https://www.camsoda.com/{u}', cat: 'Adult', icon: 'cs', anti: ['not found'] },
  { name: 'LiveJasmin', url: 'https://www.livejasmin.com/{u}', cat: 'Adult', icon: 'lj', anti: ['not found'] },
  { name: 'Cam4', url: 'https://www.cam4.com/{u}', cat: 'Adult', icon: 'c4', anti: ['not found'] },
  { name: 'ManyVids', url: 'https://www.manyvids.com/Profile/{u}/', cat: 'Adult', icon: 'mv', anti: ['not found', '404'] },
  { name: 'Clips4Sale', url: 'https://www.clips4sale.com/studio/{u}', cat: 'Adult', icon: 'c4', anti: ['not found', '404'] },
  { name: 'iWantClips', url: 'https://iwantclips.com/store/{u}', cat: 'Adult', icon: 'iw', anti: ['not found'] },
  { name: 'RedTube', url: 'https://www.redtube.com/users/{u}', cat: 'Adult', icon: 'rt', anti: ['not found', '404'] },
  { name: 'YouPorn', url: 'https://www.youporn.com/uprofile/{u}', cat: 'Adult', icon: 'yp', anti: ['not found', '404'] },
  { name: 'SpankBang', url: 'https://spankbang.com/profile/{u}', cat: 'Adult', icon: 'sb', anti: ['not found', '404'] },
  { name: 'EPorner', url: 'https://www.eporner.com/profile/{u}/', cat: 'Adult', icon: 'ep', anti: ['not found', '404'] },
  { name: 'Tube8', url: 'https://www.tube8.com/users/{u}', cat: 'Adult', icon: 't8', anti: ['not found', '404'] },
  { name: 'Xtube', url: 'https://www.xtube.com/profile/{u}', cat: 'Adult', icon: 'xt', anti: ['not found', '404'] },
  { name: 'ThisVid', url: 'https://thisvid.com/members/{u}/', cat: 'Adult', icon: 'tv', anti: ['not found', '404'] },
  { name: 'Literotica', url: 'https://www.literotica.com/stories/memberpage.php?uid={u}', cat: 'Adult', icon: 'li', anti: ['not found', '404'] },
  { name: 'FetLife', url: 'https://fetlife.com/{u}', cat: 'Adult', icon: 'fl', anti: ['not found', 'error'] },
  { name: 'Swinger Lifestyle', url: 'https://www.swingerlifestyle.com/{u}', cat: 'Adult', icon: 'sl', anti: ['not found'] },
  { name: 'Xtapes', url: 'https://xtapes.to/author/{u}/', cat: 'Adult', icon: 'xt', anti: ['not found', '404'] },
  { name: 'F95Zone', url: 'https://f95zone.to/members/{u}/', cat: 'Adult', icon: 'f9', anti: ['not found', 'oops'] },
  { name: 'HentaiFoundry', url: 'https://www.hentai-foundry.com/user/{u}/profile', cat: 'Adult', icon: 'hf', anti: ['not found', '404'] },
  { name: 'Rule34', url: 'https://rule34.xxx/index.php?page=account&s=profile&uname={u}', cat: 'Adult', icon: 'r3', anti: ['not found', 'no user'] },
  { name: 'e621', url: 'https://e621.net/users?search[name_matches]={u}', cat: 'Adult', icon: 'e6', ind: ['users'], anti: ['no results'] },
  { name: 'Nifty Archive', url: 'https://www.nifty.org/nifty/authors/{u}', cat: 'Adult', icon: 'ni', anti: ['not found'] },
  { name: 'ImageFap', url: 'https://www.imagefap.com/profile/{u}', cat: 'Adult', icon: 'if', anti: ['not found', '404'] },
  { name: 'Motherless', url: 'https://motherless.com/m/{u}', cat: 'Adult', icon: 'ml', anti: ['not found', '404'] },
  { name: 'Coomer.su', url: 'https://coomer.su/onlyfans/user/{u}', cat: 'Adult', icon: 'co', anti: ['not found', '404'] },
  { name: 'Fapello', url: 'https://fapello.com/{u}/', cat: 'Adult', icon: 'fa', anti: ['not found', '404'] },

  // ── Professional ──
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/{u}', cat: 'Professional', icon: 'li', ind: ['linkedin'], anti: ['page not found'] },
  { name: 'SlideShare', url: 'https://www.slideshare.net/{u}', cat: 'Professional', icon: 'sl', anti: ['404'] },
  { name: 'About.me', url: 'https://about.me/{u}', cat: 'Professional', icon: 'ab', anti: ['404', 'page not found'] },
  { name: 'Linktree', url: 'https://linktr.ee/{u}', cat: 'Professional', icon: 'lt', anti: ['not found', 'looking for'] },
  { name: 'Gravatar', url: 'https://en.gravatar.com/{u}', cat: 'Professional', icon: 'gv', anti: ['404', 'not found'] },
  { name: 'Fiverr', url: 'https://www.fiverr.com/{u}', cat: 'Professional', icon: 'fv', anti: ['404', 'page not found'] },

  // ── Development ──
  { name: 'GitHub', url: 'https://github.com/{u}', cat: 'Development', icon: 'gh', anti: ['not found', 'page not found'] },
  { name: 'GitLab', url: 'https://gitlab.com/{u}', cat: 'Development', icon: 'gl', anti: ['page not found', 'explore gitlab'] },
  { name: 'Bitbucket', url: 'https://bitbucket.org/{u}/', cat: 'Development', icon: 'bb', anti: ['not found', 'error 404'] },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com/users?q={u}&s=reputation', cat: 'Development', icon: 'so', ind: ['users'] },
  { name: 'Dev.to', url: 'https://dev.to/{u}', cat: 'Development', icon: 'dv', anti: ['not found'] },
  { name: 'CodePen', url: 'https://codepen.io/{u}', cat: 'Development', icon: 'cp', anti: ['404'] },
  { name: 'Replit', url: 'https://replit.com/@{u}', cat: 'Development', icon: 'rp', anti: ['not found'] },
  { name: 'npm', url: 'https://www.npmjs.com/~{u}', cat: 'Development', icon: 'np', anti: ['404'] },
  { name: 'PyPI', url: 'https://pypi.org/user/{u}/', cat: 'Development', icon: 'py', anti: ['not found'] },
  { name: 'Docker Hub', url: 'https://hub.docker.com/u/{u}', cat: 'Development', icon: 'dk', anti: ['404', 'object not found'] },
  { name: 'HackerRank', url: 'https://www.hackerrank.com/{u}', cat: 'Development', icon: 'hk', anti: ['404', 'page not found'] },
  { name: 'LeetCode', url: 'https://leetcode.com/{u}/', cat: 'Development', icon: 'lc', anti: ['404'] },
  { name: 'Codeforces', url: 'https://codeforces.com/profile/{u}', cat: 'Development', icon: 'cf', anti: ['not found'] },
  { name: 'Kaggle', url: 'https://www.kaggle.com/{u}', cat: 'Development', icon: 'kg', anti: ['404'] },
  { name: 'Gist', url: 'https://gist.github.com/{u}', cat: 'Development', icon: 'gi', anti: ['not found'] },
  { name: 'HackerNews', url: 'https://hacker-news.firebaseio.com/v0/user/{u}.json', cat: 'Development', icon: 'hn', json: true, check: b => b !== 'null' && b.length > 5 },

  // ── Video & Streaming ──
  { name: 'YouTube', url: 'https://www.youtube.com/@{u}', cat: 'Video & Streaming', icon: 'yt', anti: ['404', 'page not found', 'page isn\'t available'] },
  { name: 'Twitch', url: 'https://www.twitch.tv/{u}', cat: 'Video & Streaming', icon: 'tw', anti: ['page not found', 'content is unavailable'] },
  { name: 'Kick', url: 'https://kick.com/{u}', cat: 'Video & Streaming', icon: 'ki', anti: ['not found'] },
  { name: 'Vimeo', url: 'https://vimeo.com/{u}', cat: 'Video & Streaming', icon: 'vi', anti: ['404', 'page not found'] },
  { name: 'Rumble', url: 'https://rumble.com/user/{u}', cat: 'Video & Streaming', icon: 'ru', anti: ['not found'] },
  { name: 'Odysee', url: 'https://odysee.com/@{u}', cat: 'Video & Streaming', icon: 'od', anti: ['not found'] },
  { name: 'BitChute', url: 'https://www.bitchute.com/channel/{u}/', cat: 'Video & Streaming', icon: 'bc', anti: ['not found'] },
  { name: 'DailyMotion', url: 'https://www.dailymotion.com/{u}', cat: 'Video & Streaming', icon: 'dm', anti: ['not found', 'page not found'] },

  // ── Music ──
  { name: 'Spotify', url: 'https://open.spotify.com/user/{u}', cat: 'Music', icon: 'sp' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/{u}', cat: 'Music', icon: 'sn', anti: ['we can\'t find that', '404'] },
  { name: 'Bandcamp', url: 'https://{u}.bandcamp.com', cat: 'Music', icon: 'bn', anti: ['not found', 'sorry', 'isn\'t a thing'] },
  { name: 'Last.fm', url: 'https://www.last.fm/user/{u}', cat: 'Music', icon: 'lf', anti: ['not found'] },
  { name: 'Apple Music', url: 'https://music.apple.com/profile/{u}', cat: 'Music', icon: 'am', anti: ['not found'] },

  // ── Gaming ──
  { name: 'Steam', url: 'https://steamcommunity.com/id/{u}', cat: 'Gaming', icon: 'st', anti: ['the specified profile could not'] },
  { name: 'Xbox Gamertag', url: 'https://xboxgamertag.com/search/{u}', cat: 'Gaming', icon: 'xb' },
  { name: 'Chess.com', url: 'https://www.chess.com/member/{u}', cat: 'Gaming', icon: 'cc', anti: ['not found', 'missing page'] },
  { name: 'Roblox', url: 'https://www.roblox.com/user.aspx?username={u}', cat: 'Gaming', icon: 'ro' },
  { name: 'Epic Games', url: 'https://store.epicgames.com/u/{u}', cat: 'Gaming', icon: 'ep', anti: ['not found'] },
  { name: 'MyAnimeList', url: 'https://myanimelist.net/profile/{u}', cat: 'Gaming', icon: 'ml', anti: ['404'] },
  { name: 'Itch.io', url: 'https://{u}.itch.io', cat: 'Gaming', icon: 'it', anti: ['not found'] },

  // ── Photography & Art ──
  { name: 'Flickr', url: 'https://www.flickr.com/people/{u}/', cat: 'Photography & Art', icon: 'fk', anti: ['not found'] },
  { name: 'DeviantArt', url: 'https://www.deviantart.com/{u}', cat: 'Photography & Art', icon: 'da', anti: ['not found'] },
  { name: 'ArtStation', url: 'https://www.artstation.com/{u}', cat: 'Photography & Art', icon: 'as', anti: ['not found'] },
  { name: 'Dribbble', url: 'https://dribbble.com/{u}', cat: 'Photography & Art', icon: 'dr', anti: ['404', 'page not found'] },
  { name: 'Behance', url: 'https://www.behance.net/{u}', cat: 'Photography & Art', icon: 'be', anti: ['404', 'oops'] },
  { name: 'Unsplash', url: 'https://unsplash.com/@{u}', cat: 'Photography & Art', icon: 'us', anti: ['page not found'] },
  { name: '500px', url: 'https://500px.com/p/{u}', cat: 'Photography & Art', icon: '5p', anti: ['not found'] },
  { name: 'Imgur', url: 'https://imgur.com/user/{u}', cat: 'Photography & Art', icon: 'im', anti: ['not found'] },

  // ── Writing & Blogs ──
  { name: 'Medium', url: 'https://medium.com/@{u}', cat: 'Writing', icon: 'md', anti: ['404', 'page not found', 'out of nothing'] },
  { name: 'Substack', url: 'https://{u}.substack.com', cat: 'Writing', icon: 'sb', anti: ['not found', 'page not found'] },
  { name: 'Wordpress', url: 'https://{u}.wordpress.com', cat: 'Writing', icon: 'wp', anti: ['doesn\'t exist'] },
  { name: 'Blogger', url: 'https://{u}.blogspot.com', cat: 'Writing', icon: 'bl', anti: ['not found', 'blog not found'] },
  { name: 'Wattpad', url: 'https://www.wattpad.com/user/{u}', cat: 'Writing', icon: 'wa', anti: ['404', 'not found'] },
  { name: 'Goodreads', url: 'https://www.goodreads.com/{u}', cat: 'Writing', icon: 'go', anti: ['page not found'] },

  // ── Commerce ──
  { name: 'eBay', url: 'https://www.ebay.com/usr/{u}', cat: 'Commerce', icon: 'eb', anti: ['not found', 'the user id'] },
  { name: 'Etsy', url: 'https://www.etsy.com/shop/{u}', cat: 'Commerce', icon: 'et', anti: ['page not found', 'sorry'] },
  { name: 'Poshmark', url: 'https://poshmark.com/closet/{u}', cat: 'Commerce', icon: 'pm', anti: ['not found'] },
  { name: 'Depop', url: 'https://www.depop.com/{u}', cat: 'Commerce', icon: 'dp', anti: ['not found'] },

  // ── Messaging ──
  { name: 'Telegram', url: 'https://t.me/{u}', cat: 'Messaging', icon: 'tg', ind: ['tgme', 'telegram'], anti: ['not found'] },
  { name: 'Keybase', url: 'https://keybase.io/{u}', cat: 'Messaging', icon: 'kb', anti: ['not found'] },

  // ── Finance ──
  { name: 'Cash App', url: 'https://cash.app/${u}', cat: 'Finance', icon: 'ca' },
  { name: 'Venmo', url: 'https://venmo.com/{u}', cat: 'Finance', icon: 'vn', anti: ['not found', 'page not found'] },
  { name: 'Patreon', url: 'https://www.patreon.com/{u}', cat: 'Finance', icon: 'pa', anti: ['404', 'page not found'] },

  // ── Education ──
  { name: 'Duolingo', url: 'https://www.duolingo.com/profile/{u}', cat: 'Education', icon: 'du', anti: ['404'] },
  { name: 'Codecademy', url: 'https://www.codecademy.com/profiles/{u}', cat: 'Education', icon: 'cd', anti: ['not found'] },

  // ── Entertainment ──
  { name: 'Letterboxd', url: 'https://letterboxd.com/{u}/', cat: 'Entertainment', icon: 'lb', anti: ['error'] },
  { name: 'Giphy', url: 'https://giphy.com/{u}', cat: 'Entertainment', icon: 'gp', anti: ['404'] },
  { name: 'Newgrounds', url: 'https://{u}.newgrounds.com', cat: 'Entertainment', icon: 'ng', anti: ['not found'] },

  // ── Productivity ──
  { name: 'Trello', url: 'https://trello.com/{u}', cat: 'Productivity', icon: 'tr', anti: ['not found'] },
  { name: 'Product Hunt', url: 'https://www.producthunt.com/@{u}', cat: 'Productivity', icon: 'ph', anti: ['404'] },

  // ── Other ──
  { name: 'Instructables', url: 'https://www.instructables.com/member/{u}/', cat: 'Other', icon: 'in', anti: ['404'] },
  { name: 'Thingiverse', url: 'https://www.thingiverse.com/{u}', cat: 'Other', icon: 'tv', anti: ['not found'] },
  { name: 'Mix', url: 'https://mix.com/{u}', cat: 'Other', icon: 'mx', anti: ['404'] },
];

// ─── SSE STREAMING SCAN ───
app.get('/api/scan', async (req, res) => {
  const { type, query } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const clean = query.replace(/^@/, '').trim();
  const startTime = Date.now();

  // ── EMAIL SEARCH: Use registration endpoint checks (like Holehe) ──
  if (type === 'email' && clean.includes('@')) {
    // Send email-specific platform list
    const emailPlatforms = EMAIL_CHECKERS.map((c, i) => ({ id: i, name: c.name, cat: c.cat, icon: c.icon }));
    send('platforms', emailPlatforms);

    // MX / provider detection
    const emailInfo = await detectEmailProvider(clean);
    send('email_info', emailInfo);

    // Run ALL email registration checks in parallel — FAST
    let emailFound = 0;
    const emailResults = await checkEmail(clean, (result) => {
      // Stream each result instantly as it completes
      send('checking', { id: result.id });
      send('result', {
        id: result.id,
        found: result.found,
        verified: result.verified || false,
        url: result.url,
        avatar: result.avatar,
        info: result.info,
        platform: result.platform,
        cat: result.cat,
      });
      if (result.found) emailFound++;
    });

    send('done', { found: emailFound, total: EMAIL_CHECKERS.length, time: emailResults.time });
    res.end();
    return;
  }

  // ── NAME SEARCH: Run background check modules + platform scan ──
  if (type === 'name') {
    // Run background check databases in parallel
    const bgChecks = BG_CHECKS.filter(c => c.type === 'name');
    send('bg_start', { count: bgChecks.length });
    await runBackgroundCheck(clean, 'name', (result) => {
      send('bg_result', result);
    });
  }

  // ── NON-EMAIL SEARCHES: Use platform URL checks ──
  send('platforms', PLATFORMS.map((p, i) => ({ id: i, name: p.name, cat: p.cat, icon: p.icon })));

  // Phone info
  if (type === 'phone') {
    const digits = clean.replace(/\D/g, '');
    const areaCodes = {
      '201':'NJ','202':'Washington DC','203':'CT','205':'AL','206':'Seattle WA','207':'ME','208':'ID',
      '209':'Stockton CA','210':'San Antonio TX','212':'New York NY','213':'Los Angeles CA',
      '214':'Dallas TX','215':'Philadelphia PA','216':'Cleveland OH','217':'Springfield IL',
      '218':'Duluth MN','219':'Gary IN','224':'IL','225':'Baton Rouge LA','228':'MS',
      '229':'Albany GA','231':'MI','234':'OH','239':'Fort Myers FL','240':'MD',
      '248':'Troy MI','251':'Mobile AL','252':'NC','253':'Tacoma WA','254':'Waco TX',
      '256':'Huntsville AL','260':'Fort Wayne IN','262':'WI','267':'Philadelphia PA',
      '269':'Kalamazoo MI','270':'KY','272':'PA','276':'VA','281':'Houston TX',
      '301':'MD','302':'DE','303':'Denver CO','304':'WV','305':'Miami FL',
      '307':'WY','308':'NE','309':'Peoria IL','310':'Los Angeles CA','312':'Chicago IL',
      '313':'Detroit MI','314':'St Louis MO','315':'Syracuse NY','316':'Wichita KS',
      '317':'Indianapolis IN','318':'Shreveport LA','319':'Cedar Rapids IA','320':'MN',
      '321':'Orlando FL','323':'Los Angeles CA','325':'TX','330':'Akron OH',
      '331':'IL','334':'Montgomery AL','336':'Greensboro NC','337':'Lafayette LA',
      '339':'MA','340':'US Virgin Islands','346':'Houston TX','347':'New York NY',
      '351':'MA','352':'Gainesville FL','360':'WA','361':'Corpus Christi TX',
      '385':'UT','386':'FL','401':'RI','402':'Omaha NE','404':'Atlanta GA',
      '405':'Oklahoma City OK','406':'MT','407':'Orlando FL','408':'San Jose CA',
      '409':'Galveston TX','410':'Baltimore MD','412':'Pittsburgh PA','413':'Springfield MA',
      '414':'Milwaukee WI','415':'San Francisco CA','417':'Springfield MO','419':'Toledo OH',
      '424':'Los Angeles CA','425':'Bellevue WA','430':'TX','432':'TX',
      '434':'Lynchburg VA','435':'UT','440':'OH','442':'CA','443':'Baltimore MD',
      '458':'OR','469':'Dallas TX','470':'Atlanta GA','475':'CT','478':'Macon GA',
      '479':'Fort Smith AR','480':'Phoenix AZ','484':'PA','501':'Little Rock AR',
      '502':'Louisville KY','503':'Portland OR','504':'New Orleans LA','505':'Albuquerque NM',
      '507':'MN','508':'Worcester MA','509':'Spokane WA','510':'Oakland CA',
      '512':'Austin TX','513':'Cincinnati OH','515':'Des Moines IA','516':'Long Island NY',
      '517':'Lansing MI','518':'Albany NY','520':'Tucson AZ','530':'CA',
      '531':'NE','534':'WI','539':'OK','540':'Roanoke VA','541':'Eugene OR',
      '551':'NJ','559':'Fresno CA','561':'West Palm Beach FL','562':'Long Beach CA',
      '563':'IA','567':'OH','570':'Scranton PA','571':'VA','573':'MO',
      '574':'South Bend IN','575':'NM','580':'OK','585':'Rochester NY','586':'MI',
      '601':'Jackson MS','602':'Phoenix AZ','603':'NH','605':'SD','606':'KY',
      '607':'Binghamton NY','608':'Madison WI','609':'Trenton NJ','610':'PA',
      '612':'Minneapolis MN','614':'Columbus OH','615':'Nashville TN','616':'Grand Rapids MI',
      '617':'Boston MA','618':'IL','619':'San Diego CA','620':'KS','623':'AZ',
      '626':'Pasadena CA','628':'San Francisco CA','629':'TN','630':'IL',
      '631':'Long Island NY','636':'MO','641':'IA','646':'New York NY',
      '650':'San Mateo CA','651':'St Paul MN','657':'Anaheim CA','660':'MO',
      '661':'Bakersfield CA','662':'MS','667':'Baltimore MD','669':'San Jose CA',
      '678':'Atlanta GA','681':'WV','682':'Fort Worth TX','689':'FL',
      '701':'ND','702':'Las Vegas NV','703':'VA','704':'Charlotte NC',
      '706':'Augusta GA','707':'Santa Rosa CA','708':'IL','712':'IA',
      '713':'Houston TX','714':'Anaheim CA','715':'WI','716':'Buffalo NY',
      '717':'Harrisburg PA','718':'New York NY','719':'Colorado Springs CO',
      '720':'Denver CO','724':'PA','725':'Las Vegas NV','727':'St Petersburg FL',
      '731':'TN','732':'NJ','734':'Ann Arbor MI','737':'Austin TX',
      '740':'OH','743':'NC','747':'Los Angeles CA','754':'Fort Lauderdale FL',
      '757':'Virginia Beach VA','760':'CA','762':'GA','763':'MN',
      '765':'IN','769':'MS','770':'GA','772':'FL','773':'Chicago IL',
      '774':'MA','775':'Reno NV','779':'IL','781':'MA','785':'Topeka KS',
      '786':'Miami FL','801':'Salt Lake City UT','802':'VT','803':'Columbia SC',
      '804':'Richmond VA','805':'CA','806':'Lubbock TX','808':'Hawaii',
      '810':'Flint MI','812':'IN','813':'Tampa FL','814':'Erie PA',
      '815':'IL','816':'Kansas City MO','817':'Fort Worth TX','818':'Los Angeles CA',
      '828':'Asheville NC','830':'TX','831':'CA','832':'Houston TX',
      '843':'SC','845':'NY','847':'IL','848':'NJ','850':'Tallahassee FL',
      '856':'NJ','857':'Boston MA','858':'San Diego CA','859':'Lexington KY',
      '860':'Hartford CT','862':'NJ','863':'FL','864':'Greenville SC',
      '865':'Knoxville TN','870':'AR','872':'Chicago IL','878':'PA',
      '901':'Memphis TN','903':'TX','904':'Jacksonville FL','906':'MI',
      '907':'Alaska','908':'NJ','909':'CA','910':'Fayetteville NC',
      '912':'Savannah GA','913':'Kansas City KS','914':'Westchester NY',
      '915':'El Paso TX','916':'Sacramento CA','917':'New York NY','918':'Tulsa OK',
      '919':'Raleigh NC','920':'WI','925':'East Bay CA','928':'AZ',
      '929':'New York NY','930':'IN','931':'TN','936':'TX','937':'Dayton OH',
      '938':'AL','940':'TX','941':'FL','947':'MI','949':'Irvine CA',
      '951':'CA','952':'MN','954':'Fort Lauderdale FL','956':'Laredo TX',
      '959':'CT','970':'CO','971':'Portland OR','972':'Dallas TX',
      '973':'NJ','978':'MA','979':'TX','980':'Charlotte NC','984':'NC',
      '985':'LA','986':'ID','989':'MI',
    };
    let ac = null, loc = null;
    if (digits.length === 10) { ac = digits.slice(0,3); }
    else if (digits.length === 11 && digits[0] === '1') { ac = digits.slice(1,4); }
    if (ac && areaCodes[ac]) loc = areaCodes[ac];
    send('phone_info', { digits, areaCode: ac, location: loc, country: digits.length >= 10 ? 'US' : 'Unknown' });
  }

  // For email searches, use the local part as the username to scan
  let scanName = clean;
  if (type === 'email' && clean.includes('@')) {
    scanName = clean.split('@')[0];
  }
  // For name searches, also try common username forms
  if (type === 'name') {
    scanName = clean.toLowerCase().replace(/\s+/g, '');
  }

  // Scan platforms in large parallel batches — FAST
  const batchSize = 30;
  let found = 0;
  for (let i = 0; i < PLATFORMS.length; i += batchSize) {
    const batch = PLATFORMS.slice(i, i + batchSize);
    const promises = batch.map(async (p, batchIdx) => {
      const idx = i + batchIdx;
      const url = p.url.replace(/{u}/g, encodeURIComponent(scanName));
      send('checking', { id: idx });
      try {
        const r = await httpGet(url, 4000);
        if (p.check) {
          const hit = r.status === 200 && p.check(r.body);
          send('result', { id: idx, found: hit, url: hit ? url.replace(encodeURIComponent(scanName), scanName) : null });
          if (hit) found++;
          return;
        }
        if (r.status === 200) {
          const body = r.body.toLowerCase();
          for (const anti of (p.anti || [])) {
            if (body.includes(anti.toLowerCase())) {
              send('result', { id: idx, found: false });
              return;
            }
          }
          if (p.ind && p.ind.length) {
            const match = p.ind.some(ind => body.includes(ind.toLowerCase()));
            send('result', { id: idx, found: match, url: match ? url.replace(encodeURIComponent(scanName), scanName) : null });
            if (match) found++;
          } else {
            send('result', { id: idx, found: true, url: url.replace(encodeURIComponent(scanName), scanName) });
            found++;
          }
        } else {
          send('result', { id: idx, found: false });
        }
      } catch {
        send('result', { id: idx, found: false });
      }
    });
    await Promise.all(promises);
  }

  send('done', { found, total: PLATFORMS.length, time: ((Date.now() - startTime) / 1000).toFixed(1) });
  res.end();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   👁  IseeU Server Running            ║`);
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log(`  ║   ${PLATFORMS.length} platforms loaded            ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
