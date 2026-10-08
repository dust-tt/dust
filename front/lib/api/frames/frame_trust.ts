import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { FramePublicationTrust } from "@app/lib/api/frames/publication_trust";
import {
  canFunctionCallTools,
  getFramePublicationTrust,
} from "@app/lib/api/frames/publication_trust";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameTrustResource } from "@app/lib/resources/frame_trust_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { getFrameV2NameFromManifestPath } from "@app/types/api/frame_manifest";
import type { FrameTrustState } from "@app/types/api/frame_trust";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * The trust the authenticated user must give before the Frame's active publication can make tool
 * calls on their behalf, or null when it can't make any (no active publication, or only `fast`
 * functions).
 */
export async function getFrameToolTrust(
  auth: Authenticator,
  frame: FileResource
): Promise<FramePublicationTrust | null> {
  const publicationId = frame.useCaseMetadata?.activePublicationId;
  if (!publicationId) {
    return null;
  }

  const functions = await SandboxFunctionResource.listByFramePublication(auth, {
    frame,
    publicationId,
  });
  if (!functions.some((fn) => canFunctionCallTools(fn.executionMode))) {
    return null;
  }

  return getFramePublicationTrust(auth, { frame, publicationId });
}

export type GrantFrameTrustError = "nothing_to_trust" | "publisher_changed";

/**
 * Records that the authenticated user trusts the publisher of the Frame's active publication.
 * `expectedPublisherId` is the publisher the user was shown: a publish by someone else since
 * then makes the grant fail rather than trust a person the user never saw.
 */
export async function grantFrameTrust(
  auth: Authenticator,
  {
    frame,
    expectedPublisherId,
  }: { frame: FileResource; expectedPublisherId: string }
): Promise<Result<undefined, GrantFrameTrustError>> {
  const trust = await getFrameToolTrust(auth, frame);
  if (!trust || trust.status === "untrustable") {
    return new Err("nothing_to_trust");
  }
  if (trust.status === "trusted") {
    return new Ok(undefined);
  }
  if (trust.publisher.sId !== expectedPublisherId) {
    return new Err("publisher_changed");
  }

  await FrameTrustResource.grant(auth, {
    frame,
    publisherUserModelId: trust.publisher.id,
  });

  void emitAuditLogEvent({
    auth,
    action: "frame.trust_granted",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: frame.sId,
        name:
          (frame.mountFilePath
            ? getFrameV2NameFromManifestPath(frame.mountFilePath)
            : null) ?? frame.sId,
      }),
      buildAuditLogTarget("user", {
        sId: trust.publisher.sId,
        name: trust.publisher.fullName(),
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      frame_id: frame.sId,
      publisher_id: trust.publisher.sId,
      publisher_email: trust.publisher.email,
    },
  });

  return new Ok(undefined);
}

export async function getFrameTrustState(
  auth: Authenticator,
  frame: FileResource
): Promise<FrameTrustState> {
  const trust = await getFrameToolTrust(auth, frame);
  if (!trust) {
    return { status: "not_required" };
  }

  switch (trust.status) {
    case "trusted":
    case "untrustable":
      return { status: trust.status };
    case "untrusted": {
      const { sId, fullName, image } = trust.publisher.toJSON();
      return { status: "untrusted", publisher: { sId, fullName, image } };
    }
    default:
      return assertNever(trust);
  }
}
