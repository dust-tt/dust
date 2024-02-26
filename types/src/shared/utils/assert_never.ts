export function assertNever(x: never): never {
  throw new Error(
    `${
      typeof x === "object" ? JSON.stringify(x, null, 2) : x
    } is not of type never. This should never happen.`
  );
}
