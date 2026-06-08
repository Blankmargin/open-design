import { describe, it, expect } from 'vitest';
import { resolvePreviewStorageSnapshot, type PreviewStorageSnapshot } from '../../src/runtime/srcdoc';

const SNAP: PreviewStorageSnapshot = {
  file: 'index.html',
  snapshot: { localStorage: { modelhub_authed: '1' }, windowName: 'modelhub_authed' },
};

describe('resolvePreviewStorageSnapshot keeps auth state for its target file', () => {
  it('seeds and consumes only on the matching, source-ready render', () => {
    const r = resolvePreviewStorageSnapshot(SNAP, 'index.html', true);
    expect(r.initStorage).toEqual(SNAP.snapshot);
    expect(r.consume).toBe(true);
  });

  it('does NOT consume on the intermediate empty-source render (the login bug)', () => {
    // After login -> index navigation the memo first recomputes with the new
    // filename but the index source still loading. Consuming here would drop the
    // snapshot before index.html ever sees it.
    const r = resolvePreviewStorageSnapshot(SNAP, 'index.html', false);
    expect(r.initStorage).toBeNull();
    expect(r.consume).toBe(false);
  });

  it('does NOT consume while a stale/other file is still rendered', () => {
    const r = resolvePreviewStorageSnapshot(SNAP, 'login.html', true);
    expect(r.initStorage).toBeNull();
    expect(r.consume).toBe(false);
  });

  it('is inert when there is no pending snapshot', () => {
    expect(resolvePreviewStorageSnapshot(null, 'index.html', true)).toEqual({
      initStorage: null,
      consume: false,
    });
    expect(resolvePreviewStorageSnapshot(undefined, 'index.html', true)).toEqual({
      initStorage: null,
      consume: false,
    });
  });
});
