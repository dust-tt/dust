import * as t from "io-ts";
import { z } from "zod";
import type {
  EmbeddingProviderIdType,
  ModelProviderIdType,
} from "./assistant/models/types";
import type { MembershipOriginType, MembershipSeatType } from "./memberships";
import type { ModelId } from "./shared/model_id";
import { DbModelIdSchema } from "./shared/model_id";
import { assertNever } from "./shared/utils/assert_never";
import { decodeUtf8HeaderValue } from "./shared/utils/http_headers";

export type WorkspaceSegmentationType = "interesting" | null;

const ROLES = ["admin", "manager", "builder", "user", "none"] as const;
export const ACTIVE_ROLES = ["admin", "manager", "builder", "user"] as const;
export const ASSIGNABLE_ROLES = ["admin", "manager", "user"] as const;
export const ANONYMOUS_USER_IMAGE_URL = "/static/humanavatar/anonymous.png";

export const MANAGER_ROLE_NAME = "manager";

function keyObject<T extends readonly string[]>(
  arr: T
): { [K in T[number]]: null } {
  return Object.fromEntries(arr.map((v) => [v, null])) as {
    [K in T[number]]: null;
  };
}

type WorkOSOrganizationType = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  externalId: string | null;
  metadata: Record<string, string>;
};

export const RoleSchema = t.keyof(keyObject(ROLES));

export type RoleType = t.TypeOf<typeof RoleSchema>;

export function isRoleType(role: string): role is RoleType {
  return ROLES.includes(role as RoleType);
}

export const ActiveRoleSchema = z.enum(ACTIVE_ROLES);

export type ActiveRoleType = z.infer<typeof ActiveRoleSchema>;

export function isActiveRoleType(role: string): role is ActiveRoleType {
  return ACTIVE_ROLES.includes(role as ActiveRoleType);
}

export type AssignableRoleType = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRoleType(role: string): role is AssignableRoleType {
  return ASSIGNABLE_ROLES.includes(role as AssignableRoleType);
}

// Roles that can be assigned through the API (invitations, membership role updates). The
// deprecated `builder` role is rejected here while remaining a valid role value elsewhere
// (existing memberships, role display, and legacy/pending invitations).
function isAssignableRole(role: RoleType): boolean {
  return role !== "builder" && role !== "none";
}

export const AssignableRoleSchema = ActiveRoleSchema.refine(isAssignableRole, {
  message: "The 'builder' role can no longer be assigned.",
});

// Maps a possibly-legacy role to one that can still be assigned: `builder` resolves to a regular
// `user`. Use this when re-submitting a role read from an existing invitation or membership (e.g.
// resending a pending `builder` invitation), which the API would otherwise reject.
export function toAssignableRole(role: ActiveRoleType): AssignableRoleType {
  return role === "builder" ? "user" : role;
}

export type WorkspaceSharingPolicy =
  | "workspace_only"
  | "workspace_and_emails"
  | "all_scopes";

/**
 * @swaggerschema Workspace (swagger_schemas.ts), PrivateWorkspace (swagger_private_schemas.ts)
 */
export type LightWorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  role: RoleType;
  segmentation: WorkspaceSegmentationType;
  whiteListedProviders: ModelProviderIdType[] | null;
  defaultEmbeddingProvider: EmbeddingProviderIdType | null;
  regionalModelsOnly: boolean;
  metadata?: {
    [key: string]: string | number | boolean | object | undefined;
  } | null;
  sharingPolicy: WorkspaceSharingPolicy;
  metronomeCustomerId: string | null;
  workOSOrganizationId?: string | null;
  groups?: string[];
};

export function getWorkspaceDefaultAgentId(
  owner: LightWorkspaceType
): string | null {
  const value = owner.metadata?.workspaceDefaultAgentId;
  return typeof value === "string" ? value : null;
}

// The Workspace Analyst agent (and the workspace_analytics skill + MCP server it
// relies on) are available to all workspaces by default. Admins can opt out via
// the workspace settings, which sets `disableWorkspaceAnalytics` to true.
export function isWorkspaceAnalyticsEnabled(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.disableWorkspaceAnalytics !== true;
}

// Conversation unread email and Slack are on by default. Admins can turn them
// off workspace-wide; in-app Dust notifications are not affected.
export function areConversationExternalNotificationsEnabled(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.allowConversationExternalNotifications !== false;
}

// Automatic archival of agents nobody mentions is opt-in per workspace: with no threshold set,
// nothing is ever archived. There is no default number of days.
export function getInactiveAgentArchivalThresholdDays(
  owner: LightWorkspaceType
): number | null {
  const value = owner.metadata?.inactiveAgentArchivalThresholdDays;
  return typeof value === "number" ? value : null;
}

// When enabled, members can run published agents even if the agent's model
// requires a tier above their own access. Disabled by default: such runs are
// blocked. Admins can opt in via the workspace settings.
export function areRestrictedModelsAllowedForPublishedAgents(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.allowRestrictedModelsForPublishedAgents === true;
}

/**
 * The default agent that should be pre-selected for new conversations.
 * A pod-level default agent takes precedence over the workspace-level default agent.
 *
 * Returns the resolved agent sId, or `null` when no default applies (callers then
 * fall back to @dust). ).
 */
export function resolveDefaultAgentId({
  owner,
  podDefaultAgentId,
  hasWorkspaceDefaultAgentFeature,
}: {
  owner: LightWorkspaceType;
  podDefaultAgentId: string | null | undefined;
  hasWorkspaceDefaultAgentFeature: boolean;
}): string | null {
  const workspaceDefaultAgentId = hasWorkspaceDefaultAgentFeature
    ? getWorkspaceDefaultAgentId(owner)
    : null;
  return podDefaultAgentId ?? workspaceDefaultAgentId;
}

export type WorkspaceType = LightWorkspaceType & {
  ssoEnforced?: boolean;
};

/** @deprecated Use WorkspaceType + separate extension config endpoint instead. */
export type ExtensionWorkspaceType = WorkspaceType & {
  blacklistedDomains: string[] | null;
};

export const UserProviderSchema = z
  .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
  .nullable();

export type UserProviderType = z.infer<typeof UserProviderSchema>;

export const UserSchema = z.object({
  sId: z.string(),
  id: DbModelIdSchema,
  createdAt: z.number(),
  provider: UserProviderSchema,
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  image: z.string().nullable(),
  lastLoginAt: z.number().nullable(),
});

/**
 * @swaggerschema User (swagger_schemas.ts)
 */
export type UserType = z.infer<typeof UserSchema>;

export type UserTypeWithWorkspace = UserType & {
  workspace: WorkspaceType;
  origin?: MembershipOriginType;
};

/**
 * Minimal essential user representation returned by user-listing endpoints for
 * non-admin callers. Admin callers receive the full `UserType` or
 * `UserTypeWithWorkspace`.
 */
export type LightUserType = Pick<
  UserType,
  "sId" | "firstName" | "lastName" | "fullName" | "image" | "email"
>;

export type LightUserTypeWithWorkspace = LightUserType & {
  workspace: WorkspaceType;
};

export function toLightUser(user: UserType): LightUserType {
  return {
    sId: user.sId,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    image: user.image,
    email: user.email,
  };
}

export function toLightUserWithWorkspace(
  user: UserTypeWithWorkspace
): LightUserTypeWithWorkspace {
  return {
    ...toLightUser(user),
    workspace: user.workspace,
  };
}

/**
 * @swaggerschema PrivateUser (swagger_private_schemas.ts)
 */
export type UserTypeWithWorkspaces = UserType & {
  workspaces: WorkspaceType[];
  organizations?: WorkOSOrganizationType[];
  origin?: MembershipOriginType;
  seatType?: MembershipSeatType;
  selectedWorkspace?: string;
};

/** @deprecated Use UserTypeWithWorkspaces + separate extension config endpoint instead. */
export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
  organizations: WorkOSOrganizationType[];
  selectedWorkspace?: string;
};

export type SpaceUserType = UserType & {
  isEditor?: boolean;
  joinedAt?: string;
};

export type UserMetadataType = {
  key: string;
  value: string;
};

export const EditedByUserSchema = z.object({
  editedAt: z.number().nullable(),
  fullName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  email: z.string().nullable(),
  userId: z.string().nullable(),
});
export type EditedByUser = z.infer<typeof EditedByUserSchema>;

export function formatUserFullName(user: {
  firstName?: string;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
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
    case "manager":
    case "builder":
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}

export function isManager(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "manager" | "admin" } {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "manager":
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
): owner is WorkspaceType & { role: "builder" | "manager" | "admin" } {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "manager":
    case "builder":
      return true;
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}

export function isUser(owner: WorkspaceType | null): owner is WorkspaceType & {
  role: "user" | "builder" | "manager" | "admin";
} {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "manager":
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

export function isOnlyAdmin(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "admin" } {
  if (!owner) {
    return false;
  }
  return owner.role === "admin";
}

export function isOnlyManager(
  owner: WorkspaceType | null
): owner is WorkspaceType & { role: "manager" } {
  if (!owner) {
    return false;
  }
  return owner.role === "manager";
}

const DustUserEmailHeader = "x-api-user-email";

export function getUserEmailFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}) {
  const email = headers[DustUserEmailHeader];
  if (typeof email === "string") {
    return decodeUtf8HeaderValue(email);
  }

  return undefined;
}

export function getHeaderFromUserEmail(email: string | undefined) {
  if (!email) {
    return undefined;
  }

  // The email may exceed Latin-1 (internationalized addresses); DustAPI
  // encodes extra header values on the wire (see @dust-tt/client baseHeaders).
  return {
    [DustUserEmailHeader]: email,
  };
}
