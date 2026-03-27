export function isChromeExtension(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location?.protocol === "chrome-extension:"
  );
}

export function isFirefoxExtension(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location?.protocol === "moz-extension:"
  );
}

export function isBrowserExtension(): boolean {
  return isChromeExtension() || isFirefoxExtension();
}
