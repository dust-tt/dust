import { DustFileSystem } from "@app/lib/api/file_system";
import { publishFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { checkFrameShareScopePermission } from "@app/lib/api/share/frame_sharing";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameV2ContentType } from "@app/types/files";
import * as fs from "fs";
import * as path from "path";

import type { FrameAsset, SeedContext } from "./types";

export function getFrameManifestPath(frame: FrameAsset): string {
  return `conversation-${frame.conversationId}/${frame.name}/${FRAME_MANIFEST_FILE}`;
}

function listSourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name))
    );
}

async function seedFrame(ctx: SeedContext, frame: FrameAsset): Promise<void> {
  const { auth, logger } = ctx;
  const conversation = await ConversationResource.fetchById(
    auth,
    frame.conversationId
  );
  if (!conversation) {
    throw new Error(`Conversation ${frame.conversationId} not found`);
  }

  const fsResult = await DustFileSystem.forConversation(
    auth,
    conversation.toJSON()
  );
  if (fsResult.isErr()) {
    throw fsResult.error;
  }
  const dustFs = fsResult.value;

  const manifestPath = getFrameManifestPath(frame);
  const frameRoot = path.posix.dirname(manifestPath);
  // TypeScript sources end in .txt so front's typecheck and lint skip them.
  for (const sourcePath of listSourceFiles(frame.sourceDir)) {
    const content = fs.readFileSync(
      path.join(frame.sourceDir, sourcePath),
      "utf-8"
    );
    const written = await dustFs.write(
      `${frameRoot}/${sourcePath.replace(/\.txt$/, "")}`,
      content,
      sourcePath === FRAME_MANIFEST_FILE
        ? frameV2ContentType
        : "text/typescript"
    );
    if (written.isErr()) {
      throw written.error;
    }
  }

  const published = await publishFrameFromSource(auth, {
    conversation: conversation.toJSON(),
    publishedByAgentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    sourcePath: manifestPath,
    mode: "live",
  });
  if (published.isErr()) {
    throw published.error;
  }
  logger.info(
    { frame: frame.name, frameId: published.value.frameId, manifestPath },
    "Frame published"
  );

  if (frame.shareScope) {
    const file = await FileResource.fetchById(auth, published.value.frameId);
    if (!file) {
      throw new Error(`Frame ${published.value.frameId} not found`);
    }
    const permission = await checkFrameShareScopePermission(
      auth,
      frame.shareScope,
      file
    );
    if (permission.isErr()) {
      throw permission.error;
    }
    await file.setShareScope(auth, frame.shareScope);
    const shareInfo = await file.getShareInfo();
    logger.info(
      {
        frame: frame.name,
        shareScope: frame.shareScope,
        shareUrl: shareInfo?.shareUrl,
      },
      "Frame shared"
    );
  }
}

export async function seedFrames(
  ctx: SeedContext,
  frameAssets: FrameAsset[]
): Promise<void> {
  for (const frame of frameAssets) {
    if (!ctx.execute) {
      ctx.logger.info({ frame: frame.name }, "[DRYRUN]: Would publish Frame");
      continue;
    }
    await seedFrame(ctx, frame);
  }
}
