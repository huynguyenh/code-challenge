/**
 * Three independent ways to compute the sum 1 + 2 + ... + n in TypeScript.
 *
 * Per the brief: input n is any integer, and the result is assumed to fit
 * inside Number.MAX_SAFE_INTEGER (2^53 − 1). The closed-form variant below
 * stays exact while n × (n + 1) ≤ 2^53 − 1, i.e. n ≤ ~94_906 — well above
 * any realistic test value the brief implies.
 *
 * Convention for n ≤ 0: all three return 0. The brief says "any integer"
 * but doesn't define the meaning for negatives; "sum of an empty range is
 * zero" is the cleanest treatment and is documented here so the choice is
 * explicit rather than incidental.
 */

/**
 * sum_to_n_a — iterative loop.
 *
 * Time complexity:  O(n) — one addition per integer in [1, n].
 * Space complexity: O(1) — single accumulator.
 *
 * Tradeoffs: simplest to read, no stack risk, no math gotchas. The default
 * choice when readability beats cleverness.
 */
export const sum_to_n_a = (n: number): number => {
  if (n <= 0) return 0;
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += i;
  }
  return total;
};

/**
 * sum_to_n_b — functional reduction over a generated range.
 *
 * Time complexity:  O(n) — one addition per element.
 * Space complexity: O(n) — `Array.from` materialises the full [1..n] range
 *                   before reducing. Allocates roughly 8·n bytes for the
 *                   underlying numeric array.
 *
 * Tradeoffs: idiomatic, declarative JS — reads as "the sum of [1..n]" with
 * no manual index arithmetic. Pays for that clarity with linear allocation,
 * which makes it the slowest of the three for very large n (memory pressure
 * + GC). Useful when range generation and aggregation belong together
 * conceptually (e.g. when chaining .map().filter().reduce() pipelines).
 */
export const sum_to_n_b = (n: number): number => {
  if (n <= 0) return 0;
  return Array.from({ length: n }, (_, i) => i + 1).reduce(
    (acc, v) => acc + v,
    0,
  );
};

/**
 * sum_to_n_c — closed-form Gauss formula n(n+1)/2.
 *
 * Time complexity:  O(1).
 * Space complexity: O(1).
 *
 * Tradeoffs: dramatically faster than the other two for large n, but only
 * works because the reader recognises the identity. Precision is exact
 * while n × (n + 1) ≤ Number.MAX_SAFE_INTEGER (n ≤ ~94_906); past that the
 * IEEE-754 representation silently loses precision. The brief's safety
 * guarantee on the input puts us well inside that range.
 */
export const sum_to_n_c = (n: number): number =>
  n <= 0 ? 0 : (n * (n + 1)) / 2;
