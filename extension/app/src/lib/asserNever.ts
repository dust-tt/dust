export function assertNeverAndIgnore(x: never): void {
  console.log(
    `${typeof x === "object" ? JSON.stringify(x) : x} is not handled.`
  );
}
