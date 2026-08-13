// Connection readout, display only. No localStorage, no sessionStorage, no
// cookies, no analytics, no beacons, no third-party geolocation. Read
// Cloudflare's /cdn-cgi/trace from our own domain, show it, hold it in a
// local variable, let it go. Adding any storage or logging here breaks the
// piece.

function parseTrace(text) {
  const fields = {};
  for (const line of text.trim().split('\n')) {
    const i = line.indexOf('=');
    if (i === -1) continue;
    fields[line.slice(0, i)] = line.slice(i + 1);
  }
  return fields;
}

export async function readConnection() {
  const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
  if (!res.ok) throw new Error(`trace fetch failed: ${res.status}`);
  const fields = parseTrace(await res.text());
  return {
    ip: fields.ip ?? null,
    loc: fields.loc ?? null,
    colo: fields.colo ?? null,
  };
}

export function renderConnection(el, connection) {
  const lines = [
    connection.ip ? `IP    ${connection.ip}` : null,
    connection.loc ? `LOC   ${connection.loc}` : null,
    connection.colo ? `NODE  ${connection.colo}` : null,
  ].filter(Boolean);
  el.textContent = lines.join('\n');
}
