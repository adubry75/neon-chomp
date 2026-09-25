import { describe, expect, it } from 'vitest';
import { actPips } from '../src/game/run';

describe('actPips', () => {
  it('marks cleared, current, upcoming and boss', () => {
    expect(actPips(2)).toEqual(['done', 'done', 'current', 'todo', 'boss']);
    expect(actPips(4)).toEqual(['done', 'done', 'done', 'done', 'bossCurrent']);
    expect(actPips(5)).toEqual(['current', 'todo', 'todo', 'todo', 'boss']);
  });
});
