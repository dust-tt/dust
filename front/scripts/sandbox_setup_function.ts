import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Authenticator } from "@app/lib/auth";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getIdsFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";

// Canonical sandbox-function source (mirrors cli/dust-sandbox/functions-runner/fixtures/greet.ts):
// a `schema` export with zod input/output (the build extracts these as JSON Schemas) and a default
// object exposing a `fetch(req)` handler.
const GREET_SOURCE = `import { z } from "zod";

export const schema = {
  description: "Greet a user by name",
  input: z.object({ name: z.string(), formal: z.boolean().optional() }),
  output: z.object({ greeting: z.string() }),
};

export default {
  async fetch(req: Request): Promise<Response> {
    const { name, formal } = (await req.json()) as {
      name: string;
      formal?: boolean;
    };
    return Response.json({
      greeting: \`\${formal ? "Good day" : "Hi"}, \${name}\`,
    });
  },
};
`;

makeScript(
  {
    space: {
      type: "string",
      demandOption: true,
      describe: "Pod (project space) sId, e.g. vlt_q03Y149aTx",
    },
    slug: {
      type: "string",
      default: "greet",
      describe: "Sandbox function slug (kebab-case)",
    },
    description: {
      type: "string",
      default: "Greet a user by name.",
      describe: "Sandbox function description",
    },
    reset: {
      type: "boolean",
      default: false,
      describe: "Destroy the pod's existing sandbox first (forces a fresh one)",
    },
  },
  async (
    { space: spaceId, slug, description, reset, execute },
    scriptLogger
  ) => {
    if (!isValidSandboxFunctionSlug(slug)) {
      scriptLogger.error(
        { slug },
        "Slug must be lowercase alphanumeric with single hyphen separators."
      );
      return;
    }

    // Resolve the workspace from the space sId so the script can bootstrap an admin Authenticator
    // (we only have the pod sId, and fetchById needs an auth). The sId encodes its workspace.
    const idsResult = getIdsFromSId(spaceId);
    if (idsResult.isErr()) {
      scriptLogger.error(
        { spaceId, err: idsResult.error.message },
        "Could not decode the space sId."
      );
      return;
    }
    const [workspace] = await WorkspaceResource.fetchByModelIds([
      idsResult.value.workspaceModelId,
    ]);
    if (!workspace) {
      scriptLogger.error({ spaceId }, "Workspace not found for space.");
      return;
    }

    // All groups so the admin auth has the pod's group and thus read/write on the project space.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
      dangerouslyRequestAllGroups: true,
    });

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space || !space.isProject()) {
      scriptLogger.error({ spaceId }, "Space is not a pod (project space).");
      return;
    }

    const sourcePath = `pod-${space.sId}/${slug}.ts`;

    if (!execute) {
      scriptLogger.info(
        { workspace: workspace.sId, space: space.sId, slug, sourcePath, reset },
        "[dry-run] Would write the source to the pod mount and publish the sandbox function."
      );
      return;
    }

    // Optionally destroy the pod's existing sandbox so a fresh one is created with the current
    // egress/network settings applied at create time (useful after a half-configured sandbox).
    if (reset) {
      const deleteResult = await PodSandboxAdapter.deleteSandbox(auth, space);
      if (deleteResult.isErr()) {
        scriptLogger.error(
          { err: deleteResult.error.message },
          "Failed to destroy the pod's existing sandbox."
        );
        return;
      }
      scriptLogger.info("Destroyed the pod's existing sandbox.");
    }

    // 1. Write the function source onto the pod's writable mount. front is the writer here; the
    // source stays on the mount and is never tracked as a FileResource (only the built bundle is).
    const fsResult = await DustFileSystem.forPod(auth, space);
    if (fsResult.isErr()) {
      scriptLogger.error(
        { err: fsResult.error.message },
        "Failed to open the pod file system (check write access to the space)."
      );
      return;
    }
    const writeResult = await fsResult.value.write(
      sourcePath,
      GREET_SOURCE,
      "text/x-typescript"
    );
    if (writeResult.isErr()) {
      scriptLogger.error(
        { err: writeResult.error.message },
        "Failed to write the source to the pod mount."
      );
      return;
    }
    scriptLogger.info(
      { sourcePath },
      "Wrote the function source to the pod mount."
    );

    // 2. Publish: builds the source on the pod sandbox (dsbx function build), extracts the I/O
    // JSON Schemas, stores the bundle under the dedicated sandbox-functions prefix, and upserts the
    // SandboxFunction row on (space, slug).
    const publishResult = await publishSandboxFunction(auth, {
      space,
      slug,
      description,
      path: sourcePath,
    });
    if (publishResult.isErr()) {
      scriptLogger.error(
        { code: publishResult.error.code, err: publishResult.error.message },
        "Publish failed."
      );
      return;
    }

    scriptLogger.info(
      {
        sandboxFunctionId: publishResult.value.sId,
        slug: publishResult.value.slug,
        space: space.sId,
      },
      "Published sandbox function. Agents in this pod can now discover it via the " +
        "sandbox_functions list/get tools and invoke it."
    );
  }
);
