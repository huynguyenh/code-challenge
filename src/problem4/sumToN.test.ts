import { describe, expect, it } from 'vitest';
import { sum_to_n_a, sum_to_n_b, sum_to_n_c } from './sumToN.js';

const implementations = [
  ['sum_to_n_a', sum_to_n_a],
  ['sum_to_n_b', sum_to_n_b],
  ['sum_to_n_c', sum_to_n_c],
] as const;

// 7 inputs × 3 implementations = 21 happy/edge cases.
describe.each(implementations)('%s', (_name, fn) => {
  it.each([
    [0, 0],
    [1, 1],
    [5, 15],
    [10, 55],
    [100, 5050],
    [10_000, 50_005_000],
    [-3, 0],
  ])('for n=%i returns %i', (n, expected) => {
    expect(fn(n)).toBe(expected);
  });
});

// Cross-implementation consistency — guards against a regression where one
// approach drifts from the others (e.g. an off-by-one in the loop or a sign
// flip in the formula).
describe('cross-implementation consistency', () => {
  it.each([0, 1, 2, 50, 1_000, 9_999])(
    'all three implementations agree for n=%i',
    (n) => {
      const a = sum_to_n_a(n);
      const b = sum_to_n_b(n);
      const c = sum_to_n_c(n);
      expect(a).toBe(b);
      expect(b).toBe(c);
    },
  );
});
