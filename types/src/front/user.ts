import * as t from "io-ts";

import {
  EmbeddingProviderIdType,
  ModelProviderIdType,
} from "../front/lib/assistant";
import { ModelId } from "../shared/model_id";
import { assertNever } from "../shared/utils/assert_never";

export type WorkspaceSegmentationType = "interesting" | null;

export const ROLES = ["admin", "builder", "user", "none"] as const;
export const ACTIVE_ROLES = ["admin", "builder", "user"] as const;

function keyObject<T extends readonly string[]>(
  arr: T
): { [K in T[number]]: null } {
  return Object.fromEntries(arr.map((v) => [v, null])) as {
    [K in T[number]]: null;
  };
}

export const RoleSchema = t.keyof(keyObject(ROLES));

export type RoleType = t.TypeOf<typeof RoleSchema>;

export const ActiveRoleSchema = t.keyof(keyObject(ACTIVE_ROLES));

export type ActiveRoleType = t.TypeOf<typeof ActiveRoleSchema>;

export function isActiveRoleType(role: string): role is ActiveRoleType {
  return ACTIVE_ROLES.includes(role as ActiveRoleType);
}

export type LightWorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  role: RoleType;
  segmentation: WorkspaceSegmentationType;
  whiteListedProviders: ModelProviderIdType[] | null;
  defaultEmbeddingProvider: EmbeddingProviderIdType | null;
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
};

export type UserTypeWithWorkspaces = UserType & {
  workspaces: WorkspaceType[];
};

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
};

export type UserMetadataType = {
  key: string;
  value: string;
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
