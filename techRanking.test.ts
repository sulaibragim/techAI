import { describe, it, expect } from 'vitest';
import { rankTechs, formatDrive, Drive } from './techRanking';
import type { User } from './types';

const tech = (id: string, extra: Partial<User> = {}): User => ({
  id, name: id, email: `${id}@x.com`, role: 'technician', active: true, createdAt: '2026-01-01', techStatus: 'available', ...extra,
});
const drive = (minutes: number, exact = true): Drive => ({ minutes, miles: minutes / 2, exact });
const names = (rows: { tech: User }[]) => rows.map(r => r.tech.name);

describe('rankTechs — who should take the job', () => {
  it('puts the shortest drive from home first, then the next, and so on', () => {
    const rows = rankTechs([tech('phoenix'), tech('mesa'), tech('gilbert')], {
      phoenix: drive(41), mesa: drive(18), gilbert: drive(26),
    });
    expect(names(rows)).toEqual(['mesa', 'gilbert', 'phoenix']);
    expect(rows.filter(r => r.isNearest).map(r => r.tech.name)).toEqual(['mesa']);
  });

  it('two techs sharing a home are both nearest, and the free one goes first', () => {
    const rows = rankTechs(
      [tech('sultan', { techStatus: 'offDuty' }), tech('kamill', { techStatus: 'available' })],
      { sultan: drive(22), kamill: drive(22) },
    );
    expect(names(rows)).toEqual(['kamill', 'sultan']);
    expect(rows.every(r => r.isNearest)).toBe(true);
  });

  it('a tech with no home set goes below everyone who can be measured', () => {
    const rows = rankTechs([tech('nohome'), tech('far')], { far: drive(55) });
    expect(names(rows)).toEqual(['far', 'nohome']);
    expect(rows[1].drive).toBeNull();
    expect(rows[1].isNearest).toBe(false);
  });

  it('keeps the owner’s routing rule: preferred tech, then specialist, then distance', () => {
    const techs = [tech('near'), tech('specialist', { skills: ['Automotive'] }), tech('fav')];
    const drives = { near: drive(10), specialist: drive(30), fav: drive(45) };
    const rows = rankTechs(techs, drives, { jobType: 'Automotive', favoriteTechId: 'fav' });
    expect(names(rows)).toEqual(['fav', 'specialist', 'near']);
    // "Nearest" is about the drive, not about the place in the list.
    expect(rows.find(r => r.isNearest)?.tech.name).toBe('near');
  });

  it('with nobody measurable, free techs still come before busy and off-duty ones', () => {
    const rows = rankTechs([tech('off', { techStatus: 'offDuty' }), tech('busy', { techStatus: 'onJob' }), tech('free')], {});
    expect(names(rows)).toEqual(['free', 'busy', 'off']);
    expect(rows.some(r => r.isNearest)).toBe(false);
  });
});

describe('formatDrive', () => {
  it('reads a road time plainly and marks a straight-line guess', () => {
    expect(formatDrive(drive(22))).toBe('22 min');
    expect(formatDrive(drive(22, false))).toBe('~22 min');
  });

  it('switches to hours past the hour', () => {
    expect(formatDrive(drive(65))).toBe('1 h 5 min');
    expect(formatDrive(drive(120))).toBe('2 h');
    expect(formatDrive(drive(0))).toBe('1 min');
  });
});
