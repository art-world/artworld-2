// Connection readout, display only. No localStorage, no sessionStorage, no
// cookies, no analytics, no beacons. Read Cloudflare's /cdn-cgi/trace from
// our own domain, show it, hold it in a local variable, let it go. Adding
// any storage or logging here breaks the piece.
//
// TEMP R&D OVERRIDE: /cdn-cgi/trace only exists once this site sits behind
// Cloudflare on a custom domain (still an open item — see CLAUDE.md). Until
// then this falls back to ipwho.is, a third-party geolocation call, at the
// user's explicit request to see the readout working now. This fallback
// violates the "no third-party geolocation" rule on purpose and temporarily.
// Delete FALLBACK_TO_THIRD_PARTY and everything gated behind it once the
// real domain + Cloudflare setup lands.
const FALLBACK_TO_THIRD_PARTY = true;

function parseTrace(text) {
  const fields = {};
  for (const line of text.trim().split('\n')) {
    const i = line.indexOf('=');
    if (i === -1) continue;
    fields[line.slice(0, i)] = line.slice(i + 1);
  }
  return fields;
}

async function readFromCloudflareTrace() {
  const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
  if (!res.ok) throw new Error(`trace fetch failed: ${res.status}`);
  const fields = parseTrace(await res.text());
  return {
    ip: fields.ip ?? null,
    loc: fields.loc ?? null,
    colo: fields.colo ?? null,
  };
}

async function readFromThirdPartyFallback() {
  const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
  if (!res.ok) throw new Error(`ipwho.is fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error('ipwho.is lookup failed');
  return {
    ip: data.ip ?? null,
    loc: [data.city, data.country].filter(Boolean).join(', ') || null,
    colo: data.connection?.isp ?? null,
  };
}

export async function readConnection() {
  try {
    return await readFromCloudflareTrace();
  } catch (err) {
    if (!FALLBACK_TO_THIRD_PARTY) throw err;
    return readFromThirdPartyFallback();
  }
}

export function renderConnection(el, connection) {
  const lines = [
    connection.ip ? `IP    ${connection.ip}` : null,
    connection.loc ? `LOC   ${connection.loc}` : null,
    connection.colo ? `NODE  ${connection.colo}` : null,
  ].filter(Boolean);
  el.textContent = lines.join('\n');
}
