export function isChromeExtension(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location?.protocol === "chrome-extension:"
  );
}
