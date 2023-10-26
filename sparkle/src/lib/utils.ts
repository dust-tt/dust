export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function assertNever(x: never): never {
  throw new Error(`${x} is not of type never. This should never happen.`);
}
