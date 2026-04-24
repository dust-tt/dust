import { Err, Ok, type Result } from "@app/types/shared/result";
import { z } from "zod";

export type EgressPolicy = {
  allowedDomains: string[];
};

export const EMPTY_EGRESS_POLICY = Object.freeze({
  allowedDomains: Object.freeze([]),
}) as unknown as EgressPolicy;

const EgressPolicyShapeSchema = z.object({
  allowedDomains: z.array(z.string()),
});

function normalizeDnsName(value: string): Result<string, Error> {
  const normalized = value.toLowerCase().replace(/\.$/, "");

  if (normalized.length === 0) {
    return new Err(new Error("Domain cannot be empty."));
  }

  if (normalized.length > 253) {
    return new Err(new Error("Domain must be 253 characters or less."));
  }

  if (isIpLiteral(normalized)) {
    return new Err(new Error("IP addresses are not supported."));
  }

  const labels = normalized.split(".");
  for (const label of labels) {
    if (!isValidDnsLabel(label)) {
      return new Err(
        new Error(
          "Use an exact domain such as api.github.com or a wildcard such as *.github.com."
        )
      );
    }
  }

  const tld = labels[labels.length - 1];
  if (!/[a-z]/.test(tld)) {
    return new Err(
      new Error("Domain must have a top-level label containing a letter.")
    );
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
): Result<string, Error> {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return new Err(new Error("Domain cannot be empty."));
  }

  if (trimmed.startsWith("*.")) {
    const suffixResult = normalizeDnsName(trimmed.slice(2));
    if (suffixResult.isErr()) {
      return suffixResult;
    }

    const suffix = suffixResult.value;
    if (suffix.split(".").length < 2) {
      return new Err(new Error("Wildcard domains must include a suffix."));
    }

    return new Ok(`*.${suffix}`);
  }

  if (trimmed.includes("*")) {
    return new Err(new Error("Wildcards must use the form *.example.com."));
  }

  return normalizeDnsName(trimmed);
}

export function normalizeEgressPolicyDomains(
  values: string[]
): Result<string[], Error> {
  const domains = new Set<string>();

  for (const value of values) {
    const normalized = normalizeEgressPolicyDomain(value);
    if (normalized.isErr()) {
      return new Err(new Error(`${value}: ${normalized.error.message}`));
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

  return new Ok({
    allowedDomains: domains.value,
  });
}

export function parseEgressPolicy(value: unknown): Result<EgressPolicy, Error> {
  const parsed = EgressPolicyShapeSchema.safeParse(value);
  if (!parsed.success) {
    return new Err(new Error("Invalid egress policy shape."));
  }

  return normalizeEgressPolicy(parsed.data);
}
