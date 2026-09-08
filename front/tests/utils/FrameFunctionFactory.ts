import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const inputSchema: JSONSchema = { type: "object" };
const outputSchema: JSONSchema = { type: "object" };

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
}: {
  enableFramesV2?: boolean;
  isSuperUser?: boolean;
} = {}) {
  const setup = await makeTestFrameFunction({ enableFramesV2, isSuperUser });
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    setup.auth,
    {
      sandboxFunction: setup.sandboxFunction,
      input: { message: "hello" },
    }
  );

  return { ...setup, invocation };
}
