// server.js
// Minimaler CAPI + Linkseite-Server (Browser+Server Events mit Deduplication)
// Node 18+, `npm i express dotenv compression helmet uuid node-fetch@3`

import express from "express";
import compression from "compression";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", true); // damit req.ip hinter Proxies stimmt
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false, // einfacher für Inline-HTML/JS
  })
);

// ====== ENV ======
const PIXEL_ID = process.env.PIXEL_ID;          // z.B. 123456789012345
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;  // Meta System User Token
const PORT = process.env.PORT || 3000;

// ====== Helpers ======
const FB_CAPI_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

function buildCapIPayload({
  event_name,
  event_id,
  event_source_url,
  ip,
  ua,
  fbp,
  fbc,
  custom_data = {},
  test_event_code, // optional
}) {
  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url,
        action_source: "website",
        user_data: {
          client_ip_address: ip,
          client_user_agent: ua,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
        },
        custom_data,
      },
    ],
  };
  if (test_event_code) payload.test_event_code = test_event_code;
  return payload;
}

async function sendCapi(payload) {
  const url = new URL(FB_CAPI_URL);
  url.searchParams.set("access_token", ACCESS_TOKEN);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("CAPI error:", res.status, t);
  }
}

// ====== Templating (einfaches Inline-HTML) ======
function renderPage({ artist_name, title, links, pixelId }) {
  // Reihenfolge ist bereits sortiert: Spotify, Apple, YouTube Music, Amazon
  const buttons = links
    .map(
      (l) => `
      <a href="${l.href}" data-service="${l.service}" class="btn">
        ${l.label}
      </a>`
    )
    .join("");

  // Minimaler, performanter Mobile-First Stil
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${artist_name} – ${title}</title>
<style>
  :root { --bg:#0b0b0b; --fg:#fff; --muted:#9aa0a6; --accent:#1DB954; --card:#141414; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial; }
  .wrap { max-width:560px; margin:0 auto; padding:24px 16px 48px; }
  .card { background:var(--card); border-radius:16px; padding:20px; box-shadow:0 6px 30px rgba(0,0,0,.3); }
  h1 { font-size:22px; margin:0 0 6px; }
  p.sub { color:var(--muted); margin:0 0 16px; font-size:14px; }
  .btn { display:block; width:100%; text-decoration:none; text-align:center; padding:14px 16px; border-radius:12px; margin:12px 0; font-weight:600; background:#222; color:#fff; border:1px solid #333; }
  .btn[data-service="spotify"] { background: var(--accent); color:#000; border:none; }
  .btn:active { transform: scale(.995); }
  footer { margin-top:14px; text-align:center; }
  footer a { color:#6e6e6e; font-size:12px; text-decoration:underline; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${title}</h1>
    <p class="sub">von ${artist_name}</p>
    ${buttons}
    <footer><a href="/privacy" rel="nofollow">Hinweis: Diese Seite nutzt Meta CAPI/Pixels für Messung.</a></footer>
  </div>
</div>

<!-- Meta Pixel -->
<script>
  !(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[]; t=b.createElement(e); t.async=!0;
  t.src=v; s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s)
  })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init','${pixelId}');
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"
/></noscript>

<script>
// ===== Utilities: fbp/fbc =====
function getCookie(name){
  return document.cookie.split('; ').find(r=>r.startsWith(name+'='))?.split('=')[1];
}
function setCookie(name, value, days=90){
  const d = new Date(); d.setTime(d.getTime()+days*24*60*60*1000);
  document.cookie = name + "=" + value + "; path=/; expires=" + d.toUTCString() + "; SameSite=Lax";
}
// Wenn fbclid existiert, _fbc konform setzen: 'fb.1.<ts>.<fbclid>'
(function ensureFbc(){
  const url = new URL(location.href);
  const fbclid = url.searchParams.get('fbclid');
  if (fbclid) {
    const val = 'fb.1.' + Math.floor(Date.now()/1000) + '.' + fbclid;
    setCookie('_fbc', val);
  }
})();

// ===== LinkVisit: Browser + CAPI mit gleicher event_id =====
const visitEventId = crypto.randomUUID ? crypto.randomUUID() : '${"ev"}' + Math.random().toString(36).slice(2);

// Browser Event
fbq('trackCustom', 'LinkVisit', {
  artist_name: ${JSON.stringify("${artist_name}")},
  title: ${JSON.stringify("${title}")},
  music_service: 'landing'
}, {eventID: visitEventId});

// Server Event nachladen (sendBeacon bevorzugt)
const visitPayload = {
  event_id: visitEventId,
  fbp: getCookie('_fbp'),
  fbc: getCookie('_fbc'),
  artist_name: ${JSON.stringify("${artist_name}")},
  title: ${JSON.stringify("${title}")},
  event_source_url: location.href
};
if (navigator.sendBeacon) {
  const blob = new Blob([JSON.stringify(visitPayload)], {type:'application/json'});
  navigator.sendBeacon('/capi/visit', blob);
} else {
  fetch('/capi/visit', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(visitPayload)});
}

// ===== Click-Handler: Browser + CAPI (dedupe) und dann redirect
document.querySelectorAll('a.btn').forEach(a=>{
  a.addEventListener('click', function(e){
    e.preventDefault();
    const service = this.dataset.service;
    const href = this.getAttribute('href');
    const eventId = crypto.randomUUID ? crypto.randomUUID() : '${"ev"}' + Math.random().toString(36).slice(2);

    // Browser Event
    fbq('trackCustom','LinkClick',{
      artist_name: ${JSON.stringify("${artist_name}")},
      title: ${JSON.stringify("${title}")},
      music_service: service
    }, {eventID: eventId});

    // Server Event
    const payload = {
      event_id: eventId,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      artist_name: ${JSON.stringify("${artist_name}")},
      title: ${JSON.stringify("${title}")},
      music_service: service,
      event_source_url: location.href,
      to: href
    };
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
      navigator.sendBeacon('/capi/click', blob);
      setTimeout(()=>{ location.href = href; }, 120); // kleiner Delay für Beacon
    } else {
      fetch('/capi/click', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
        .finally(()=>location.href = href);
    }
  });
});
</script>
</body></html>`;
}

// ====== Routes ======

// Linkseite: /?artist=matas&title=Mein%20Herz&spotify=...&apple=...&ytm=...&amazon=...
app.get("/", (req, res) => {
  const artist_name = req.query.artist || "matas";
  const title = req.query.title || "Mein Herz";

  const links = [
    { service: "spotify", label: "Auf Spotify hören", href: req.query.spotify || "#" },
    { service: "apple", label: "Auf Apple Music hören", href: req.query.apple || "#" },
    { service: "ytm", label: "Auf YouTube Music hören", href: req.query.ytm || "#" },
    { service: "amazon", label: "Auf Amazon Music hören", href: req.query.amazon || "#" },
  ];

  const html = renderPage({ artist_name, title, links, pixelId: PIXEL_ID });
  res.status(200).send(html);
});

// Privacy Hinweis
app.get("/privacy", (req, res) => {
  res.type("text/html").send(`
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <div style="max-width:680px;margin:20px auto;padding:0 16px;font-family:system-ui">
      <h2>Datenschutzhinweis</h2>
      <p>Diese Seite setzt das Meta Pixel und die Conversions API ein, um anonyme, aggregierte Statistiken zu generieren. 
      Es werden u. a. IP-Adresse, User-Agent sowie (sofern verfügbar) die Meta-Browser-ID (fbp) und Click-ID (fbc) verarbeitet. 
      Zweck: Messung von Musik-Linkklicks und Optimierung von Anzeigen.</p>
      <p><a href="/">Zurück</a></p>
    </div>
  `);
});

// CAPI: LinkVisit (Server)
app.post("/capi/visit", async (req, res) => {
  try {
    const { event_id, fbp, fbc, artist_name, title, event_source_url } = req.body || {};
    const ip = req.ip;
    const ua = req.headers["user-agent"] || "";

    const payload = buildCapIPayload({
      event_name: "LinkVisit",
      event_id,
      event_source_url,
      ip,
      ua,
      fbp,
      fbc,
      custom_data: {
        artist_name,
        title,
        music_service: "landing",
      },
    });

    sendCapi(payload).catch(()=>{});
    res.sendStatus(204);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

// CAPI: LinkClick (Server)
app.post("/capi/click", async (req, res) => {
  try {
    const { event_id, fbp, fbc, artist_name, title, music_service, event_source_url, to } = req.body || {};
    const ip = req.ip;
    const ua = req.headers["user-agent"] || "";

    const payload = buildCapIPayload({
      event_name: "LinkClick",
      event_id,
      event_source_url,
      ip,
      ua,
      fbp,
      fbc,
      custom_data: {
        artist_name,
        title,
        music_service, // 'spotify' | 'apple' | 'ytm' | 'amazon'
        value: 0,
        currency: "EUR",
      },
    });

    sendCapi(payload).catch(()=>{});
    res.sendStatus(204);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("⚠️  Bitte PIXEL_ID und ACCESS_TOKEN in .env setzen!");
  }
  console.log("Server läuft auf port", PORT);
});
