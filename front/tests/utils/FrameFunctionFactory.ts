import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { frameV2ContentType } from "@app/types/files";
import { getPodFilesBasePath } from "@app/types/mount_path";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const inputSchema: JSONSchema = { type: "object" };
const outputSchema: JSONSchema = { type: "object" };

export const TEST_FRAME_BUNDLE_CODE =
  "export default { fetch: async () => Response.json({}) };";

/**
 * A Frame in `space` with one published function, for suites that already own their auth and
 * just need an invocable function. `makeTestFrameFunction` below is the request-scoped variant
 * that also mocks the HTTP auth.
 */
export async function createTestFrameFunction(
  auth: Authenticator,
  {
    space,
    slug = "greet",
    description = "Greet someone.",
    userIdentity = "optional",
    executionMode = "durable",
    inputSchema: functionInputSchema = inputSchema,
    outputSchema: functionOutputSchema = outputSchema,
    publicationId = "publication-1",
  }: {
    space: SpaceResource;
    slug?: string;
    description?: string;
    userIdentity?: SandboxFunctionUserIdentityPolicy;
    executionMode?: SandboxFunctionExecutionMode;
    inputSchema?: JSONSchema;
    outputSchema?: JSONSchema;
    publicationId?: string;
  }
) {
  // Deliberately not "ready": markAsReady copies the file into its mount, which several suites'
  // file-storage mocks do not implement, and no caller reads the Frame's contents.
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId, activePublicationId: publicationId },
    // Seeded rather than resolved on markAsReady, which copies the file into its mount — several
    // suites' file-storage mocks do not implement that, and `deleteFrameV2` needs the path.
    mountFilePath: `${getPodFilesBasePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      podId: space.sId,
    })}Frame/${FRAME_MANIFEST_FILE}`,
  });
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      auth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: slug,
            description,
            userIdentity,
            executionMode,
            defaultStake: "low",
            bundleCode: TEST_FRAME_BUNDLE_CODE,
            inputSchema: functionInputSchema,
            outputSchema: functionOutputSchema,
          },
        ],
      },
      transaction
    )
  );
  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
      frame,
      publicationId,
      slug,
    });
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }

  return { frame, publicationId, sandboxFunction };
}

export async function makeTestFrameFunction({
  enableFramesV2 = true,
  isSuperUser = false,
  shareScope = "workspace_and_emails",
}: {
  enableFramesV2?: boolean;
  isSuperUser?: boolean;
  shareScope?: "emails_only" | "workspace_and_emails";
} = {}) {
  // Poke frame routes authenticate via Cloudflare Access; non-poke callers keep
  // the WorkOS private-api mock.
  const createMockRequest = isSuperUser
    ? createPokeApiMockRequest
    : createPrivateApiMockRequest;
  const { workspace, auth: adminAuth } = await createMockRequest({
    isSuperUser,
    role: "admin",
  });
  if (enableFramesV2) {
    await FeatureFlagFactory.basic(adminAuth, "frames_v2");
  }
  const space = await SpaceFactory.project(workspace);
  const publicationId = "publication-1";
  const frame = await FileFactory.create(adminAuth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: space.sId,
      activePublicationId: publicationId,
      frameName: "Task List",
      frameDescription: "Track tasks.",
    },
  });
  await frame.setShareScope(adminAuth, shareScope);
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      adminAuth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "run-function",
            description: "Run the Frame function.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode:
              "export default { fetch: async () => Response.json({}) };",
            inputSchema,
            outputSchema,
          },
        ],
      },
      transaction
    )
  );
  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(adminAuth, {
      frame,
      publicationId,
      slug: "run-function",
    });
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }
  // Re-mocks request auth (the last mock-request call wins), so `isSuperUser`
  // must be threaded here too or a poke request made right after
  // `makeTestFrameFunction` would authenticate as this non-super "user" auth.
  const { auth } = await createMockRequest({
    isSuperUser,
    role: "user",
    workspace,
  });

  return { adminAuth, auth, frame, sandboxFunction, space, workspace };
}

export async function makeTestFrameInvocation({
  enableFramesV2 = true,
  isSuperUser = false,
  shareScope = "workspace_and_emails",
}: {
  enableFramesV2?: boolean;
  isSuperUser?: boolean;
  shareScope?: "emails_only" | "workspace_and_emails";
} = {}) {
  const setup = await makeTestFrameFunction({
    enableFramesV2,
    isSuperUser,
    shareScope,
  });
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    setup.auth,
    {
      sandboxFunction: setup.sandboxFunction,
      input: { message: "hello" },
    }
  );

  return { ...setup, invocation };
}
