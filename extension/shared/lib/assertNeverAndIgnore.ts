export function assertNeverAndIgnore(x: never): void {
  // This could happen if the extension is not up-to-date with the current version of the app.
  console.log(
    `${typeof x === "object" ? JSON.stringify(x) : x} is not handled, ensure you use the latest version of the extension.`
  );
}
