import { db } from '../db.js';
import { geocode, drivingRoute } from './geo.js';
import { sendSMS } from './openphone.js';
import { sendPushToUser } from './push.js';
import { t } from './messages.js';

// On-demand tech ETA. A phone's GPS can only be read by its own app in the foreground,
// so the server can't pull it directly. Instead: when a client asks and we don't have a
// fresh tech location, we PUSH the tech ("share your location") — tapping it (or having
// the app open) makes their phone report GPS, which fulfills the client's request with a
// fresh, accurate ETA. Pending asks live in memory (single Railway replica); a restart
// just means the client keeps the holding message — acceptable, best-effort.

const pending = new Map(); // techId -> { clientPhone, jobId, techName, lang, askedAt }
const TTL_MS = 10 * 60 * 1000;

function clientCoordsOf(job) {
  if (typeof job?.client?.lat === 'number' && typeof job?.client?.lng === 'number') {
    return { lat: job.client.lat, lng: job.client.lng };
  }
  return null;
}

// Compute the drive from the tech's location to the client and text the client the ETA.
export async function sendEtaToClient(clientPhone, job, techLoc, techName, lang) {
  let clientLoc = clientCoordsOf(job);
  if (!clientLoc) {
    const addr = [job.client?.address, job.client?.zip].filter(Boolean).join(', ');
    clientLoc = addr ? await geocode(addr) : null;
  }
  const route = (techLoc && clientLoc) ? await drivingRoute(techLoc, clientLoc) : null;
  const firstName = (job.client?.firstName || '').trim() || (lang === 'es' ? 'hola' : 'there');
  const tech = techName || (lang === 'es' ? 'Su técnico' : 'Your technician');
  const reply = route
    ? t('etaReply', lang, { name: firstName, tech, miles: route.miles, minutes: route.minutes })
    : t('etaReplyNoLoc', lang, { name: firstName, tech });
  await sendSMS(clientPhone, reply);
  return route;
}

// Register a pending ask and nudge the tech's phone to report a fresh location.
export async function requestFreshEta({ techId, clientPhone, job, techName, lang }) {
  pending.set(techId, { clientPhone, jobId: job.id, techName, lang, askedAt: Date.now() });
  const first = (job.client?.firstName || '').trim();
  await sendPushToUser(techId, {
    title: 'Client is asking your ETA',
    body: `${first || 'A customer'} wants to know how far away you are — tap to share your location.`,
    tag: `eta-${techId}`,
    data: { type: 'share-location', jobId: job.id, url: '/' },
  });
}

// Called when a tech's location arrives (PUT /users/:id). If a client was waiting on this
// tech, compute and send the fresh ETA now.
export async function fulfillEtaRequest(techId, loc) {
  const req = pending.get(techId);
  if (!req || !loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
  pending.delete(techId);
  if (Date.now() - req.askedAt > TTL_MS) return; // client gave up long ago
  try {
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [req.jobId]);
    const job = rows[0]?.data;
    if (!job) return;
    await sendEtaToClient(req.clientPhone, job, { lat: loc.lat, lng: loc.lng }, req.techName, req.lang);
    console.log('[eta] fresh ETA delivered →', req.clientPhone);
  } catch (e) { console.error('[eta] fulfill error', e.message); }
}
