import { z } from "zod";

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

const workspaceUserIdentityEnvelopeSchema = z.object({
  workspaceId: z.string(),
  user: z.object({
    sId: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    fullName: z.string(),
    image: z.string().nullable(),
  }),
});

export class PodUserIdentityError extends Error {
  override readonly name = "PodUserIdentityError";
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawIdentity);
  } catch {
    throw new PodUserIdentityError("The Pod user identity is invalid.");
  }
  const parsedIdentity =
    workspaceUserIdentityEnvelopeSchema.safeParse(parsedJson);
  if (!parsedIdentity.success) {
    throw new PodUserIdentityError("The Pod user identity is invalid.");
  }
  const value: WorkspaceUserIdentityEnvelope = parsedIdentity.data;

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
