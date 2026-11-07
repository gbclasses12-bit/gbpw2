import express, { Request, Response } from 'express';
import zlib from 'zlib';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TARGET_HOST = 'pwmarco.xyz';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;

// Normalize URL for Vercel Serverless Function rewrites so original routes match Express
app.use((req: Request, _res: Response, next) => {
  const matchedPath = req.headers['x-matched-path'] as string;
  if (matchedPath) {
    req.url = matchedPath;
  } else if (req.originalUrl && req.url !== req.originalUrl) {
    req.url = req.originalUrl;
  }
  next();
});

// User-specified brand requirements:
// 1. Name: GB STUDY
// 2. Telegram URL: https://t.me/GBFreestudy
// 3. Icon: https://ibb.co/0R7qc34v -> Direct image: https://i.ibb.co/Q3g9fGSt/1791541921524.png
const APP_NAME = 'GB STUDY';
const TG_URL = 'https://t.me/GBFreestudy';
const TG_HANDLE = 'GBFreestudy';
const LOGO_URL = 'https://i.ibb.co/Q3g9fGSt/1791541921524.png';

// Decryption helper for PwMarco sealed payloads
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decryptPayload(raw: string): any {
  try {
    const dotIndex = raw.indexOf('.');
    if (dotIndex < 0) return null;
    const prefix = raw.slice(0, dotIndex);
    const b64Part = raw.slice(dotIndex + 1);

    const clean = b64Part.replace(/[^A-Za-z0-9+/]/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 4) {
      const n1 = B64_CHARS.indexOf(clean[i]);
      const n2 = B64_CHARS.indexOf(clean[i + 1]);
      const n3 = B64_CHARS.indexOf(clean[i + 2]);
      const n4 = B64_CHARS.indexOf(clean[i + 3]);
      bytes.push((n1 << 2) | (n2 >> 4));
      if (n3 >= 0) bytes.push(((15 & n2) << 4) | (n3 >> 2));
      if (n4 >= 0) bytes.push(((3 & n3) << 6) | n4);
    }
    bytes.reverse();

    const seedStr = 'p9Wm4rc0::sEaLv1' + prefix;
    let hash = 0x811c9dc5;
    for (let i = 0; i < seedStr.length; i++) {
      hash ^= seedStr.charCodeAt(i);
      hash = Math.imul(hash, 0x1000193) >>> 0;
    }
    let state = hash || 0x9e3779b9;
    const keyStream: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      keyStream.push(255 & (state >>>= 0));
    }

    const decryptedBytes = bytes.map((b, idx) => (b ^ keyStream[idx]) & 255);
    let str = '';
    for (const b of decryptedBytes) {
      str += String.fromCharCode(b);
    }
    const utf8 = decodeURIComponent(
      str.replace(/[\s\S]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
    );
    return JSON.parse(utf8);
  } catch (err) {
    return null;
  }
}

// Cache for guest token cookies to enable instantaneous initial load
let cachedGuestCookies: string | null = null;
let guestCookieExpiry = 0;

async function fetchGuestCookies(): Promise<string[]> {
  try {
    const res = await fetch(`${TARGET_ORIGIN}/api/auth/guest?next=%2Fstudy%2Fbatches`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const setCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') || ''];
    return setCookies.filter(Boolean);
  } catch (err) {
    console.error('Failed to pre-fetch guest cookies:', err);
    return [];
  }
}

async function getGuestCookieHeader(): Promise<{ cookieHeader: string; setCookies: string[] }> {
  const now = Date.now();
  if (cachedGuestCookies && now < guestCookieExpiry) {
    return { cookieHeader: cachedGuestCookies, setCookies: [] };
  }
  const setCookies = await fetchGuestCookies();
  const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (cookieHeader) {
    cachedGuestCookies = cookieHeader;
    guestCookieExpiry = now + 1000 * 60 * 60 * 6; // 6 hours
  }
  return { cookieHeader, setCookies };
}

// Transform text payload (HTML, JS, CSS, JSON)
function transformContent(rawContent: string, isHtml: boolean, currentHost: string): string {
  let content = rawContent
    .replace(/PW-MARCO/g, APP_NAME)
    .replace(/PW MARCO/g, APP_NAME)
    .replace(/PwMarco/g, APP_NAME)
    .replace(/PW Marco/g, APP_NAME)
    .replace(/https:\/\/t\.me\/official_marco_22/g, TG_URL)
    .replace(/official_marco_22/g, TG_HANDLE)
    .replace(/https:\/\/t\.me\/pwmarco/g, TG_URL)
    .replace(/https:\/\/i\.ibb\.co\/YBbwNGxz\/Logo-pw-removebg-preview\.png/g, LOGO_URL)
    .replace(/https:\/\/ibb\.co\/0R7qc34v/g, LOGO_URL);

  // Rewrite absolute target domain URLs to relative paths so browser doesn't bypass proxy
  content = content
    .replace(/https:\/\/pwmarco\.xyz\//g, '/')
    .replace(/https:\/\/pwmarco\.xyz/g, '')
    .replace(/http:\/\/pwmarco\.xyz\//g, '/')
    .replace(/http:\/\/pwmarco\.xyz/g, '');

  // Video Player fix: Force native HLS player instead of broken DASH / Shaka player (fixes error 3016 & 4032)
  content = content
    .replace('[t,m]=(0,a.useState)("select")', '[t,m]=(0,a.useState)("hls")')
    .replace('r&&!a?m("dash"):a&&!r&&m("hls")', 'm("hls")')
    .replace('u=c||s;', 'u=s||c;')
    .replace('"HLS"!==s&&"shaka"==("HLS"===(s||"")&&"HLS"===S?"hls":"shaka")', 'false');

  // Fix: TypeError: Cannot set property fetch of #<Window> which has only a getter
  const originalFetchPattern = `window.fetch=async(t,r)=>{let n=await e(t,r);if(!n.headers.get("x-pw-enc"))return n;let o=n.clone();try{let e=await o.json();if(!c(e))return n;let t=a(e.d),r=new Headers(n.headers);return r.set("content-type","application/json"),new Response(JSON.stringify(t),{status:n.status,statusText:n.statusText,headers:r})}catch(e){return n}}`;
  const safeFetchReplacement = `var _sf=async(t,r)=>{let n=await e(t,r);if(!n.headers.get("x-pw-enc"))return n;let o=n.clone();try{let e=await o.json();if(!c(e))return n;let t=a(e.d),r=new Headers(n.headers);return r.set("content-type","application/json"),new Response(JSON.stringify(t),{status:n.status,statusText:n.statusText,headers:r})}catch(e){return n}};try{window.fetch=_sf}catch(_err){try{Object.defineProperty(window,'fetch',{value:_sf,writable:true,configurable:true})}catch(_e2){}}`;
  content = content.replace(originalFetchPattern, safeFetchReplacement);

  // Fix: Disable Cloudflare Turnstile verification modal that fails due to domain mismatch
  const turnstileModalPattern = 'function s(){let e=(0,i.usePathname)()';
  const turnstileModalDisabled = 'function s(){return null;let e=(0,i.usePathname)()';
  content = content.replace(turnstileModalPattern, turnstileModalDisabled);

  // Fix: Disable anti-dev / window size blocker that triggers false-positives in iframes
  const deviceBlockerPattern = 'function c(){let[e,t]=(0,o.useState)(0),[r,i]=(0,o.useState)(()=>Date.now())';
  const deviceBlockerDisabled = 'function c(){return null;let[e,t]=(0,o.useState)(0),[r,i]=(0,o.useState)(()=>Date.now())';
  content = content.replace(deviceBlockerPattern, deviceBlockerDisabled);

  if (isHtml) {
    // Replace <title>
    content = content.replace(/<title>.*?<\/title>/gi, `<title>${APP_NAME}</title>`);

    // Inject early fetch shim, cookie setup, CSS and DOM observer at the top of <head>
    const scriptInjection = `
  <style>
    div.z-\\[99999\\],
    div[class*="z-[99999]"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    body {
      overflow: auto !important;
    }
  </style>
  <script>
  (function() {
    // 0. Set marco_sec_until in cookies and storage so security check never triggers
    try {
      var future = Date.now() + 315360000000;
      document.cookie = "marco_sec_until=" + future + "; path=/; max-age=315360000; SameSite=Lax";
      localStorage.setItem("marco_sec_until", String(future));
    } catch(e) {}

    // 1. Ensure window.fetch has both getter & setter before any chunk executes
    try {
      var _currentF = window.fetch.bind(window);
      Object.defineProperty(window, 'fetch', {
        get: function() { return _currentF; },
        set: function(fn) { _currentF = fn; },
        configurable: true,
        enumerable: true
      });
    } catch(err) {
      try {
        var proto = Object.getPrototypeOf(window);
        if (proto) {
          var desc = Object.getOwnPropertyDescriptor(proto, 'fetch');
          if (desc && desc.get && !desc.set) {
            Object.defineProperty(proto, 'fetch', {
              get: desc.get,
              set: function(fn) {
                Object.defineProperty(window, 'fetch', { value: fn, writable: true, configurable: true });
              },
              configurable: true
            });
          }
        }
      } catch(e) {}
    }
  })();
  </script>
  <title>${APP_NAME}</title>
  <link rel="icon" type="image/png" href="${LOGO_URL}" />
  <meta property="og:title" content="${APP_NAME}" />
  <meta property="og:site_name" content="${APP_NAME}" />
  <meta property="og:image" content="${LOGO_URL}" />
  <meta name="application-name" content="${APP_NAME}" />
  <script>
  (function() {
    // 1. Enforce Document Title
    try {
      document.title = "${APP_NAME}";
      var origDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
      if (origDescriptor && origDescriptor.set) {
        Object.defineProperty(document, 'title', {
          set: function(val) {
            if (typeof val === 'string') {
              val = val.replace(/PW[-\\s]?MARCO/gi, "${APP_NAME}");
            }
            origDescriptor.set.call(document, val);
          },
          get: function() {
            return origDescriptor.get.call(document);
          }
        });
      }
    } catch(e) {}

    // 2. Global Telegram Link Interceptor
    window.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (a && a.href && (a.href.includes('t.me') || a.href.includes('telegram'))) {
        a.href = "${TG_URL}";
      }
    }, true);

    // 3. Real-time DOM Mutation Observer for Brand & Logo
    function fixBrand(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        if (/PW[-\\s]?MARCO/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/PW[-\\s]?MARCO/gi, "${APP_NAME}");
        }
      } else if (node.nodeType === 1) {
        if (node.tagName === 'A' && node.href && (node.href.includes('t.me') || node.href.includes('telegram'))) {
          node.href = "${TG_URL}";
        }
        if (node.tagName === 'IMG') {
          if (node.src && (node.src.includes('YBbwNGxz') || node.src.includes('Logo-pw') || (node.alt && /logo|pw/i.test(node.alt)))) {
            node.src = "${LOGO_URL}";
          }
        }
        for (var i = 0; i < node.childNodes.length; i++) {
          fixBrand(node.childNodes[i]);
        }
      }
    }

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          fixBrand(m.addedNodes[j]);
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      fixBrand(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        observer.observe(document.body, { childList: true, subtree: true });
        fixBrand(document.body);
      });
    }
  })();
  </script>
`;
    // Inject at the top of <head> so it runs before any other chunk
    if (/<head(\s[^>]*)?>/i.test(content)) {
      content = content.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${scriptInjection}`);
    } else {
      content = `${scriptInjection}\n${content}`;
    }
  }

  return content;
}

// Serve logo from public directory
app.get('/logo.png', (_req: Request, res: Response) => {
  const localLogo = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(localLogo)) {
    return res.sendFile(localLogo);
  }
  return res.redirect(LOGO_URL);
});

// Root redirects directly to batches catalog
app.get('/', (_req: Request, res: Response) => {
  return res.redirect(302, '/study/batches');
});

// Bypass security verification and device check endpoints
app.all(
  ['/api/security/turnstile', '/api/security/device', '/api/cleanupVerifications'],
  (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', `marco_sec_until=${Date.now() + 315360000000}; Path=/; Max-Age=315360000; SameSite=Lax`);
    return res.json({ success: true, message: 'verified', blocked: false, blockedUntil: 0 });
  }
);

// Player options: Force HLS player across all client components (fixes Shaka / DASH crash)
app.get('/api/player-options', (_req: Request, res: Response) => {
  return res.json({ dashEnabled: false, hlsEnabled: true });
});

// Reverse proxy handler for all routes
app.all('*', async (req: Request, res: Response) => {
  try {
    const originalUrl = req.originalUrl;
    const targetUrl = `${TARGET_ORIGIN}${originalUrl}`;

    // Read incoming request body if present
    const bodyChunks: Buffer[] = [];
    for await (const chunk of req) {
      bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const reqBody = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

    // Cookie management
    let incomingCookies = req.headers.cookie || '';
    let autoSetCookies: string[] = [];
    if (!incomingCookies.includes('accessToken')) {
      const { cookieHeader, setCookies } = await getGuestCookieHeader();
      if (cookieHeader) {
        incomingCookies = incomingCookies ? `${incomingCookies}; ${cookieHeader}` : cookieHeader;
        autoSetCookies = setCookies;
      }
    }

    // Build headers to send to target
    const forwardHeaders: Record<string, string> = {
      Host: TARGET_HOST,
      Origin: TARGET_ORIGIN,
      Referer: `${TARGET_ORIGIN}${originalUrl}`,
      'User-Agent':
        (req.headers['user-agent'] as string) ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: (req.headers.accept as string) || '*/*',
      'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, identity',
    };

    if (incomingCookies) {
      forwardHeaders.Cookie = incomingCookies;
    }
    if (req.headers['content-type']) {
      forwardHeaders['Content-Type'] = req.headers['content-type'] as string;
    }
    if (req.headers['x-requested-with']) {
      forwardHeaders['X-Requested-With'] = req.headers['x-requested-with'] as string;
    }
    if (req.headers.range) {
      forwardHeaders['Range'] = req.headers.range as string;
    }
    if (req.headers.authorization) {
      forwardHeaders['Authorization'] = req.headers.authorization as string;
    }

    // Send request to target
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? reqBody : undefined,
      redirect: 'manual',
    });

    // Handle redirects from target
    const location = upstreamRes.headers.get('location');
    if (location && (upstreamRes.status === 301 || upstreamRes.status === 302 || upstreamRes.status === 307)) {
      let rewrittenLocation = location;
      if (rewrittenLocation.startsWith(TARGET_ORIGIN)) {
        rewrittenLocation = rewrittenLocation.replace(TARGET_ORIGIN, '');
      }
      return res.redirect(upstreamRes.status, rewrittenLocation || '/');
    }

    // Copy response headers
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isEncryptedApi = upstreamRes.headers.get('x-pw-enc') === '1';

    // Forward Set-Cookie headers, adjusting domain for current host
    const upstreamCookies = upstreamRes.headers.getSetCookie
      ? upstreamRes.headers.getSetCookie()
      : [upstreamRes.headers.get('set-cookie') || ''];

    const allSetCookies = [...autoSetCookies, ...upstreamCookies.filter(Boolean)];
    for (const cookieStr of allSetCookies) {
      // Strip domain constraint so cookie works on current app domain
      const cleaned = cookieStr
        .replace(/Domain=[^;]+;?\s*/gi, '')
        .replace(/SameSite=None;?\s*/gi, 'SameSite=Lax; ');
      res.append('Set-Cookie', cleaned);
    }
    res.append(
      'Set-Cookie',
      `marco_sec_until=${Date.now() + 315360000000}; Path=/; Max-Age=315360000; SameSite=Lax`
    );

    // Pass through status
    res.status(upstreamRes.status);

    // Pass essential response headers
    if (contentType) res.setHeader('Content-Type', contentType);
    if (isEncryptedApi) res.setHeader('x-pw-enc', '1');
    const cacheControl = upstreamRes.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    // Ensure iframe compatibility in AI Studio preview
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');

    // Read and decompress response body
    const rawBuffer = Buffer.from(await upstreamRes.arrayBuffer());
    const contentEncoding = upstreamRes.headers.get('content-encoding');
    let decompressed: Buffer = rawBuffer;

    if (contentEncoding === 'gzip') {
      try {
        decompressed = zlib.gunzipSync(rawBuffer);
      } catch {
        decompressed = rawBuffer;
      }
    } else if (contentEncoding === 'deflate') {
      try {
        decompressed = zlib.inflateSync(rawBuffer);
      } catch {
        decompressed = rawBuffer;
      }
    } else if (contentEncoding === 'br') {
      try {
        decompressed = zlib.brotliDecompressSync(rawBuffer);
      } catch {
        decompressed = rawBuffer;
      }
    }

    const currentHost = req.get('host') || `localhost:${PORT}`;

    // 1. Decrypt sealed API responses (AllBatches, searchBatch, BatchInfo, SubjectInfo, TopicInfo, streams, etc.)
    if (isEncryptedApi || contentType.includes('application/json')) {
      const text = decompressed.toString('utf-8');
      if (text.includes('"v":"1"') && text.includes('"d":')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.v === '1' && typeof parsed.d === 'string') {
            const decrypted = decryptPayload(parsed.d);
            if (decrypted !== null && decrypted !== undefined) {
              let outJson = JSON.stringify(decrypted);
              outJson = transformContent(outJson, false, currentHost);
              res.removeHeader('x-pw-enc');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Content-Length', Buffer.byteLength(outJson));
              return res.send(outJson);
            }
          }
        } catch (e) {
          console.error('Error during API decryption:', e);
        }
      }
    }

    // 2. Check if response is text (HTML, JS, CSS, JSON, m3u8 playlist, mpd manifest) to transform
    const isText =
      contentType.includes('text/') ||
      contentType.includes('application/json') ||
      contentType.includes('application/javascript') ||
      contentType.includes('application/x-javascript') ||
      contentType.includes('text/javascript') ||
      contentType.includes('mpegurl') ||
      contentType.includes('dash+xml');

    if (isText) {
      const utf8Text = decompressed.toString('utf-8');
      const isHtml = contentType.includes('text/html');

      // Transform brand, telegram, and logo
      const transformed = transformContent(utf8Text, isHtml, currentHost);

      res.setHeader('Content-Length', Buffer.byteLength(transformed));
      return res.send(transformed);
    }

    // 3. Binary media streaming (videos, audio, fonts, images, pdfs)
    return res.send(decompressed);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(502).send('Proxy service temporarily unavailable. Please refresh.');
  }
});

// Export Express app for Vercel Serverless Functions
export default app;

// Start Express server in standalone / AI Studio preview environment
if (!process.env.VERCEL && !process.env.NOW_REGION) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GB STUDY server running at http://0.0.0.0:${PORT}`);
  });
}
