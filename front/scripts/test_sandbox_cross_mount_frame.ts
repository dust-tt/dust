import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { DustFileSystem } from "@app/lib/api/file_system";
import { deleteCanonicalFile } from "@app/lib/api/files/file_system_ops";
import { SandboxFileSystemMutationRequestSchema } from "@app/lib/api/sandbox/file_system_mutations";
import { ensureConversationSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxFileSystemMutationModel } from "@app/lib/resources/storage/models/sandbox_file_system_mutation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { frameContentType } from "@app/types/files";

const DESTINATION_FILE_NAME = "CrossMountDashboard.tsx";

makeScript(
  {
    wId: { type: "string", demandOption: true },
    userEmail: { type: "string", demandOption: true },
    podId: { type: "string", demandOption: true },
  },
  async ({ wId, userEmail, podId, execute }, logger) => {
    if (!execute) {
      logger.info("Dry run — pass --execute to create the disposable sandbox.");
      return;
    }

    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      throw new Error(`User not found: ${userEmail}`);
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
    const workspace = auth.getNonNullableWorkspace();
    const pod = await SpaceResource.fetchById(auth, podId);
    if (!pod?.isProject() || !pod.canWrite(auth)) {
      throw new Error(`Writable pod not found: ${podId}`);
    }

    let conversation: ConversationResource | null = null;
    try {
      // Construct the same production resource directly so this filesystem
      // diagnostic does not depend on asynchronous notification workers or
      // their local migration state.
      conversation = await ConversationResource.makeNew(
        auth,
        {
          sId: generateRandomModelSId(),
          title: "Sandbox cross-mount frame E2E",
          visibility: "unlisted",
          depth: 0,
          requestedSpaceIds: [pod.id],
          spaceId: pod.id,
        },
        pod
      );
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
        "export default function Frame() { return <div>cross mount</div>; }"
      );
      if (!frame.mountFilePath) {
        throw new Error("Frame did not receive a conversation mount path.");
      }

      const originalPath = frame.getCloudStoragePath(auth, "original");
      const bucket = frame.getBucketForVersion("original");
      const sourceMountPath = frame.mountFilePath;
      const destinationMountPath = `w/${workspace.sId}/pods/${pod.sId}/files/${DESTINATION_FILE_NAME}`;
      const sourceRoot = `/files/conversation-${conversation.sId}`;
      const destinationRoot = `/files/pod-${pod.sId}`;
      const sourcePath = `${sourceRoot}/PipelineDashboard.tsx`;
      const destinationPath = `${destinationRoot}/${DESTINATION_FILE_NAME}`;

      const readyResult = await ensureConversationSandboxReady(
        auth,
        conversation.toJSON()
      );
      if (readyResult.isErr()) {
        throw readyResult.error;
      }
      const { sandbox } = readyResult.value;
      const run = async (command: string): Promise<string> => {
        const result = await sandbox.exec(auth, command, { timeoutMs: 60_000 });
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
        `findmnt -T ${sourceRoot} -n -o FSTYPE,SOURCE,TARGET; findmnt -T ${destinationRoot} -n -o FSTYPE,SOURCE,TARGET`
      );
      const moveOutput = await run(`mv -v ${sourcePath} ${destinationPath}`);
      const destinationContent = await run(`cat ${destinationPath}`);

      const [frameAfterMove, linkedAtSource, linkedAtDestination] =
        await Promise.all([
          FileResource.fetchById(auth, frame.sId),
          FileResource.fetchByMountFilePaths(auth, [sourceMountPath]),
          FileResource.fetchByMountFilePaths(auth, [destinationMountPath]),
        ]);
      const [[originalExists], [sourceExists], [destinationExists]] =
        await Promise.all([
          bucket.file(originalPath).exists(),
          bucket.file(sourceMountPath).exists(),
          bucket.file(destinationMountPath).exists(),
        ]);
      const mutations = await SandboxFileSystemMutationModel.findAll({
        where: { workspaceId: workspace.id, sandboxId: sandbox.id },
        order: [["id", "ASC"]],
      });
      const persistedMutations = mutations.map((mutation) => ({
        status: mutation.status,
        request: SandboxFileSystemMutationRequestSchema.parse(mutation.request),
      }));
      const renameMutation = persistedMutations.find(
        (mutation) => mutation.request.operation === "rename"
      );
      if (
        !frameAfterMove ||
        frameAfterMove.sId !== frame.sId ||
        frameAfterMove.mountFilePath !== destinationMountPath ||
        frameAfterMove.useCase !== "project_context" ||
        frameAfterMove.useCaseMetadata?.spaceId !== pod.sId
      ) {
        throw new Error("Cross-mount move did not preserve frame identity.");
      }
      if (
        linkedAtSource.length !== 0 ||
        linkedAtDestination.length !== 1 ||
        linkedAtDestination[0].sId !== frame.sId
      ) {
        throw new Error("Cross-mount FileResource lookup is inconsistent.");
      }
      if (!originalExists || sourceExists || !destinationExists) {
        throw new Error(
          `Cross-mount GCS state is inconsistent: original=${originalExists} source=${sourceExists} destination=${destinationExists}`
        );
      }
      if (
        !renameMutation ||
        renameMutation.status !== "completed" ||
        renameMutation.request.operation !== "rename" ||
        renameMutation.request.destinationMount?.kind !== "pod" ||
        renameMutation.request.destinationMount.id !== pod.sId
      ) {
        throw new Error("Cross-mount rename was not durably recorded.");
      }
      if (
        persistedMutations.some(
          (mutation) =>
            mutation.request.operation === "unlink" &&
            mutation.request.mount.kind === "conversation" &&
            mutation.request.path === "PipelineDashboard.tsx"
        )
      ) {
        throw new Error("Cross-mount mv degraded into copy plus unlink.");
      }

      logger.info(
        {
          conversationId: conversation.sId,
          podId: pod.sId,
          sandboxId: sandbox.sId,
          frameId: frame.sId,
          mountInfo,
          moveOutput,
          destinationContent,
          frameAfterMove: frameAfterMove
            ? {
                sId: frameAfterMove.sId,
                mountFilePath: frameAfterMove.mountFilePath,
                version: frameAfterMove.version,
              }
            : null,
          linkedAtSource: linkedAtSource.map((file) => file.sId),
          linkedAtDestination: linkedAtDestination.map((file) => file.sId),
          gcs: { originalExists, sourceExists, destinationExists },
          mutations: persistedMutations.map((mutation) => ({
            status: mutation.status,
            operation: mutation.request.operation,
            mount: mutation.request.mount,
            path: mutation.request.path,
          })),
        },
        "Cross-mount frame move passed"
      );
    } finally {
      const podFsResult = await DustFileSystem.forPod(auth, pod);
      if (podFsResult.isOk()) {
        const cleanupResult = await deleteCanonicalFile(
          auth,
          podFsResult.value,
          `pod-${pod.sId}/${DESTINATION_FILE_NAME}`
        );
        if (cleanupResult.isErr() && cleanupResult.error.code !== "not_found") {
          logger.error({ err: cleanupResult.error }, "Pod file cleanup failed");
        }
      }
      if (conversation) {
        const destroyResult = await destroyConversation(auth, { conversation });
        if (destroyResult.isErr()) {
          logger.error(
            { err: destroyResult.error, conversationId: conversation.sId },
            "Cross-mount E2E cleanup failed"
          );
        } else {
          logger.info(
            { conversationId: conversation.sId, podId: pod.sId },
            "Cross-mount E2E resources cleaned up"
          );
        }
      }
    }
  }
);
