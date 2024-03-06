import { ModelId } from "../shared/model_id";
import { assertNever } from "../shared/utils/assert_never";
import { WhitelistableFeature } from "./feature_flags";

export type WorkspaceSegmentationType = "interesting" | null;
export type RoleType = "admin" | "builder" | "user" | "none";

export type LightWorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  role: RoleType;
  segmentation: WorkspaceSegmentationType;
};

export type WorkspaceType = LightWorkspaceType & {
  flags: WhitelistableFeature[];
};

export type UserProviderType = "github" | "google" | null;

export type UserType = {
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
  workspaces: LightWorkspaceType[];
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
