// .github/scripts/sync-tdx-flights.js
// Calls TDX FIDS API for TPE departures, filters JX flights, writes data/flights.json.
// Runs inside GitHub Actions with Node.js 20+ (built-in fetch).

const fs = require('fs');
const path = require('path');

const AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// TDX FIDS v2 · TPE 出境航班 · 只要 STARLUX (JX)
// Note: %24 = $ (URL-encoded) required for OData query params
const FIDS_URL =
  "https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Departure/TPE" +
  "?%24filter=AirlineID%20eq%20'JX'" +
  "&%24format=JSON";

async function main() {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing TDX_CLIENT_ID or TDX_CLIENT_SECRET (set them in repo Secrets)');
  }

  // ─── 1. Auth ────────────────────────────────────────────────
  console.log('→ Authenticating with TDX…');
  const authResp = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!authResp.ok) {
    const t = await authResp.text();
    throw new Error(`TDX auth failed: ${authResp.status} ${t.slice(0, 200)}`);
  }
  const { access_token } = await authResp.json();
  console.log('  ✓ Got access token');

  // ─── 2. Fetch FIDS ──────────────────────────────────────────
  console.log('→ Fetching FIDS departures (JX only)…');
  const fidsResp = await fetch(FIDS_URL, {
    headers: { Authorization: `Bearer ${access_token}`, 'accept-encoding': 'br,gzip' },
  });
  if (!fidsResp.ok) {
    const t = await fidsResp.text();
    throw new Error(`TDX FIDS failed: ${fidsResp.status} ${t.slice(0, 200)}`);
  }
  const raw = await fidsResp.json();
  console.log(`  ✓ TDX returned ${raw.length} rows`);

  // ─── 3. Transform to lounge app schema ──────────────────────
  const flights = raw
    .filter(f => f.ScheduleDepartureTime && f.FlightNumber)
    .map(f => {
      // TDX ScheduleDepartureTime is ISO with +08:00, e.g. "2026-09-20T09:55:00+08:00"
      // Take HH:MM directly from the string (local time, no timezone math needed)
      const std = String(f.ScheduleDepartureTime).substring(11, 16);
      const terminalRaw = f.Terminal ? String(f.Terminal).trim() : null;
      const terminal = terminalRaw
        ? (terminalRaw.startsWith('T') ? terminalRaw : `T${terminalRaw}`)
        : null;
      return {
        flight_no: `${f.AirlineID}${f.FlightNumber}`.trim(),
        destination: f.ArrivalAirportID || null,
        destination_name: f.ArrivalAirportName?.Zh_tw
                      || f.ArrivalAirportName?.En
                      || f.ArrivalAirportID
                      || null,
        std,
        terminal,
        schedule_departure_time: f.ScheduleDepartureTime,
        gate: f.Gate || null,
        status: f.DepartureRemark?.Zh_tw || f.DepartureRemark?.En || null,
      };
    })
    .filter(f => f.flight_no && f.flight_no.startsWith('JX'))
    // Sort by STD ascending for readability
    .sort((a, b) => (a.std || '').localeCompare(b.std || ''));

  // De-dup by flight_no (safety — TDX may return duplicates across days)
  const seen = new Set();
  const dedup = [];
  flights.forEach(f => {
    if (!seen.has(f.flight_no)) { seen.add(f.flight_no); dedup.push(f); }
  });

  console.log(`  ✓ Kept ${dedup.length} unique JX flights`);

  // ─── 4. Write file ──────────────────────────────────────────
  const output = {
    last_updated: new Date().toISOString(),
    source: 'TDX FIDS TPE Departure (AirlineID=JX)',
    count: dedup.length,
    flights: dedup,
  };

  const outputDir = 'data';
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'flights.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`  ✓ Wrote ${outputPath} (${dedup.length} flights)`);

  // Preview
  console.log('\n─── Sample (first 3) ───');
  dedup.slice(0, 3).forEach(f => {
    console.log(`  ${f.flight_no}  ${f.std}  ${f.terminal || '-'}  → ${f.destination_name} (${f.destination})`);
  });
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
