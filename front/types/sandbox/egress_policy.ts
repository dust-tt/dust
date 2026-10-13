import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// Caps the pending-request section of one policy scope: the proxy re-reads
// the file on every cache miss, so an agent must not be able to grow it
// unboundedly. Also bounds the domains a Frame manifest may declare.
export const SANDBOX_POLICY_MAX_REQUESTED_DOMAINS = 50;

// A domain an agent asked to add to a Pod's allowlist, pending admin
// approval. Lives as a section of the Pod's policy file: the proxy ignores
// unknown fields, so only allowedDomains is authorization state — this
// section is admin-workflow state riding along for atomic approve
// transitions (one write moves a domain from requested to allowed).
export type EgressDomainRequest = {
  domain: string;
  requestedAtMs: number;
};

export type EgressPolicy = {
  allowedDomains: string[];
  requestedDomains?: EgressDomainRequest[];
};

export const EMPTY_EGRESS_POLICY = Object.freeze({
  allowedDomains: Object.freeze([]),
}) as unknown as EgressPolicy;

const EgressDomainRequestSchema = z.object({
  domain: z.string(),
  requestedAtMs: z.number(),
});

const EgressPolicyShapeSchema = z.object({
  allowedDomains: z.array(z.string()),
  requestedDomains: z.array(EgressDomainRequestSchema).optional(),
});

export const EGRESS_POLICY_DOMAIN_MAX_LENGTH = 253;

export type EgressPolicyDomainErrorCode =
  | "empty"
  | "too_long"
  | "ip_address"
  | "invalid_format"
  | "tld_without_letter"
  | "wildcard_without_suffix"
  | "invalid_wildcard"
  | "https_secret_single_label";

const EGRESS_POLICY_DOMAIN_ERROR_MESSAGES: Record<
  EgressPolicyDomainErrorCode,
  string
> = {
  empty: "Domain cannot be empty.",
  too_long: `Domain must be ${EGRESS_POLICY_DOMAIN_MAX_LENGTH} characters or less.`,
  ip_address: "IP addresses are not supported.",
  invalid_format:
    "Use an exact domain such as api.github.com or a wildcard such as *.github.com.",
  tld_without_letter: "Domain must have a top-level label containing a letter.",
  wildcard_without_suffix: "Wildcard domains must include a suffix.",
  invalid_wildcard: "Wildcards must use the form *.example.com.",
  https_secret_single_label:
    "HTTPS secret domains need at least two DNS labels separated by a dot, such as github.com or api.github.com.",
};

/**
 * @cc [owner:sfriquet,label:error-handling;api] stable-code-and-english-message
 * `code` is the stable identifier UI code translates. `message` MUST stay the English
 * `EGRESS_POLICY_DOMAIN_ERROR_MESSAGES[code]`, prefixed with `<domain>: ` when `domain` is set:
 * server callers return it as is to API clients and agents.
 */
export class EgressPolicyDomainError extends Error {
  constructor(
    readonly code: EgressPolicyDomainErrorCode,
    readonly domain?: string
  ) {
    const message = EGRESS_POLICY_DOMAIN_ERROR_MESSAGES[code];
    super(domain === undefined ? message : `${domain}: ${message}`);
    this.name = "EgressPolicyDomainError";
  }
}

function normalizeDnsName(
  value: string
): Result<string, EgressPolicyDomainError> {
  const normalized = value.toLowerCase().replace(/\.$/, "");

  if (normalized.length === 0) {
    return new Err(new EgressPolicyDomainError("empty"));
  }

  if (normalized.length > EGRESS_POLICY_DOMAIN_MAX_LENGTH) {
    return new Err(new EgressPolicyDomainError("too_long"));
  }

  if (isIpLiteral(normalized)) {
    return new Err(new EgressPolicyDomainError("ip_address"));
  }

  const labels = normalized.split(".");
  for (const label of labels) {
    if (!isValidDnsLabel(label)) {
      return new Err(new EgressPolicyDomainError("invalid_format"));
    }
  }

  const tld = labels[labels.length - 1];
  if (!/[a-z]/.test(tld)) {
    return new Err(new EgressPolicyDomainError("tld_without_letter"));
  }

  return new Ok(normalized);
}

function isIpLiteral(value: string): boolean {
  const unbracketed =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;

  return isIpv4Literal(unbracketed) || isIpv6Literal(unbracketed);
}

function isIpv4Literal(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) {
        return false;
      }

      const octet = Number.parseInt(part, 10);
      return octet >= 0 && octet <= 255;
    })
  );
}

function isIpv6Literal(value: string): boolean {
  return value.includes(":") && /^[0-9a-f:.]+$/i.test(value);
}

function isValidDnsLabel(label: string): boolean {
  if (label.length === 0 || label.length > 63) {
    return false;
  }

  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

export function normalizeEgressPolicyDomain(
  value: string
): Result<string, EgressPolicyDomainError> {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return new Err(new EgressPolicyDomainError("empty"));
  }

  if (trimmed.startsWith("*.")) {
    const suffixResult = normalizeDnsName(trimmed.slice(2));
    if (suffixResult.isErr()) {
      return suffixResult;
    }

    const suffix = suffixResult.value;
    if (suffix.split(".").length < 2) {
      return new Err(new EgressPolicyDomainError("wildcard_without_suffix"));
    }

    return new Ok(`*.${suffix}`);
  }

  if (trimmed.includes("*")) {
    return new Err(new EgressPolicyDomainError("invalid_wildcard"));
  }

  return normalizeDnsName(trimmed);
}

export function normalizeEgressPolicyDomains(
  values: string[]
): Result<string[], EgressPolicyDomainError> {
  const domains = new Set<string>();

  for (const value of values) {
    const normalized = normalizeEgressPolicyDomain(value);
    if (normalized.isErr()) {
      return new Err(new EgressPolicyDomainError(normalized.error.code, value));
    }
    domains.add(normalized.value);
  }

  return new Ok([...domains]);
}

export function normalizeEgressPolicy(
  policy: EgressPolicy
): Result<EgressPolicy, Error> {
  const domains = normalizeEgressPolicyDomains(policy.allowedDomains);
  if (domains.isErr()) {
    return domains;
  }

  // Requested domains are normalized but never rejected wholesale: a single
  // malformed pending request must not brick reads (and thereby writes) of
  // the whole policy file, so invalid entries are dropped. Requests whose
  // domain is already allowed are dropped too — approve transitions and
  // out-of-band allowlist additions both resolve them.
  const allowed = new Set(domains.value);
  const requestedByDomain = new Map<string, EgressDomainRequest>();
  for (const request of policy.requestedDomains ?? []) {
    const normalized = normalizeEgressPolicyDomain(request.domain);
    if (normalized.isErr() || allowed.has(normalized.value)) {
      continue;
    }
    if (!requestedByDomain.has(normalized.value)) {
      requestedByDomain.set(normalized.value, {
        ...request,
        domain: normalized.value,
      });
    }
  }

  return new Ok({
    allowedDomains: domains.value,
    ...(requestedByDomain.size > 0
      ? { requestedDomains: [...requestedByDomain.values()] }
      : {}),
  });
}

export function parseEgressPolicy(value: unknown): Result<EgressPolicy, Error> {
  const parsed = EgressPolicyShapeSchema.safeParse(value);
  if (!parsed.success) {
    return new Err(new Error("Invalid egress policy shape."));
  }

  return normalizeEgressPolicy(parsed.data);
}
