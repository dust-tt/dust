/**
 * Domain use cases for verified domains.
 *
 * A domain can be verified once (via DNS verification through WorkOS) and then
 * enabled for multiple use cases:
 * - "sso": Enable SSO auto-join for users with matching email domains
 * - "mcp": Allow MCP servers on this domain to use static egress IP
 */
export const DOMAIN_USE_CASES = ["sso", "mcp"] as const;
export type DomainUseCase = (typeof DOMAIN_USE_CASES)[number];

export function isDomainUseCase(value: unknown): value is DomainUseCase {
  return DOMAIN_USE_CASES.includes(value as DomainUseCase);
}

export function isValidUseCasesArray(value: unknown): value is DomainUseCase[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isDomainUseCase);
}
