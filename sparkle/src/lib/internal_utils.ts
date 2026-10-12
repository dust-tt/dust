// These utils should be internal to sparkle and not exposed to consumers of the library.

export function assertNever(x: never): never {
  throw new Error(`${x} is not of type never. This should never happen.`);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
