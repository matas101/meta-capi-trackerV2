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

function appendUtms(baseUrl
