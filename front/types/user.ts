import * as t from "io-ts";
import { WorkOSOrganizationType } from "@dust-tt/client";

import type {
  EmbeddingProviderIdType,
  ModelProviderIdType,
} from "./assistant/assistant";
import type { MembershipOriginType } from "./memberships";
import type { ModelId } from "./shared/model_id";
import { assertNever } from "./shared/utils/assert_never";

export type WorkspaceSegmentationType = "interesting" | null;

export const ROLES = ["admin", "builder", "user", "none"] as const;
export const ACTIVE_ROLES = ["admin", "builder", "user"] as const;
export const ANONYMOUS_USER_IMAGE_URL = "/static/humanavatar/anonymous.png";

function keyObject<T extends readonly string[]>(
  arr: T
): { [K in T[number]]: null } {
  return Object.fromEntries(arr.map((v) => [v, null])) as {
    [K in T[number]]: null;
  };
}

export const RoleSchema = t.keyof(keyObject(ROLES));

export type RoleType = t.TypeOf<typeof RoleSchema>;

export function isRoleType(role: string): role is RoleType {
  return ROLES.includes(role as RoleType);
}

export const ActiveRoleSchema = t.keyof(keyObject(ACTIVE_ROLES));

export type ActiveRoleType = t.TypeOf<typeof ActiveRoleSchema>;

export function isActiveRoleType(role: string): role is ActiveRoleType {
  return ACTIVE_ROLES.includes(role as ActiveRoleType);
}

type PublicAPILimitsEnabled = {
  enabled: true;
  markup: number;
  monthlyLimit: number;
  billingDay: number; // Best-effort, represents the day of the month when the billing period starts.
};

type PublicAPILimitsDisabled = {
  enabled: false;
};

export type PublicAPILimitsType =
  | PublicAPILimitsEnabled
  | PublicAPILimitsDisabled;

export type LightWorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  role: RoleType;
  segmentation: WorkspaceSegmentationType;
  whiteListedProviders: ModelProviderIdType[] | null;
  defaultEmbeddingProvider: EmbeddingProviderIdType | null;
  metadata: {
    publicApiLimits?: PublicAPILimitsType;
    [key: string]: string | number | boolean | object | undefined;
  } | null;
  workOSOrganizationId?: string | null;
  groups?: string[];
};

export type WorkspaceType = LightWorkspaceType & {
  ssoEnforced?: boolean;
};

export type ExtensionWorkspaceType = WorkspaceType & {
  blacklistedDomains: string[] | null;
};

export type UserProviderType =
  | "auth0"
  | "github"
  | "google"
  | "okta"
  | "samlp"
  | "waad"
  | null;

export type UserType = {
  sId: string;
  id: ModelId;
  createdAt: number;
  provider: UserProviderType;
  username: string;
  email: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  image: string | null;
  lastLoginAt: number | null;
};

export type UserTypeWithWorkspace = UserType & {
  workspace: WorkspaceType;
  origin?: MembershipOriginType;
};

export type UserTypeWithWorkspaces = UserType & {
  workspaces: WorkspaceType[];
  organizations?: WorkOSOrganizationType[];
  origin?: MembershipOriginType;
  selectedWorkspace?: string;
};

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
  organizations: WorkOSOrganizationType[];
  selectedWorkspace?: string;
};

export type UserMetadataType = {
  key: string;
  value: string;
};

export type EditedByUser = {
  editedAt: number | null;
  fullName: string | null;
  imageUrl: string | null;
  email: string | null;
  userId: string | null;
};

export function formatUserFullName(user?: {
  firstName?: string;
  lastName?: string | null;
}) {
  return user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : null;
}

export function isAdmin(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "admin" } {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
      return true;
    case "builder":
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}

export function isBuilder(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "builder" | "admin" } {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "builder":
      return true;
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}

export function isUser(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "user" | "builder" | "admin" } {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "builder":
    case "user":
      return true;
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}

export function isOnlyUser(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "user" } {
  if (!owner) {
    return false;
  }
  return owner.role === "user";
}

export function isOnlyBuilder(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "builder" } {
  if (!owner) {
    return false;
  }
  return owner.role === "builder";
}

export function isOnlyAdmin(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "admin" } {
  if (!owner) {
    return false;
  }
  return owner.role === "admin";
}

const DustUserEmailHeader = "x-api-user-email";

export function getUserEmailFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}) {
  const email = headers[DustUserEmailHeader];
  if (typeof email === "string") {
    return email;
  }

  return undefined;
}

export function getHeaderFromUserEmail(email: string | undefined) {
  if (!email) {
    return undefined;
  }

  return {
    [DustUserEmailHeader]: email,
  };
}
