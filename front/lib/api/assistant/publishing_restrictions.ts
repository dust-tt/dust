import type { Authenticator } from "@app/lib/auth";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isBuilder } from "@app/types/user";

export const PUBLISHING_RESTRICTIONS = {
  builders_and_admins: {
    message: "Publishing agents is restricted to builders and admins.",
    requiredRole: "builder" as const,
  },
  admins_only: {
    message: "Publishing agents is restricted to admins.",
    requiredRole: "admin" as const,
  },
} as const;

export type PublishingRestriction = keyof typeof PUBLISHING_RESTRICTIONS;

export function getPublishingRestrictionLevel(
  featureFlags: readonly string[]
): PublishingRestriction | null {
  if (featureFlags.includes("restrict_agents_publishing_to_admins")) {
    return "admins_only";
  }
  if (featureFlags.includes("restrict_agents_publishing")) {
    return "builders_and_admins";
  }
  return null;
}

export function getPublishingRestrictionMessage(
  featureFlags: readonly string[]
): string | null {
  const level = getPublishingRestrictionLevel(featureFlags);
  return level ? PUBLISHING_RESTRICTIONS[level].message : null;
}

function canPublishForRole(
  role: "admin" | "builder",
  check: { isAdmin: boolean; isBuilder: boolean }
): boolean {
  return role === "admin" ? check.isAdmin : check.isBuilder;
}

export function canPublishForOwner(
  owner: WorkspaceType | null,
  level: PublishingRestriction
): boolean {
  return canPublishForRole(PUBLISHING_RESTRICTIONS[level].requiredRole, {
    isAdmin: isAdmin(owner),
    isBuilder: isBuilder(owner),
  });
}

export function canPublishForAuth(
  auth: Authenticator,
  level: PublishingRestriction
): boolean {
  return canPublishForRole(PUBLISHING_RESTRICTIONS[level].requiredRole, {
    isAdmin: auth.isAdmin(),
    isBuilder: auth.isBuilder(),
  });
}

export function getPublishingRestrictionForOwner(
  featureFlags: readonly string[],
  owner: WorkspaceType | null
): { disabled: boolean; tooltip: string | undefined } {
  const level = getPublishingRestrictionLevel(featureFlags);
  if (!level) {
    return { disabled: false, tooltip: undefined };
  }
  const restriction = PUBLISHING_RESTRICTIONS[level];
  const disabled = !canPublishForOwner(owner, level);
  return {
    disabled,
    tooltip: disabled ? restriction.message : undefined,
  };
}
