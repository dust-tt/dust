import { createConversation } from "@app/lib/api/assistant/conversation";
import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { ensureConversationSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFileSystemMutationModel } from "@app/lib/resources/storage/models/sandbox_file_system_mutation";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { frameContentType } from "@app/types/files";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    userEmail: {
      type: "string",
      demandOption: true,
      description: "User creating the test conversation and frame",
    },
    keep: {
      type: "boolean",
      default: false,
      description: "Keep the conversation and sandbox after the test",
    },
  },
  async ({ wId, userEmail, keep, execute }, logger) => {
    if (!execute) {
      logger.info("Dry run — pass --execute to create the real E2B sandbox.");
      return;
    }

    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      throw new Error(`User not found: ${userEmail}`);
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
    const workspace = auth.getNonNullableWorkspace();
    let conversation: ConversationResource | null = null;

    try {
      conversation = await createConversation(auth, {
        title: "Sandbox filesystem mutation E2E",
        visibility: "unlisted",
        spaceId: null,
      });
      const frame = await FileResource.makeNew({
        workspaceId: workspace.id,
        userId: user.id,
        contentType: frameContentType,
        fileName: "PipelineDashboard.tsx",
        fileSize: 0,
        useCase: "tool_output",
        useCaseMetadata: { conversationId: conversation.sId },
      });
      await frame.uploadContent(
        auth,
        "export default function Frame() { return <div>version one</div>; }"
      );
      if (!frame.mountFilePath) {
        throw new Error("Frame did not receive a conversation mount path.");
      }
      const originalPath = frame.getCloudStoragePath(auth, "original");
      const originalBucket = frame.getBucketForVersion("original");
      const mountPath = frame.mountFilePath;

      const readyResult = await ensureConversationSandboxReady(
        auth,
        conversation.toJSON()
      );
      if (readyResult.isErr()) {
        throw readyResult.error;
      }
      const { sandbox, freshlyCreated } = readyResult.value;
      const mountRoot = `/files/conversation-${conversation.sId}`;
      const framePath = `${mountRoot}/PipelineDashboard.tsx`;

      const run = async (
        command: string,
        options?: { stdin?: string }
      ): Promise<string> => {
        const result = await sandbox.exec(auth, command, {
          timeoutMs: 60_000,
          stdin: options?.stdin,
          // The E2E payloads are public test fixtures. Inline delivery avoids
          // making the filesystem assertion depend on E2B's streamed-stdin
          // control channel.
          allowStdinInEnvironment: options?.stdin !== undefined,
        });
        if (result.isErr()) {
          throw result.error;
        }
        if (result.value.exitCode !== 0) {
          throw new Error(
            `Sandbox command failed (${result.value.exitCode}): ${result.value.stderr}`
          );
        }
        return result.value.stdout.trim();
      };

      const mountInfo = await run(
        `findmnt -T ${framePath} -n -o FSTYPE,SOURCE,TARGET && test -f ${framePath}`
      );
      logger.info(
        {
          conversationId: conversation.sId,
          sandboxId: sandbox.sId,
          e2bSandboxId: sandbox.providerId,
          freshlyCreated,
          mountInfo,
          frameId: frame.sId,
          mountPath,
        },
        "Conversation sandbox and linked frame are mounted"
      );

      await run(`tee ${framePath}.tmp >/dev/null`, {
        stdin:
          "export default function Frame() { return <div>version two</div>; }\n",
      });
      await run(`mv -f ${framePath}.tmp ${framePath}`);
      const afterAtomicSave = await FileResource.fetchById(auth, frame.sId);
      if (!afterAtomicSave || afterAtomicSave.version !== frame.version + 1) {
        throw new Error("Atomic save did not preserve and advance the frame.");
      }

      await run(`mkdir ${mountRoot}/archive`);
      await run(`mv ${framePath} ${mountRoot}/archive/RenamedDashboard.tsx`);
      const afterMove = await FileResource.fetchById(auth, frame.sId);
      const expectedMovedPath = `w/${workspace.sId}/conversations/${conversation.sId}/files/archive/RenamedDashboard.tsx`;
      if (afterMove?.mountFilePath !== expectedMovedPath) {
        throw new Error(
          `Frame move was not reconciled: ${afterMove?.mountFilePath}`
        );
      }

      await run(`mkdir ${mountRoot}/scratch`);
      await run(`tee ${mountRoot}/scratch/plain.txt >/dev/null`, {
        stdin: "plain sandbox file\n",
      });
      await run(
        `mv ${mountRoot}/scratch/plain.txt ${mountRoot}/scratch/moved.txt`
      );
      await run(`rm ${mountRoot}/scratch/moved.txt`);
      await run(`rmdir ${mountRoot}/scratch`);

      await run(`rm ${mountRoot}/archive/RenamedDashboard.tsx`);
      await run(`rmdir ${mountRoot}/archive`);
      await run(`test ! -e ${mountRoot}/archive/RenamedDashboard.tsx`);

      const deletedFrame = await FileResource.fetchById(auth, frame.sId);
      const [[originalExists], [mountExists]] = await Promise.all([
        originalBucket.file(originalPath).exists(),
        originalBucket.file(mountPath).exists(),
      ]);
      if (deletedFrame || originalExists || mountExists) {
        throw new Error(
          `Frame cleanup incomplete: resource=${Boolean(deletedFrame)} original=${originalExists} mount=${mountExists}`
        );
      }

      const mutations = await SandboxFileSystemMutationModel.findAll({
        where: { workspaceId: workspace.id, sandboxId: sandbox.id },
        order: [["id", "ASC"]],
      });
      if (
        mutations.length === 0 ||
        mutations.some((mutation) => mutation.status !== "completed")
      ) {
        throw new Error("Sandbox mutations were not durably completed.");
      }
      const operations = mutations.map(
        (mutation) => mutation.request.operation
      );
      for (const expected of [
        "content_committed",
        "rename",
        "mkdir",
        "unlink",
        "rmdir",
      ]) {
        if (!operations.includes(expected)) {
          throw new Error(`Missing persisted ${expected} mutation.`);
        }
      }

      logger.info(
        {
          conversationId: conversation.sId,
          sandboxId: sandbox.sId,
          e2bSandboxId: sandbox.providerId,
          frameId: frame.sId,
          frameVersionAfterAtomicSave: afterAtomicSave.version,
          mutationCount: mutations.length,
          operations,
        },
        "Sandbox filesystem mutation E2E passed"
      );
    } finally {
      if (conversation && !keep) {
        const destroyResult = await destroyConversation(auth, { conversation });
        if (destroyResult.isErr()) {
          logger.error(
            { err: destroyResult.error, conversationId: conversation.sId },
            "E2E cleanup failed"
          );
        } else {
          logger.info(
            { conversationId: conversation.sId },
            "E2E conversation and sandbox cleaned up"
          );
        }
      }
    }
  }
);
