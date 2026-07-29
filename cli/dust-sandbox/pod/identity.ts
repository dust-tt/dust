export const POD_USER_IDENTITY_ENV = "DUST_POD_USER_IDENTITY";
export const POD_WORKSPACE_ID_ENV = "WORKSPACE_ID";

export interface WorkspaceUserIdentity {
  readonly sId: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly fullName: string;
  readonly image: string | null;
}

interface WorkspaceUserIdentityEnvelope {
  workspaceId: string;
  user: WorkspaceUserIdentity;
}

export class PodUserIdentityError extends Error {
  override readonly name = "PodUserIdentityError";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isWorkspaceUserIdentity(
  value: unknown
): value is WorkspaceUserIdentity {
  return (
    typeof value === "object" &&
    value !== null &&
    "sId" in value &&
    typeof value.sId === "string" &&
    "firstName" in value &&
    typeof value.firstName === "string" &&
    "lastName" in value &&
    isNullableString(value.lastName) &&
    "fullName" in value &&
    typeof value.fullName === "string" &&
    "image" in value &&
    isNullableString(value.image)
  );
}

function isWorkspaceUserIdentityEnvelope(
  value: unknown
): value is WorkspaceUserIdentityEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "workspaceId" in value &&
    typeof value.workspaceId === "string" &&
    "user" in value &&
    isWorkspaceUserIdentity(value.user)
  );
}

/**
 * Return the user attributed to this function invocation.
 *
 * The identity is always scoped to the workspace owning the current Pod.
 * Userless invocations return null.
 */
export function currentUser(): WorkspaceUserIdentity | null {
  const rawIdentity = process.env[POD_USER_IDENTITY_ENV];
  if (!rawIdentity) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(rawIdentity);
  } catch {
    throw new PodUserIdentityError("The Pod user identity is invalid.");
  }

  if (!isWorkspaceUserIdentityEnvelope(value)) {
    throw new PodUserIdentityError("The Pod user identity is invalid.");
  }

  const workspaceId = process.env[POD_WORKSPACE_ID_ENV];
  if (!workspaceId || value.workspaceId !== workspaceId) {
    throw new PodUserIdentityError(
      "The Pod user identity does not match the current workspace."
    );
  }

  return Object.freeze({
    sId: value.user.sId,
    firstName: value.user.firstName,
    lastName: value.user.lastName,
    fullName: value.user.fullName,
    image: value.user.image,
  });
}
