// server.js — CommonJS Variante (mit Fix 1 & Fix 2)
require("dotenv").config();
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set("trust proxy", true);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));

// ==== ENV ====
const PIXEL_ID = process.env.PIXEL_ID;          // z.B. 123456789012345
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;  // Meta System User Token
const PORT = process.env.PORT || 3000;

// ==== Slug-Katalog ====
const CATALOG = {
  "naehe": {
    artist: "matas",
    title: "Nähe",
    links: {
      spotify: "https://open.spotify.com/track/2CbqQ1MkGGyfuwc6aUg4d1?si=d68112a0b89442df",
      apple:   "https://music.apple.com/us/album/n%C3%A4he/1828299731?i=1828299736&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=n-kTyVWo-Sk",
      amazon:  "https://music.amazon.com/albums/B0FJFHMDGV?trackAsin=B0FJFG84V7"
    }
  },
  "wdgm": {
    artist: "matas",
    title: "Was du grade machst",
    links: {
      spotify: "https://open.spotify.com/track/63M09x0U7OswUZoZRttyHe?si=4f860a09be2648de",
      apple:   "https://music.apple.com/us/album/was-du-grade-machst/1828444714?i=1828444715&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=i8MgGzS1XqU",
      amazon:  "https://music.amazon.com/albums/B0FJCLB9MX?trackAsin=B0FJCZKPG4"
    }
  },
  "5grad": {
    artist: "matas",
    title: "5 Grad",
    links: {
      spotify: "https://open.spotify.com/track/0RiOthkDBGIcJYXRgMAvhp?si=408a0727e32148c4",
      apple:   "https://music.apple.com/us/album/5-grad/1828299731?i=1828299732&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=lYl1-Nbi0xE",
      amazon:  "https://music.amazon.com/albums/B0FJFHMDGV?trackAsin=B0FJFHXXR3"
    }
  },
  "alleine": {
    artist: "matas",
    title: "Alleine",
    links: {
      spotify: "https://open.spotify.com/track/7iyAlH0S5YX7RHHKzwCKGk?si=acf0f3157558452b",
      apple:   "https://music.apple.com/us/album/alleine/1828454070?i=1828454071&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=P2NcblmpFi8",
      amazon:  "https://music.amazon.com/albums/B0FJDRJ7PM?trackAsin=B0FJD3TVQM"
    }
  },
  "hoffentlich": {
    artist: "matas",
    title: "Hoffentlich",
    links: {
      spotify: "https://open.spotify.com/track/75kp8a4C9S4usmECfTKWFS?si=165d52755c1c4752",
      apple:   "https://music.apple.com/us/album/hoffentlich/1828299731?i=1828299735&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=3Qy1dQ2apdk",
      amazon:  "https://music.amazon.com/albums/B0FJFHMDGV?trackAsin=B0FJFHC5ZS"
    }
  },
  "meinherz": {
    artist: "matas",
    title: "Mein Herz",
    links: {
      spotify: "https://open.spotify.com/track/5DUtczvALngc17i1JGzdK6?si=af8aa52b41414516",
      apple:   "https://music.apple.com/us/album/mein-herz/1828299731?i=1828299740&app=itunes",
      ytm:     "https://music.youtube.com/watch?v=LdWGgGp4JVo",
      amazon:  "https://music.amazon.com/albums/B0FJFHMDGV?trackAsin=B0FJFFBC69"
    }
  }
};

// ==== Helpers ====
const FB_CAPI_URL = (pixelId) => `https://graph.facebook.com/v19.0/${pixelId}/events`;

function buildCapIPayload({
  pixelId,
  event_name,
  event_id,
  event_source_url,
  ip,
  ua,
  fbp,
  fbc,
  custom_data = {},
  test_event_code
}) {
  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url,
      action_source: "website",
      user_data: {
        client_ip_address: ip,
        client_user_agent: ua,
        fbp: fbp || undefined,
        fbc: fbc || undefined
      },
      custom_data
    }]
  };
  if (test_event_code) payload.test_event_code = test_event_code;
  return payload;
}

async function sendCapi(pixelId, accessToken, payload) {
  const url = new URL(FB_CAPI_URL(pixelId));
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("CAPI error:", res.status, t);
  }
}

function appendUtms(baseUrl, query) {
  if (!baseUrl) return "#";
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(query)) {
    if (k.toLowerCase().startsWith("utm_") && v) u.searchParams.set(k, v);
  }
  return u.toString();
}

function renderPage({ artist, title, links, pixelId }) {
  const buttons = [
    { service: "spotify", label: "Auf Spotify hören", href: links.spotify },
    { service: "apple",   label: "Auf Apple Music hören", href: links.apple },
    { service: "ytm",     label: "Auf YouTube Music hören", href: links.ytm },
    { service: "amazon",  label: "Auf Amazon Music hören", href: links.amazon }
  ].map(l => `<a href="${l.href}" data-service="${l.service}" class="btn">${l.label}</a>`).join("");

  return `<!doctype html><html lang="de">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${artist} – ${title}</title>
<meta property="og:title" content="${title} – ${artist}">
<meta property="og:type" content="music.song">
<meta property="og:url" content="">
<style>
  :root{--bg:#0b0b0b;--fg:#fff;--muted:#9aa0a6;--accent:#1DB954;--card:#141414}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial}
  .wrap{max-width:560px;margin:0 auto;padding:24px 16px 48px}
  .card{background:var(--card);border-radius:16px;padding:20px;box-shadow:0 6px 30px rgba(0,0,0,.3)}
  h1{font-size:22px;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 16px;font-size:14px}
  .btn{display:block;width:100%;text-decoration:none;text-align:center;padding:14px 16px;border-radius:12px;margin:12px 0;font-weight:600;background:#222;color:#fff;border:1px solid #333}
  .btn[data-service="spotify"]{background:var(--accent);color:#000;border:none}
  .btn:active{transform:scale(.995)}footer{margin-top:14px;text-align:center}
  footer a{color:#6e6e6e;font-size:12px;text-decoration:underline}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${title}</h1><p class="sub">von ${artist}</p>
    ${buttons}
    <footer><a href="/privacy" rel="nofollow">Hinweis: Diese Seite nutzt Meta Pixel & CAPI.</a></footer>
  </div>
</div>

<!-- Meta Pixel -->
<script>
!(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"
/></noscript>

<script>
// ===== Utils: Cookies =====
function getCookie(name){return document.cookie.split('; ').find(r=>r.startsWith(name+'='))?.split('=')[1]}
function setCookie(name,val,days=90){const d=new Date();d.setTime(d.getTime()+days*864e5);document.cookie=name+"="+val+"; path=/; expires="+d.toUTCString()+"; SameSite=Lax"}

// fbclid -> _fbc (Client)
(function(){
  const p=new URL(location.href).searchParams;
  const fbclid=p.get('fbclid');
  if(fbclid){
    const v='fb.1.'+Math.floor(Date.now()/1000)+'.'+fbclid;
    setCookie('_fbc', v);
  }
})();

const urlQ = new URL(location.href).searchParams;
const TEST_EVENT_CODE = urlQ.get('test_event_code') || undefined;

// Visit: Browser + CAPI mit gleicher event_id
const visitId = (crypto.randomUUID && crypto.randomUUID()) || 'v_'+Math.random().toString(36).slice(2);
fbq('trackCustom','LinkVisit',{artist_name:${JSON.stringify("matas")},title:${JSON.stringify("Mein Herz")},music_service:'landing'},{eventID:visitId});

const visitPayload = {
  event_id: visitId,
  fbp: getCookie('_fbp'),
  fbc: getCookie('_fbc'),
  artist_name: ${JSON.stringify("matas")},
  title: ${JSON.stringify("Mein Herz")},
  event_source_url: location.href,
  test_event_code: TEST_EVENT_CODE
};
if (navigator.sendBeacon) {
  const blob=new Blob([JSON.stringify(visitPayload)],{type:'application/json'});
  navigator.sendBeacon('/capi/visit', blob);
} else {
  fetch('/capi/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(visitPayload)});
}

// Click: Browser + CAPI (dedupe), dann redirect
document.querySelectorAll('a.btn').forEach(a=>{
  a.addEventListener('click', function(e){
    e.preventDefault();
    const service=this.dataset.service;
    const href=this.getAttribute('href');
    const id=(crypto.randomUUID && crypto.randomUUID()) || 'c_'+Math.random().toString(36).slice(2);

    fbq('trackCustom','LinkClick',{artist_name:${JSON.stringify("matas")},title:${JSON.stringify("Mein Herz")},music_service:service},{eventID:id});

    const payload={
      event_id:id,
      fbp:getCookie('_fbp'),
      fbc:getCookie('_fbc'),
      artist_name:${JSON.stringify("matas")},
      title:${JSON.stringify("Mein Herz")},
      music_service:service,
      event_source_url:location.href,
      to:href,
      test_event_code: TEST_EVENT_CODE
    };
    if (navigator.sendBeacon){
      const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
      navigator.sendBeacon('/capi/click', blob);
      setTimeout(()=>{ location.href=href; },120);
    } else {
      fetch('/capi/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .finally(()=>location.href=href);
    }
  });
});
</script>
</body></html>`;
}

// ==== Routes ====

// Slug-Seite (mit Fix 1: _fbc Cookie setzen, wenn fbclid in URL ist)
app.get("/:slug", (req, res, next) => {
  if (req.query.fbclid) {
    const fbcValue = `fb.1.${Math.floor(Date.now() / 1000)}.${req.query.fbclid}`;
    res.cookie('_fbc', fbcValue, {
      maxAge: 90 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'Lax',
      path: '/'
    });
  }

  const slug = (req.params.slug || "").toLowerCase();
  const item = CATALOG[slug];
  if (!item) return next();

  const linksWithUtm = {
    spotify: appendUtms(item.links.spotify, req.query),
    apple:   appendUtms(item.links.apple, req.query),
    ytm:     appendUtms(item.links.ytm, req.query),
    amazon:  appendUtms(item.links.amazon, req.query)
  };

  const html = renderPage({
    artist: item.artist,
    title: item.title,
    links: linksWithUtm,
    pixelId: PIXEL_ID
  })
    .replaceAll(JSON.stringify("matas"), JSON.stringify(item.artist))
    .replaceAll(JSON.stringify("Mein Herz"), JSON.stringify(item.title));

  res.status(200).send(html);
});

// Privacy
app.get("/privacy", (req, res) => {
  res.type("text/html").send(`
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <div style="max-width:680px;margin:20px auto;padding:0 16px;font-family:system-ui">
    <h2>Datenschutzhinweis</h2>
    <p>Diese Seite nutzt das Meta Pixel und die Conversions API zur Messung von Linkaufrufen und -klicks.
       Erfasst werden u. a. IP-Adresse, User-Agent sowie ggf. Browser-ID (fbp) und Click-ID (fbc).
       Zweck: anonymisierte, aggregierte Statistik und Optimierung von Anzeigen.</p>
    <p><a href="/">Zurück</a></p>
  </div>`);
});

// ==== CAPI Endpoints ====

// /capi/visit (mit Fix 2: serverseitiger fbc-Fallback)
app.post("/capi/visit", async (req, res) => {
  try {
    let { event_id, fbp, fbc, artist_name, title, event_source_url, test_event_code } = req.body || {};

    if (!fbc) {
      let fbclidSource;
      if (req.query.fbclid) {
        fbclidSource = req.query.fbclid;
      } else if (req.get('referer') && req.get('referer').includes('fbclid=')) {
        try {
          const refUrl = new URL(req.get('referer'));
          fbclidSource = refUrl.searchParams.get('fbclid');
        } catch {}
      }
      if (fbclidSource) {
        fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclidSource}`;
      }
    }

    const payload = buildCapIPayload({
      pixelId: PIXEL_ID,
      event_name: "LinkVisit",
      event_id,
      event_source_url,
      ip: req.ip,
      ua: req.headers["user-agent"] || "",
      fbp, fbc,
      custom_data: { artist_name, title, music_service: "landing" },
      test_event_code
    });
    sendCapi(PIXEL_ID, ACCESS_TOKEN, payload).catch(()=>{});
    res.sendStatus(204);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

// /capi/click (mit Fix 2: serverseitiger fbc-Fallback)
app.post("/capi/click", async (req, res) => {
  try {
    let { event_id, fbp, fbc, artist_name, title, music_service, event_source_url, to, test_event_code } = req.body || {};

    if (!fbc) {
      let fbclidSource;
      if (req.query.fbclid) {
        fbclidSource = req.query.fbclid;
      } else if (req.get('referer') && req.get('referer').includes('fbclid=')) {
        try {
          const refUrl = new URL(req.get('referer'));
          fbclidSource = refUrl.searchParams.get('fbclid');
        } catch {}
      }
      if (fbclidSource) {
        fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclidSource}`;
      }
    }

    const payload = buildCapIPayload({
      pixelId: PIXEL_ID,
      event_name: "LinkClick",
      event_id,
      event_source_url,
      ip: req.ip,
      ua: req.headers["user-agent"] || "",
      fbp, fbc,
      custom_data: { artist_name, title, music_service, value: 0, currency: "EUR" },
      test_event_code
    });
    sendCapi(PIXEL_ID, ACCESS_TOKEN, payload).catch(()=>{});
    res.sendStatus(204);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

// Root
app.get("/", (req, res) => {
  res.type("text/plain").send("OK – benutze /:slug (z. B. /naehe, /wdgm, /5grad, /alleine, /hoffentlich, /meinherz).");
});

// 404
app.use((req,res)=>res.status(404).send("Not found"));

app.listen(PORT, () => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("⚠️ Bitte PIXEL_ID und ACCESS_TOKEN in .env setzen!");
  }
  console.log("Server läuft auf Port", PORT);
});
