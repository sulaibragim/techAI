import type { User, TechStatus } from './types';

// Which specialties matter for a given job type (a tech with any of these is a "specialist").
export const SKILL_FOR_TYPE: Record<string, string[]> = {
  Automotive: ['Automotive', 'High-end cars'],
  Residential: ['Residential', 'Smart locks'],
  Commercial: ['Commercial'],
  'Secure / Safe': ['Safes'],
  Other: [],
};

export const skillsFor = (jobType?: string): string[] => SKILL_FOR_TYPE[jobType || ''] || [];

// A drive from a tech's home to the client. `exact` = a road route (traffic-aware when
// Google is keyed); otherwise a straight-line guess shown until the route comes back.
export interface Drive {
  minutes: number;
  miles: number;
  exact: boolean;
}

export interface RankedTech {
  tech: User;
  drive: Drive | null; // null = no home set, so there is nothing to measure from
  isFavorite: boolean;
  isSpecialist: boolean;
  isNearest: boolean;
}

const STATUS_ORDER: Record<TechStatus, number> = { available: 0, onJob: 1, offDuty: 2 };
const statusRank = (u: User) => STATUS_ORDER[u.techStatus || 'offDuty'] ?? 2;

// Who should take the job, best first: the client's preferred tech, then a specialist for
// this job type, then the shortest drive from home. On an equal drive (two techs sharing
// a home) the free one goes ahead of a busy one. Every tech at the shortest drive is
// "nearest" — whatever their place in the list.
export function rankTechs(
  techs: User[],
  drives: Record<string, Drive | undefined>,
  { jobType, favoriteTechId }: { jobType?: string; favoriteTechId?: string } = {},
): RankedTech[] {
  const want = skillsFor(jobType);
  const rows: RankedTech[] = techs.map(tech => ({
    tech,
    drive: drives[tech.id] || null,
    isFavorite: !!favoriteTechId && tech.id === favoriteTechId,
    isSpecialist: want.length > 0 && (tech.skills || []).some(s => want.includes(s)),
    isNearest: false,
  }));
  const measured = rows.filter(r => r.drive);
  if (measured.length > 0) {
    const best = Math.min(...measured.map(r => r.drive!.minutes));
    for (const r of measured) r.isNearest = r.drive!.minutes === best;
  }
  return rows.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (a.isSpecialist !== b.isSpecialist) return a.isSpecialist ? -1 : 1;
    if (!a.drive !== !b.drive) return a.drive ? -1 : 1;
    if (a.drive && b.drive && a.drive.minutes !== b.drive.minutes) return a.drive.minutes - b.drive.minutes;
    return statusRank(a.tech) - statusRank(b.tech);
  });
}

// "22 min", "1 h 5 min"; a straight-line guess reads "~22 min".
export function formatDrive(d: Drive): string {
  const m = Math.max(1, Math.round(d.minutes));
  const text = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return d.exact ? text : `~${text}`;
}
