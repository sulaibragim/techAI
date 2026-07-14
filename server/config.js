// Single source of truth for "are we running in production?".
//
// This used to be `NODE_ENV === 'production'` in each file. That made NODE_ENV a silent
// single point of failure: if the platform didn't set it, the boot gate was skipped, JWTs
// were signed with the public fallback below, both webhooks accepted unsigned payloads and
// DB SSL was off — all with nothing but a console warning. Railway always injects its own
// RAILWAY_* vars, so treat their presence as production too: the insecure path now requires
// running on no platform at all, which is exactly what a laptop looks like.
export const isProd = () =>
  process.env.NODE_ENV === 'production' ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_PUBLIC_DOMAIN ||
  !!process.env.RAILWAY_PROJECT_ID;

// The dev-only signing key. Exported so the readiness check can detect that it's still in
// use rather than duplicating the literal in a third place.
export const DEV_JWT_FALLBACK = 'dev-insecure-secret-change-me';

export const jwtSecret = () => process.env.JWT_SECRET || DEV_JWT_FALLBACK;
