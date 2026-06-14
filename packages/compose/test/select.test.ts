import { describe, expect, it } from 'vitest';

import { createFixtureGraph } from '../src/fixture.js';
import { selectBest } from '../src/select.js';

describe('selectBest', () => {
  it('selects one top-scored candidate per component', () => {
    const selected = selectBest(createFixtureGraph());

    expect(selected.map((candidate) => candidate.variantId)).toEqual([
      'renderer:0',
      'model:blender',
      'shell:0'
    ]);
  });
});
