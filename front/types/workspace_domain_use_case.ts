// Use cases for verified domains.
// Each use case can be independently enabled/disabled per domain.
export const WORKSPACE_DOMAIN_USE_CASES = [
  "sso_auto_join", // Allow users with matching email domain to auto-join workspace
  "mcp_static_ip_egress", // Route MCP requests to this domain through static IP proxy
] as const;

export type WorkspaceDomainUseCase = (typeof WORKSPACE_DOMAIN_USE_CASES)[number];

// Status of a domain use case.
// - pending: Use case requested but domain not yet verified
// - enabled: Use case active for this verified domain
// - disabled: Use case explicitly disabled for this domain
export const WORKSPACE_DOMAIN_USE_CASE_STATUSES = [
  "pending",
  "enabled",
  "disabled",
] as const;

export type WorkspaceDomainUseCaseStatus =
  (typeof WORKSPACE_DOMAIN_USE_CASE_STATUSES)[number];

export interface WorkspaceDomainUseCaseType {
  domain: string;
  useCase: WorkspaceDomainUseCase;
  status: WorkspaceDomainUseCaseStatus;
}
