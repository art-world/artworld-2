// Connection readout, display only. No localStorage, no sessionStorage, no
// cookies, no analytics, no beacons. Read it, show it, hold it in a local
// variable, let it go. Adding any storage or logging here breaks the piece.
//
// The warehouse copy of this carries a temporary third-party fallback to
// ipwho.is, added to see the readout working before the custom domain
// exists. It is off here and should stay off: this world is deployed
// publicly, so switching it on sends every visitor's address to a third
// party, which is the one thing the piece claims it does not do. Turn it on
// locally if you want to see the readout populated, not on the live site.
const FALLBACK_TO_THIRD_PARTY = false;

function parseTrace(text){
  const fields = {};
  for (const line of text.trim().split('\n')){
    const i = line.indexOf('=');
    if (i === -1) continue;
    fields[line.slice(0, i)] = line.slice(i + 1);
  }
  return fields;
}

// Only exists once the site sits behind Cloudflare on its own domain, so on
// github.io this fails and the readout stays empty. That is the honest
// state rather than a borrowed one.
async function fromTrace(){
  const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
  if (!res.ok) throw new Error(`trace fetch failed: ${res.status}`);
  const f = parseTrace(await res.text());
  return { ip: f.ip ?? null, loc: f.loc ?? null, colo: f.colo ?? null };
}

async function fromThirdParty(){
  const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
  if (!res.ok) throw new Error(`ipwho.is fetch failed: ${res.status}`);
  const d = await res.json();
  if (!d.success) throw new Error('ipwho.is lookup failed');
  return {
    ip: d.ip ?? null,
    loc: [d.city, d.country].filter(Boolean).join(', ') || null,
    colo: d.connection?.isp ?? null,
  };
}

export async function readConnection(){
  try {
    return await fromTrace();
  } catch (err) {
    if (!FALLBACK_TO_THIRD_PARTY) return { ip: null, loc: null, colo: null };
    return fromThirdParty();
  }
}

// The argument, rather than the caption for it. The address is folded into
// a number that offsets the field, so the world a visitor is standing in is
// generated from their own connection and is not the one anyone else sees.
// Strip every label off the page and that still holds: it does not need to
// be explained, only to be true.
export function seedFrom(connection){
  const key = [connection.ip, connection.loc, connection.colo].filter(Boolean).join('|');
  if (!key) return 0;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++){
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Bounded, so a field is displaced into a different region of its own
  // noise rather than somewhere it was never tuned for.
  return ((h >>> 0) / 4294967295) * 40;
}

export function renderConnection(el, connection){
  const lines = [
    connection.ip ? `IP   ${connection.ip}` : null,
    connection.loc ? `LOC  ${connection.loc}` : null,
    connection.colo ? `NODE ${connection.colo}` : null,
  ].filter(Boolean);
  el.textContent = lines.join('\n');
}
