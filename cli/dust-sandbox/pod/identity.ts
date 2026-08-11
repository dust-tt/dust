import { z } from "zod";

import { podEnv } from "./context.ts";

export const POD_USER_IDENTITY_ENV = "DUST_POD_USER_IDENTITY";
export const POD_WORKSPACE_ID_ENV = "WORKSPACE_ID";

export interface WorkspaceUserIdentity {
  readonly sId: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly fullName: string;
  readonly image: string | null;
  // Whether the caller is an editor of the Pod this function belongs to (workspace admins
  // included). Gate refresh-style mutations on it; viewers only read.
  readonly isPodEditor: boolean;
}

const workspaceUserIdentityEnvelopeSchema = z.object({
  workspaceId: z.string(),
  // Optional so envelopes written before the field existed still parse; absent means false,
  // the restrictive reading.
  isPodEditor: z.boolean().optional(),
  user: z.object({
    sId: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    fullName: z.string(),
    image: z.string().nullable(),
  }),
});

type WorkspaceUserIdentityEnvelope = z.infer<
  typeof workspaceUserIdentityEnvelopeSchema
>;

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
  const rawIdentity = podEnv(POD_USER_IDENTITY_ENV);
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

  const workspaceId = podEnv(POD_WORKSPACE_ID_ENV);
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
    isPodEditor: value.isPodEditor ?? false,
  });
}
