/**
 * @cc [owner:smb2268,label:security] http-schemes-only
 * Returns `null` unless the value parses as an absolute URL with an `http:` or `https:` scheme.
 * The value is returned unchanged, never rewritten.
 */
export function getSafeSourceUrl(
  url: string | null | undefined
): string | null {
  if (!url) {
    return null;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * @cc [owner:smb2268,label:security] noopener-new-tab
 * Opens the URL in a new browsing context with the `noopener` feature so the opened page cannot
 * reach `window.opener`. MUST NOT call `window.open` when `getSafeSourceUrl` returns `null`.
 */
export function openSourceUrl(url: string | null | undefined): void {
  const safeUrl = getSafeSourceUrl(url);
  if (safeUrl) {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }
}

const SAFE_HREF_PROTOCOLS = ["http:", "https:", "mailto:"];

/**
 * @cc [owner:smb2268,label:security] href-scheme-allowlist
 * Returns `true` only when the href, resolved against the current document, has an `http:`,
 * `https:` or `mailto:` scheme. Relative paths resolve to the document origin and are allowed.
 * This is an allowlist on the parsed scheme, so it is not bypassable with whitespace or casing
 * tricks that a scheme-prefix regex would miss. Browser only: it resolves against `window.location`.
 */
export function isSafeHref(href: string): boolean {
  try {
    const { protocol } = new URL(href, window.location.href);
    return SAFE_HREF_PROTOCOLS.includes(protocol);
  } catch {
    return false;
  }
}
