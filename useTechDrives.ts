import { useEffect, useMemo, useState } from 'react';
import type { User, TechHome } from './types';
import type { Drive } from './techRanking';
import { useSettingsStore } from './settingsStore';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { LatLng, haversineMiles, approxEtaMinutes } from './geoUtils';

const pointKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

const isHome = (h: TechHome | undefined): h is TechHome =>
  !!h && typeof h.lat === 'number' && typeof h.lng === 'number';

const estimate = (from: LatLng, to: LatLng): Drive => {
  const miles = haversineMiles(from, to);
  return { miles, minutes: approxEtaMinutes(miles), exact: false };
};

// Each home→client road route is looked up once and kept for a while: reopening the job,
// or a second tech who lives at the same address, costs no extra (paid) lookup.
const ROUTE_TTL_MS = 15 * 60 * 1000;
const routeCache = new Map<string, { at: number; drive: Drive }>();
const inflight = new Map<string, Promise<Drive | null>>();

function cachedDrive(from: LatLng, to: LatLng): Drive | null {
  const hit = routeCache.get(`${pointKey(from)}>${pointKey(to)}`);
  return hit && Date.now() - hit.at < ROUTE_TTL_MS ? hit.drive : null;
}

function roadDrive(from: LatLng, to: LatLng): Promise<Drive | null> {
  const key = `${pointKey(from)}>${pointKey(to)}`;
  const hit = cachedDrive(from, to);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dispatch/route?from=${pointKey(from)}&to=${pointKey(to)}`, { headers: { ...authHeaders() } });
      if (!res.ok) return null;
      const d = await res.json();
      if (typeof d.minutes !== 'number' || typeof d.miles !== 'number') return null;
      const drive: Drive = { minutes: d.minutes, miles: d.miles, exact: !d.approx };
      if (drive.exact) routeCache.set(key, { at: Date.now(), drive });
      return drive;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// Drive from each tech's home (Settings → Team) to the client, by tech id. A tech with no
// home has no entry. A straight-line guess shows at once and is replaced by the road time
// when it arrives; `roads: false` keeps it to the free guess (nobody is dispatching).
export function useTechDrives(techs: User[], dest: LatLng | null | undefined, { roads = true }: { roads?: boolean } = {}): Record<string, Drive> {
  const homes = useSettingsStore(s => s.techHomes);
  const [roadByTrip, setRoadByTrip] = useState<Record<string, Drive>>({});
  const destKey = dest ? pointKey(dest) : '';

  // One lookup per distinct home — techs who live together share the answer.
  const origins = useMemo(() => {
    const m = new Map<string, LatLng>();
    for (const t of techs) {
      const h = homes?.[t.id];
      if (isHome(h)) m.set(pointKey(h), { lat: h.lat, lng: h.lng });
    }
    return m;
  }, [techs, homes]);
  const originsKey = [...origins.keys()].sort().join('|');

  // Routes already known show at once. New ones wait for the client pin to settle: a pause
  // mid-typing geocodes a half-written address, and the pick that follows moves the pin —
  // only the final one is worth a paid route.
  useEffect(() => {
    if (!dest || !roads || origins.size === 0) return;
    const known: Record<string, Drive> = {};
    const wanted: [string, LatLng][] = [];
    for (const [from, at] of origins) {
      const trip = `${from}>${destKey}`;
      const hit = cachedDrive(at, dest);
      if (hit) known[trip] = hit;
      else wanted.push([trip, at]);
    }
    if (Object.keys(known).length > 0) setRoadByTrip(prev => ({ ...prev, ...known }));
    if (wanted.length === 0) return;
    let active = true;
    const timer = setTimeout(() => {
      for (const [trip, at] of wanted) {
        roadDrive(at, dest).then(d => {
          if (active && d) setRoadByTrip(prev => (prev[trip] === d ? prev : { ...prev, [trip]: d }));
        });
      }
    }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [destKey, originsKey, roads]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const out: Record<string, Drive> = {};
    if (!dest) return out;
    for (const t of techs) {
      const h = homes?.[t.id];
      if (!isHome(h)) continue;
      out[t.id] = roadByTrip[`${pointKey(h)}>${destKey}`] || estimate(h, dest);
    }
    return out;
  }, [techs, homes, destKey, roadByTrip]); // eslint-disable-line react-hooks/exhaustive-deps
}
