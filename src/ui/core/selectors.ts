import type { State } from './state.js';
import type { FileEntry } from '../../types.js';

export function buildEligible(state: State): FileEntry[] {
  const s = state.manualExcluded;
  const auto = state.autoDeselected;
  return state.files.filter((f) => !s.has(f.relPath) && !auto.has(f.relPath));
}
