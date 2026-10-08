import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameTrustResource } from "@app/lib/resources/frame_trust_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";

/**
 * Whether the authenticated user lets the code of one Frame publication make tool calls on
 * their behalf.
 * - `trusted`: the user published that code, or trusts its publisher in this Frame.
 * - `untrusted`: the user can trust `publisher` to unblock it.
 * - `untrustable`: the publication has no known publisher, so nobody can trust it.
 */
export type FramePublicationTrust =
  | { status: "trusted" }
  | { status: "untrusted"; publisher: UserResource }
  | { status: "untrustable" };

async function getPublisher(
  auth: Authenticator,
  { frame, publicationId }: { frame: FileResource; publicationId: string }
): Promise<UserResource | null> {
  const publication =
    await FramePublicationResource.fetchByFrameAndPublicationId(auth, {
      frame,
      publicationId,
    });
  if (!publication?.publishedByUserId) {
    return null;
  }

  const [publisher] = await UserResource.fetchByModelIds([
    publication.publishedByUserId,
  ]);

  return publisher ?? null;
}

/**
 * @cc [owner:davidebbo,label:security] publication-trust-decision
 * The result MUST be `trusted` only when the authenticated user published the publication, or
 * holds a `FrameTrustResource` row for this Frame and the publication's publisher. A publication
 * with no publisher MUST be `untrustable`.
 */
export async function getFramePublicationTrust(
  auth: Authenticator,
  { frame, publicationId }: { frame: FileResource; publicationId: string }
): Promise<FramePublicationTrust> {
  const publisher = await getPublisher(auth, { frame, publicationId });
  if (!publisher) {
    return { status: "untrustable" };
  }
  if (publisher.id === auth.getNonNullableUser().id) {
    return { status: "trusted" };
  }

  const isTrusted = await FrameTrustResource.isTrusted(auth, {
    frame,
    publisherUserModelId: publisher.id,
  });

  return isTrusted ? { status: "trusted" } : { status: "untrusted", publisher };
}

/**
 * Only non-`fast` functions get a sandbox token that may call tools, so only they need trust.
 */
export function canFunctionCallTools(
  executionMode: SandboxFunctionExecutionMode
): boolean {
  return executionMode !== "fast";
}
