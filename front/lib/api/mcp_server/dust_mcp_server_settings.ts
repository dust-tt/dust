import type { WorkspaceMetadata } from "@app/lib/api/workspace";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const DEFAULT_DUST_MCP_SERVER_ALLOWED_REDIRECT_URIS = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  // "cursor://anysphere.cursor-mcp/oauth/callback",
  // "https://www.cursor.com/agents/mcp/oauth/callback",
] as const;

export type DustMcpServerRedirectUriPolicy = "all" | "allowlist";

export interface DustMcpServerSettings {
  disabled: boolean;
  acceptAllRedirectUris: boolean;
  allowedRedirectUris: string[];
}

export function isDustMcpServerEnabled(
  metadata?: WorkspaceMetadata | null
): boolean {
  return metadata?.dustMcpServerDisabled !== true;
}

export function getDustMcpServerRedirectUriPolicy(
  metadata?: WorkspaceMetadata | null
): DustMcpServerRedirectUriPolicy {
  if (metadata?.dustMcpServerAcceptAllRedirectUris === false) {
    return "allowlist";
  }
  return "all";
}

export function getDustMcpServerAllowedRedirectUris(
  metadata?: WorkspaceMetadata | null
): string[] {
  return (
    metadata?.dustMcpServerAllowedRedirectUris ?? [
      ...DEFAULT_DUST_MCP_SERVER_ALLOWED_REDIRECT_URIS,
    ]
  );
}

export function getDustMcpServerSettingsFromMetadata(
  metadata?: WorkspaceMetadata | null
): DustMcpServerSettings {
  return {
    disabled: !isDustMcpServerEnabled(metadata),
    acceptAllRedirectUris:
      getDustMcpServerRedirectUriPolicy(metadata) === "all",
    allowedRedirectUris: getDustMcpServerAllowedRedirectUris(metadata),
  };
}

export function normalizeDustMcpServerRedirectUri(uri: string): string {
  return uri.trim();
}

export function validateDustMcpServerRedirectUri(
  uri: string
): Result<string, Error> {
  const normalized = normalizeDustMcpServerRedirectUri(uri);
  if (!normalized) {
    return new Err(new Error("Redirect URI cannot be empty."));
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\/.+/i.test(normalized)) {
    return new Err(
      new Error(
        "Redirect URI must include a scheme (for example http://, https://, or cursor://)."
      )
    );
  }

  return new Ok(normalized);
}

export function validateDustMcpServerAllowedRedirectUris(
  allowedRedirectUris: string[]
): Result<string[], Error> {
  const normalizedUris: string[] = [];
  const seenUris = new Set<string>();

  for (const uri of allowedRedirectUris) {
    const validation = validateDustMcpServerRedirectUri(uri);
    if (validation.isErr()) {
      return validation;
    }

    if (seenUris.has(validation.value)) {
      return new Err(new Error(`Duplicate redirect URI: ${validation.value}`));
    }

    seenUris.add(validation.value);
    normalizedUris.push(validation.value);
  }

  return new Ok(normalizedUris);
}

type ParsedRedirectUri = {
  scheme: string;
  host: string;
  port: number | null;
  path: string;
};

function parseRedirectUri(uri: string): ParsedRedirectUri {
  const parsed = new URL(uri);
  return {
    scheme: parsed.protocol.replace(/:$/, "").toLowerCase(),
    host: parsed.hostname.toLowerCase(),
    port: parsed.port === "" ? null : Number(parsed.port),
    path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
  };
}

const PORT_WILDCARD_PATTERN =
  /^([a-z][a-z0-9+.-]*):\/\/([^:/]+):\*(?:\/(.*))?$/i;

function redirectUrisMatchExactly(uri: string, pattern: string): boolean {
  if (uri === pattern) {
    return true;
  }

  try {
    const parsedUri = parseRedirectUri(uri);
    const parsedPattern = parseRedirectUri(pattern);
    return (
      parsedUri.scheme === parsedPattern.scheme &&
      parsedUri.host === parsedPattern.host &&
      parsedUri.port === parsedPattern.port &&
      parsedUri.path === parsedPattern.path
    );
  } catch {
    return false;
  }
}

/**
 * Returns whether a redirect URI matches an allowed pattern.
 * Supports the `*` wildcard, exact patterns, and port wildcards such as
 * `http://localhost:*`. URIs without an explicit port match port-wildcard
 * patterns for the same host.
 */
export function redirectUriMatchesAllowedPattern(
  redirectUri: string,
  allowedPattern: string
): boolean {
  const normalizedUri = normalizeDustMcpServerRedirectUri(redirectUri);
  const normalizedPattern = normalizeDustMcpServerRedirectUri(allowedPattern);

  if (normalizedPattern === "*") {
    return true;
  }

  const portWildcardMatch = normalizedPattern.match(PORT_WILDCARD_PATTERN);
  if (portWildcardMatch) {
    const [, scheme, host, pathSuffix] = portWildcardMatch;

    try {
      const parsed = parseRedirectUri(normalizedUri);

      if (parsed.scheme !== scheme.toLowerCase()) {
        return false;
      }
      if (parsed.host !== host.toLowerCase()) {
        return false;
      }
      if (pathSuffix !== undefined && pathSuffix !== "") {
        const expectedPath = `/${pathSuffix}`;
        if (parsed.path !== expectedPath) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  return redirectUrisMatchExactly(normalizedUri, normalizedPattern);
}

export function isRedirectUriAllowed(
  redirectUri: string,
  allowedPatterns: string[]
): boolean {
  return allowedPatterns.some((pattern) =>
    redirectUriMatchesAllowedPattern(redirectUri, pattern)
  );
}

export function areRedirectUrisAllowed(
  redirectUris: string[],
  allowedPatterns: string[]
): boolean {
  return redirectUris.every((redirectUri) =>
    isRedirectUriAllowed(redirectUri, allowedPatterns)
  );
}
