import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileResource as FileResourceClass } from "@app/lib/resources/file_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { PodFrameReferenceType } from "@app/types/api/sandbox_functions";

const FRAME_READ_CONCURRENCY = 4;

/**
 * A frame names a pod function by one of the two references `validateFramePodFunctionReferences`
 * puts in its `PodFunctionMap`: the function's sId, or `<podSId>/<slug>`. `callFunction` types its
 * first argument as `keyof PodFunctionMap`, so a call site is always a string literal — a computed
 * reference does not typecheck at frame publish. That is what makes this reverse lookup possible.
 */
function frameReferencesFor(
  space: SpaceResource,
  sandboxFunction: SandboxFunctionResource
): string[] {
  return [sandboxFunction.sId, `${space.sId}/${sandboxFunction.slug}`];
}

// Matches the reference as a whole string literal, so `send-digest` does not match a call to
// `resend-digest`. The bundle is built with `minify: false`, so literals survive verbatim.
function codeReferences(code: string, reference: string): boolean {
  return (
    code.includes(`"${reference}"`) ||
    code.includes(`'${reference}'`) ||
    code.includes(`\`${reference}\``)
  );
}

/**
 * Every frame that belongs to the pod, in the sense the product means it.
 *
 * Two shapes, both real: a frame saved as a pod file carries `useCaseMetadata.spaceId`, while a
 * frame produced in a pod conversation carries `useCaseMetadata.conversationId` and reaches the
 * pod only through that conversation's `spaceId`. The second is the common one — a frame built by
 * an agent in a pod conversation — so a scan that only looked at pod files would report no usage
 * for most real pods.
 *
 * Drafts count. A frame without `frameBundleRootPath` has never been published, but
 * `getRenderableVersion` falls back to its original source, so it renders and can call functions
 * all the same. Only its *next publish* is validated, which is precisely why it needs to show up
 * here.
 */
async function listPodFrames(
  auth: Authenticator,
  space: SpaceResource
): Promise<FileResource[]> {
  const podFileFrames = (
    await FileResourceClass.listByProject(auth, { projectId: space.sId })
  ).filter((file) => file.isInteractiveContent);

  const conversationFrames = await FileResourceClass.listFramesByConversations(
    auth,
    { conversationIds: await listPodConversationIds(auth, space) }
  );

  return [...podFileFrames, ...conversationFrames];
}

async function listPodConversationIds(
  auth: Authenticator,
  space: SpaceResource
): Promise<string[]> {
  const conversations = await ConversationModel.findAll({
    attributes: ["sId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: space.id,
    },
  });

  return conversations.map(({ sId }) => sId);
}

/**
 * Reads whatever the frame actually renders: its built bundle once published, its original source
 * before that. `minify: false` on the bundler and the literal-only call convention mean the
 * reference survives verbatim in either one.
 */
async function readFrameCode(
  auth: Authenticator,
  frame: FileResource
): Promise<string | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of frame.getReadStream({
      auth,
      version: frame.getRenderableVersion(),
    })) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString("utf-8");
  } catch (err) {
    // One unreadable bundle must not fail the whole scan: the rest of the answer is still worth
    // showing, and the caller presents this as usage found, not as an exhaustive proof.
    logger.error(
      { err, fileId: frame.sId },
      "Failed to read a frame while scanning for pod function usage"
    );

    return null;
  }
}

/**
 * Which of the pod's frames call each of the given functions, keyed by function sId. Two listing
 * queries plus one read per frame, so the cost tracks the pod's frame count, not its function
 * count.
 */
export async function listPodFrameFunctionUsage(
  auth: Authenticator,
  {
    space,
    sandboxFunctions,
  }: {
    space: SpaceResource;
    sandboxFunctions: SandboxFunctionResource[];
  }
): Promise<Map<string, PodFrameReferenceType[]>> {
  const usage = new Map<string, PodFrameReferenceType[]>(
    sandboxFunctions.map((sandboxFunction) => [sandboxFunction.sId, []])
  );
  if (sandboxFunctions.length === 0) {
    return usage;
  }

  const frames = await listPodFrames(auth, space);
  if (frames.length === 0) {
    return usage;
  }

  const frameCodes = await concurrentExecutor(
    frames,
    async (frame) => ({ frame, code: await readFrameCode(auth, frame) }),
    { concurrency: FRAME_READ_CONCURRENCY }
  );

  for (const { frame, code } of frameCodes) {
    if (code === null) {
      continue;
    }

    for (const sandboxFunction of sandboxFunctions) {
      const isReferenced = frameReferencesFor(space, sandboxFunction).some(
        (reference) => codeReferences(code, reference)
      );
      if (isReferenced) {
        usage.get(sandboxFunction.sId)?.push({
          fileId: frame.sId,
          fileName: frame.fileName,
        });
      }
    }
  }

  return usage;
}
