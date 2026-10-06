const base64URLEncode = (buffer: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
};

export const generatePKCE = async (): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
};

// Error handling utilities.

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorToString(error));
}

export function getTabNotOnDomainError({
  tabId,
  tabUrl,
  domainToFetch,
}: {
  tabId: number;
  tabUrl: string;
  domainToFetch: string;
}): string | null {
  // The model may send "https://example.com". Keep the hostname only.
  const trimmedDomain = domainToFetch.trim();
  const domainUrl = trimmedDomain.includes("://")
    ? trimmedDomain
    : `https://${trimmedDomain}`;
  const domain = URL.canParse(domainUrl) ? new URL(domainUrl).hostname : null;
  const tabHostname = URL.canParse(tabUrl) ? new URL(tabUrl).hostname : null;
  if (
    tabHostname &&
    domain &&
    (tabHostname === domain || tabHostname.endsWith(`.${domain}`))
  ) {
    return null;
  }

  return (
    `Tab ${tabId} is on "${tabHostname ?? "unknown"}", not on "${domainToFetch}". ` +
    "Call the tool again with the tab's domain in domainToFetch, one call per domain."
  );
}
