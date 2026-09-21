import path from "node:path";
import { validateTailwindCode } from "@app/lib/api/files/content_validation";
import type {
  FramePublicationFunctionArtifact,
  FramePublicationSourceFile,
} from "@app/lib/api/frames/publication_storage";
import {
  buildFramePublicationContracts,
  FramePublicationError,
  publishFramePublication,
} from "@app/lib/api/frames/publication_storage";
import { withStagedFrameSource } from "@app/lib/api/frames/source_staging";
import { ensureConversationSandboxReadyWithScope } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { buildFrameBundle } from "@app/lib/api/viz/build_frame_bundle";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type FramePublicationBuild = {
  functionArtifacts: FramePublicationFunctionArtifact[];
  uiBundleCode: string;
};

async function buildFrameUiBundle({
  manifest,
  sourceFiles,
}: {
  manifest: FrameManifest;
  sourceFiles: FramePublicationSourceFile[];
}): Promise<Result<string, FramePublicationError>> {
  const sourceByPath = new Map(
    sourceFiles.map((sourceFile) => [
      sourceFile.relativePath,
      sourceFile.content,
    ])
  );
  const buildResult = await buildFrameBundle({
    entryRelPath: manifest.uiEntryPoint,
    reader: {
      list: async () => [...sourceByPath.keys()],
      read: async (relativePath) =>
        sourceByPath.get(relativePath)?.toString("utf8") ?? null,
    },
  });

  if (buildResult.isErr()) {
    return new Err(
      new FramePublicationError(
        "ui_build_failed",
        `Failed to build Frame UI: ${buildResult.error.message}`
      )
    );
  }

  return new Ok(buildResult.value.code);
}

/**
 * @cc [owner:davidebbo,label:product] tailwind-violations-fail-publication
 * A source file containing a forbidden Tailwind arbitrary value (see `validateTailwindCode`) MUST
 * fail the build with an `invalid_tailwind` error before any UI or function build runs and before
 * any artifact is stored or activated, for validation and publication alike. Violations are never
 * reported as warnings on a success.
 */
async function buildFramePublication(
  auth: Authenticator,
  {
    conversation,
    manifest,
    sourceFiles,
  }: {
    conversation: ConversationWithoutContentType;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
  }
): Promise<
  Result<FramePublicationBuild, FramePublicationError | SandboxFunctionError>
> {
  const seenSourcePaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (
      !isSafeFrameRelativePath(sourceFile.relativePath) ||
      seenSourcePaths.has(sourceFile.relativePath)
    ) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    seenSourcePaths.add(sourceFile.relativePath);
  }

  const tailwind = validateFrameTailwind(sourceFiles);
  if (tailwind.isErr()) {
    return tailwind;
  }

  const uiBundle = await buildFrameUiBundle({ manifest, sourceFiles });
  if (uiBundle.isErr()) {
    return uiBundle;
  }

  if (manifest.functions.length === 0) {
    return new Ok({
      functionArtifacts: [],
      uiBundleCode: uiBundle.value,
    });
  }

  const ensureResult = await ensureConversationSandboxReadyWithScope(
    auth,
    conversation
  );
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  const sandbox = ensureResult.value.sandbox;
  const functionArtifactResult = await withStagedFrameSource(
    auth,
    { sandbox, sourceFiles },
    async (stagingDirectory) => {
      const functionArtifacts: FramePublicationFunctionArtifact[] = [];
      for (const fn of manifest.functions) {
        const buildResult = await buildSandboxFunctionOnReadySandbox(auth, {
          sandbox,
          srcSandboxPath: path.posix.join(stagingDirectory, fn.entryPoint),
        });
        if (buildResult.isErr()) {
          return new Err(
            new SandboxFunctionError(
              buildResult.error.code,
              `Failed to build Frame function "${fn.name}": ${buildResult.error.message}`
            )
          );
        }

        functionArtifacts.push({ name: fn.name, ...buildResult.value });
      }

      return new Ok(functionArtifacts);
    }
  );
  if (functionArtifactResult.isErr()) {
    return functionArtifactResult;
  }

  return new Ok({
    functionArtifacts: functionArtifactResult.value,
    uiBundleCode: uiBundle.value,
  });
}

function validateFrameTailwind(
  sourceFiles: FramePublicationSourceFile[]
): Result<undefined, FramePublicationError> {
  const violations: string[] = [];
  for (const sourceFile of sourceFiles) {
    if (!/\.(?:jsx|tsx)$/.test(sourceFile.relativePath)) {
      continue;
    }

    const validation = validateTailwindCode(
      sourceFile.content.toString("utf8")
    );
    if (validation.isErr()) {
      violations.push(
        ...validation.error.map(
          (warning) => `${sourceFile.relativePath}: ${warning.message}`
        )
      );
    }
  }

  if (violations.length === 0) {
    return new Ok(undefined);
  }

  return new Err(
    new FramePublicationError(
      "invalid_tailwind",
      `Forbidden Tailwind usage in Frame source:\n${violations
        .map((violation) => `- ${violation}`)
        .join("\n")}`
    )
  );
}

/**
 * Run the publication build without storing, reconciling, or activating anything.
 */
export async function validateFramePublication(
  auth: Authenticator,
  {
    conversation,
    manifest,
    sourceFiles,
  }: {
    conversation: ConversationWithoutContentType;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
  }
): Promise<Result<undefined, FramePublicationError | SandboxFunctionError>> {
  const buildResult = await buildFramePublication(auth, {
    conversation,
    manifest,
    sourceFiles,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }

  const contracts = buildFramePublicationContracts({
    functionArtifacts: buildResult.value.functionArtifacts,
    manifest,
    sourceFiles,
  });
  if (contracts.isErr()) {
    return contracts;
  }

  return new Ok(undefined);
}

/**
 * Build the UI and every declared function from one captured source snapshot, then atomically
 * publish its artifacts. Function builds stage the snapshot in the invoking conversation's DSBX;
 * source stays in its authoring scope. No publication storage is touched until every build succeeds.
 */
export async function buildAndPublishFramePublication(
  auth: Authenticator,
  {
    conversation,
    frame,
    manifest,
    sourceFiles,
    publishedByAgentConfigurationId,
  }: {
    conversation: ConversationWithoutContentType;
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    publishedByAgentConfigurationId?: string;
  }
): Promise<
  Result<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >
> {
  const buildResult = await buildFramePublication(auth, {
    conversation,
    manifest,
    sourceFiles,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }

  return publishFramePublication(auth, {
    frame,
    functionArtifacts: buildResult.value.functionArtifacts,
    manifest,
    sourceFiles,
    uiBundleCode: buildResult.value.uiBundleCode,
    publishedByAgentConfigurationId,
  });
}
