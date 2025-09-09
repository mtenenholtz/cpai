import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadAicpConfig, findProfile, type AicpProfile } from './config.js';

const TMP_ROOT = path.join(process.cwd(), '.tmp-tests');

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

describe('config resolution precedence and profiles', () => {
  let homeSpy: any;
  let fakeHome: string;

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
    fakeHome = path.join(TMP_ROOT, 'home');
    await fs.mkdir(fakeHome, { recursive: true });
    // Point os.homedir() to our fake home
    homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    homeSpy?.mockRestore?.();
  });

  it('applies precedence: global < package.json#cpai < .cpairc.json', async () => {
    const proj = path.join(TMP_ROOT, 'proj-precedence');
    await fs.mkdir(proj, { recursive: true });

    // Global
    const globalCfg = { include: ['from-global'] };
    await writeJson(path.join(fakeHome, '.cpai', 'config.json'), globalCfg);

    // package.json#cpai
    const pkg = { name: 'x', version: '0.0.0', type: 'module', cpai: { include: ['from-pkg'] } };
    await writeJson(path.join(proj, 'package.json'), pkg);

    // .cpairc.json (highest)
    const rc = { include: ['from-rc'] };
    await writeJson(path.join(proj, '.cpairc.json'), rc);

    const cfg = await loadAicpConfig(proj);
    expect(cfg.include).toEqual(['from-rc']);
  });

  it('falls back to package.json over global when .cpairc.json missing', async () => {
    const proj = path.join(TMP_ROOT, 'proj-pkg-over-global');
    await fs.mkdir(proj, { recursive: true });

    await writeJson(path.join(fakeHome, '.cpai', 'config.json'), { include: ['from-global'] });
    await writeJson(path.join(proj, 'package.json'), {
      name: 'x',
      version: '0.0.0',
      type: 'module',
      cpai: { include: ['from-pkg'] },
    });

    const cfg = await loadAicpConfig(proj);
    expect(cfg.include).toEqual(['from-pkg']);
  });

  it('profile lookup: project .cpairc.json wins over package.json and global', async () => {
    const proj = path.join(TMP_ROOT, 'proj-profile-project-wins');
    await fs.mkdir(proj, { recursive: true });

    // Global defines a profile
    const globalProf: Record<string, AicpProfile> = {
      review: { include: ['from-global-prof'] },
    };
    await writeJson(path.join(fakeHome, '.cpai', 'config.json'), { profiles: globalProf });

    // package.json defines a conflicting profile
    await writeJson(path.join(proj, 'package.json'), {
      name: 'x',
      version: '0.0.0',
      type: 'module',
      cpai: { profiles: { review: { include: ['from-pkg-prof'] } } },
    });

    // .cpairc.json defines the same profile name
    await writeJson(path.join(proj, '.cpairc.json'), {
      profiles: { review: { include: ['from-rc-prof'] } },
    });

    const prof = await findProfile(proj, 'review');
    expect(prof?.include).toEqual(['from-rc-prof']);
  });

  it('profile fallback: uses global when absent in project', async () => {
    const proj = path.join(TMP_ROOT, 'proj-profile-fallback-global');
    await fs.mkdir(proj, { recursive: true });

    // Only global has the profile
    await writeJson(path.join(fakeHome, '.cpai', 'config.json'), {
      profiles: { review: { include: ['from-global-prof'] } },
    });

    const prof = await findProfile(proj, 'review');
    expect(prof?.include).toEqual(['from-global-prof']);
  });
});
