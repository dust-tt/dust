/**
 * Compile-time exhaustiveness checking that throws at runtime.
 * Use this when missing a case is a bug (internal logic, client-created data).
 * For client-side code processing API data where unknown values should be
 * safely ignored, use assertNeverAndIgnore instead.
 */
export function assertNever(x: never): never {
  throw new Error(
    `${
      typeof x === "object" ? JSON.stringify(x) : x
    } is not of type never. This should never happen.`
  );
}

/**
 * Like assertNever, provides compile-time exhaustiveness checking on switch statements,
 * but does NOT crash at runtime. Use this in client-side code that processes API data
 * (event streams, API responses) where new enum values or event types may be added
 * server-side before the client is updated.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertNeverAndIgnore(_x: never): void {
  // Intentionally empty.
}
