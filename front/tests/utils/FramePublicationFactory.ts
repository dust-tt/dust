import { storeFramePublication } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const inputSchema: JSONSchema = { type: "object" };
const outputSchema: JSONSchema = { type: "object" };

const TEST_PUBLICATION_FUNCTION_NAME = "add-task";
const TEST_PUBLICATION_FUNCTION_CODE = "export async function run() {}";

const testPublicationManifest = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  functions: [
    {
      name: TEST_PUBLICATION_FUNCTION_NAME,
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
  ],
});

/**
 * Store a one-function publication of `frame` the way publishing does (against the global
 * `fileStorageMock`), then move its `frame_publications` row's `createdAt` back by
 * `publishedDaysAgo`: storing always stamps now, and retention reads the age from that row.
 * Returns the publication id; the caller activates it if it should be the frame's active one.
 *
 * Lives apart from `FrameFunctionFactory` on purpose: this is the one Frame fixture that pulls the
 * real publish pipeline — and with it `@app/lib/api/viz/authorized_file_access` — into a suite's
 * module graph. A suite that mocks anything in that graph and imports the factory only for an
 * unrelated Frame helper would otherwise fail to initialize.
 */
export async function storeTestFramePublication(
  auth: Authenticator,
  frame: FileResource,
  {
    publishedDaysAgo,
    withFunctionRows = true,
  }: { publishedDaysAgo: number; withFunctionRows?: boolean }
): Promise<string> {
  const stored = await storeFramePublication(auth, {
    frame,
    functionArtifacts: [
      {
        name: TEST_PUBLICATION_FUNCTION_NAME,
        bundleCode: TEST_PUBLICATION_FUNCTION_CODE,
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      },
    ],
    manifest: testPublicationManifest,
    sourceFiles: [
      {
        relativePath: "index.tsx",
        content: Buffer.from("export default function App() {}"),
        contentType: "text/typescript",
      },
      {
        relativePath: "functions/add_task.ts",
        content: Buffer.from(TEST_PUBLICATION_FUNCTION_CODE),
        contentType: "text/typescript",
      },
    ],
    uiBundleCode: "export default function App() {}",
  });
  if (stored.isErr()) {
    throw stored.error;
  }
  const { publicationId } = stored.value;

  await FramePublicationModel.update(
    { createdAt: new Date(Date.now() - publishedDaysAgo * ONE_DAY_MS) },
    {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        fileId: frame.id,
        publicationId,
      },
    }
  );

  if (withFunctionRows) {
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        auth,
        {
          frame,
          publicationId,
          functions: [
            {
              name: TEST_PUBLICATION_FUNCTION_NAME,
              description: "Add a task.",
              userIdentity: "optional",
              executionMode: "durable",
              defaultStake: "low",
              bundleCode: TEST_PUBLICATION_FUNCTION_CODE,
              inputSchema,
              outputSchema,
            },
          ],
        },
        transaction
      )
    );
  }

  return publicationId;
}
