import {
  withFramePublishLock,
  withFrameSourceLock,
} from "@app/lib/api/frames/operation_lock";
import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import {
  activateFramePublication,
  checkStoredFramePublicationPublicFunctions,
  loadFramePublicationDescriptor,
} from "@app/lib/api/frames/publication_storage";
import {
  checkFrameFunctionSharing,
  checkFrameFunctionsFeature,
} from "@app/lib/api/frames/publish_from_source";
import type { Authenticator } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FrameMakeLiveError extends Error {
  constructor(
    readonly code: "unauthorized" | "frame_not_found" | "draft_conflict",
    message: string
  ) {
    super(message);
    this.name = "FrameMakeLiveError";
  }
}

type MakeLiveResult = Result<
  { publicationId: string },
  FrameMakeLiveError | FramePublicationError
>;

/**
 * @cc [owner:davidebbo,label:product;security] make-live-promotes-the-reviewed-draft
 * Make-live MUST only promote the publication the caller names, and only while it is still the
 * Frame's pending draft; it MUST require `canWriteFrameV2Source` on the Frame as read under the
 * Frame's source and publish locks, and MUST fail on the same function feature, function sharing,
 * public function and share allowlist checks a live publish of that draft would, leaving both
 * pointers unchanged. When the named publication is already the live one, it MUST succeed without
 * re-activating it; when it is neither live nor the pending draft (including when there is no
 * pending draft), it MUST fail with `draft_conflict`.
 */
export async function makeFrameDraftLive(
  auth: Authenticator,
  {
    frame,
    draftPublicationId,
    publishedByAgentConfigurationId,
  }: {
    frame: FileResource;
    draftPublicationId: string;
    publishedByAgentConfigurationId?: string;
  }
): Promise<MakeLiveResult> {
  if (!(await canWriteFrameV2Source(auth, frame))) {
    return new Err(
      new FrameMakeLiveError("unauthorized", "You cannot edit this Frame.")
    );
  }

  // Source lock first, then publish lock: the order publish takes them in, so make-live never
  // interleaves with a publish or a panel Save writing the same pointers.
  const result = await withFrameSourceLock(frame.sId, () =>
    withFramePublishLock(frame.sId, async (): Promise<MakeLiveResult> => {
      const fresh = await frame.fetchFreshFrameV2(auth);
      if (!fresh) {
        return new Err(
          new FrameMakeLiveError("frame_not_found", "Frame not found.")
        );
      }
      // The early check ran on the caller's copy; the Frame may have moved since.
      if (!(await canWriteFrameV2Source(auth, fresh))) {
        return new Err(
          new FrameMakeLiveError("unauthorized", "You cannot edit this Frame.")
        );
      }
      // The same request sent twice: the first one already made this draft live.
      if (fresh.useCaseMetadata?.activePublicationId === draftPublicationId) {
        return new Ok({ publicationId: draftPublicationId });
      }
      if (fresh.pendingDraftPublicationId !== draftPublicationId) {
        return new Err(
          new FrameMakeLiveError(
            "draft_conflict",
            "This Frame's pending changes changed; refresh and try again."
          )
        );
      }

      const descriptor = await loadFramePublicationDescriptor(auth, {
        frame: fresh,
        publicationId: draftPublicationId,
      });
      if (descriptor.isErr()) {
        return descriptor;
      }
      const feature = await checkFrameFunctionsFeature(
        auth,
        descriptor.value.manifest
      );
      if (feature.isErr()) {
        return feature;
      }
      const sharing = await checkFrameFunctionSharing(auth, {
        frame: fresh,
        manifest: descriptor.value.manifest,
      });
      if (sharing.isErr()) {
        return sharing;
      }
      const publicFunctions = await checkStoredFramePublicationPublicFunctions(
        auth,
        {
          frame: fresh,
          publicationId: draftPublicationId,
          descriptor: descriptor.value,
        }
      );
      if (publicFunctions.isErr()) {
        return publicFunctions;
      }

      const activation = await activateFramePublication(auth, {
        frame: fresh,
        publicationId: draftPublicationId,
        publishedByAgentConfigurationId,
        descriptor: descriptor.value,
      });
      if (activation.isErr()) {
        return activation;
      }
      return new Ok({ publicationId: draftPublicationId });
    })
  );
  if (result.isErr()) {
    return new Err(
      isLockAcquisitionTimeoutError(result.error)
        ? new FrameMakeLiveError(
            "draft_conflict",
            "This Frame is being published; retry shortly."
          )
        : result.error
    );
  }
  return new Ok(result.value);
}
