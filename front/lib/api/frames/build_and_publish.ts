import path from "node:path";

import { validateTailwindCode } from "@app/lib/api/files/content_validation";
import { reconcileFramePublicationDatabasesOnStagedSource } from "@app/lib/api/frames/database_reconciliation";
import type {
  FramePublicationFunctionArtifact,
  FramePublicationSourceFile,
} from "@app/lib/api/frames/publication_storage";
import {
  buildFramePublicationContracts,
  FramePublicationError,
  publishFramePublication,
} from "@app/lib/api/frames/publication_storage";
import type { FramePublishTimingContext } from "@app/lib/api/frames/publish_timing";
import { withFramePublishTimingResult } from "@app/lib/api/frames/publish_timing";
import { withStagedFrameSource } from "@app/lib/api/frames/source_staging";
import {
  ensureConversationSandboxReadyWithScope,
  ensureFrameSandboxReady,
} from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnReadySandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { buildFrameBundle } from "@app/lib/api/viz/build_frame_bundle";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type {
  FramePublicationStatus,
  FramePublishMode,
} from "@app/types/api/frame_publication";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isFramesV2PublicFunctionsEnabled } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Where function builds stage and compile during {@link buildFramePublication}.
 *
 * - `frame` (default): Frame-owned sandbox — used once the FileResource is already Frames v2.
 * - `conversation`: conversation DSBX — used when replacing a legacy Frame before conversion,
 *   because `ensureFrameSandboxReady` requires `fetchFreshFrameV2` to succeed.
 */
export type FramePublicationFunctionSandbox =
  | { kind: "frame" }
  | {
      kind: "conversation";
      conversation: ConversationWithoutContentType;
    };

const FRAME_FUNCTION_BUILD_CONCURRENCY = 4;

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

async function buildFrameFunctionArtifactsOnStagedSource(
  auth: Authenticator,
  {
    sandbox,
    stagingDirectory,
    manifest,
  }: {
    sandbox: SandboxResource;
    stagingDirectory: string;
    manifest: FrameManifest;
  }
): Promise<Result<FramePublicationFunctionArtifact[], SandboxFunctionError>> {
  if (manifest.functions.length === 0) {
    return new Ok([]);
  }

  const results = await concurrentExecutor(
    manifest.functions,
    async (fn) => {
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
      return new Ok({ name: fn.name, ...buildResult.value });
    },
    { concurrency: FRAME_FUNCTION_BUILD_CONCURRENCY }
  );

  const firstError = results.find((result) => result.isErr());
  if (firstError?.isErr()) {
    return firstError;
  }

  return new Ok(
    results.flatMap((result) => (result.isOk() ? [result.value] : []))
  );
}

/**
 * Build functions on the conversation sandbox. Used only for legacy Frame replacement
 * before conversion — never reconciles databases (that requires a Frame sandbox).
 */
async function runConversationSandboxFunctionBuilds(
  auth: Authenticator,
  {
    conversation,
    manifest,
    sourceFiles,
    timingContext,
  }: {
    conversation: ConversationWithoutContentType;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    timingContext: FramePublishTimingContext;
  }
): Promise<
  Result<
    FramePublicationFunctionArtifact[],
    FramePublicationError | SandboxFunctionError
  >
> {
  if (manifest.functions.length === 0) {
    return new Ok([]);
  }

  return withFramePublishTimingResult(
    "function_stage_and_build",
    timingContext,
    async () => {
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
      const { sandbox } = ensureResult.value;

      return withStagedFrameSource(
        auth,
        { sandbox, sourceFiles },
        async (stagingDirectory) =>
          buildFrameFunctionArtifactsOnStagedSource(auth, {
            sandbox,
            stagingDirectory,
            manifest,
          })
      );
    }
  );
}

/**
 * On the Frame sandbox: stage sources once, then run function builds and DB
 * reconcile in parallel (reconcile only when requested).
 */
async function runFrameSandboxPublicationWork(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceFiles,
    reconcileDatabases,
    timingContext,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    reconcileDatabases: boolean;
    timingContext: FramePublishTimingContext;
  }
): Promise<
  Result<
    FramePublicationFunctionArtifact[],
    FramePublicationError | SandboxFunctionError
  >
> {
  const needsFunctions = manifest.functions.length > 0;
  const needsReconcile = reconcileDatabases && manifest.databases.length > 0;
  if (!needsFunctions && !needsReconcile) {
    return new Ok([]);
  }

  const ensureResult = await withFramePublishTimingResult(
    "frame_sandbox_ensure",
    timingContext,
    async () => {
      const ready = await ensureFrameSandboxReady(auth, frame);
      if (ready.isErr()) {
        return new Err(
          new SandboxFunctionError("sandbox_unavailable", ready.error.message)
        );
      }
      return ready;
    }
  );
  if (ensureResult.isErr()) {
    return ensureResult;
  }
  const { sandbox } = ensureResult.value;

  // When functions are present, the outer step is function_stage_and_build (staging +
  // builds); reconcile is nested. DB-only publish times the staging pass as database_reconcile.
  const stagingStep = needsFunctions
    ? "function_stage_and_build"
    : "database_reconcile";

  return withFramePublishTimingResult(stagingStep, timingContext, () =>
    withStagedFrameSource(
      auth,
      { sandbox, sourceFiles },
      async (stagingDirectory) => {
        const functionBuildPromise = needsFunctions
          ? buildFrameFunctionArtifactsOnStagedSource(auth, {
              sandbox,
              stagingDirectory,
              manifest,
            })
          : Promise.resolve(new Ok([]));

        const reconcilePromise = needsReconcile
          ? needsFunctions
            ? withFramePublishTimingResult(
                "database_reconcile",
                timingContext,
                () =>
                  reconcileFramePublicationDatabasesOnStagedSource(auth, {
                    frame,
                    sandbox,
                    stagingDirectory,
                    manifest,
                  })
              )
            : reconcileFramePublicationDatabasesOnStagedSource(auth, {
                frame,
                sandbox,
                stagingDirectory,
                manifest,
              })
          : Promise.resolve(new Ok(undefined));

        const [functionArtifacts, reconciliation] = await Promise.all([
          functionBuildPromise,
          reconcilePromise,
        ]);
        if (functionArtifacts.isErr()) {
          return functionArtifacts;
        }
        if (reconciliation.isErr()) {
          return reconciliation;
        }
        return functionArtifacts;
      }
    )
  );
}

/**
 * @cc [owner:davidebbo,label:product] tailwind-violations-fail-publication
 * A source file containing a forbidden Tailwind arbitrary value (see `validateTailwindCode`) MUST
 * fail the build with an `invalid_tailwind` error before any UI or function build runs and before
 * any artifact is stored or activated, for validation and publication alike. Violations are never
 * reported as warnings on a success.
 */
export async function buildFramePublication(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceFiles,
    reconcileDatabases = false,
    functionSandbox = { kind: "frame" },
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    /** When true, reconcile declared databases on the Frame sandbox during staging. */
    reconcileDatabases?: boolean;
    /**
     * Sandbox used for function builds. Defaults to the Frame sandbox. Pass
     * `{ kind: "conversation", conversation }` when the Frame is not yet v2
     * (legacy replacement); that path never reconciles databases.
     */
    functionSandbox?: FramePublicationFunctionSandbox;
  }
): Promise<
  Result<FramePublicationBuild, FramePublicationError | SandboxFunctionError>
> {
  const timingContext: FramePublishTimingContext = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    frameId: frame.sId,
    sourceFileCount: sourceFiles.length,
    functionCount: manifest.functions.length,
    databaseCount: manifest.databases.length,
  };

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

  // Conversation builds are pre-conversion only: no Frame sandbox, no DB reconcile.
  const useConversationSandbox = functionSandbox.kind === "conversation";
  if (useConversationSandbox && reconcileDatabases) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        "Database reconcile requires the Frame sandbox; it cannot run on the conversation sandbox."
      )
    );
  }

  const needsSandbox = useConversationSandbox
    ? manifest.functions.length > 0
    : manifest.functions.length > 0 ||
      (reconcileDatabases && manifest.databases.length > 0);

  const uiBundlePromise = withFramePublishTimingResult(
    "ui_build",
    timingContext,
    () => buildFrameUiBundle({ manifest, sourceFiles })
  );

  const sandboxWorkPromise = !needsSandbox
    ? Promise.resolve(new Ok([]))
    : useConversationSandbox
      ? runConversationSandboxFunctionBuilds(auth, {
          conversation: functionSandbox.conversation,
          manifest,
          sourceFiles,
          timingContext,
        })
      : runFrameSandboxPublicationWork(auth, {
          frame,
          manifest,
          sourceFiles,
          reconcileDatabases,
          timingContext,
        });

  const [uiBundle, functionArtifacts] = await Promise.all([
    uiBundlePromise,
    sandboxWorkPromise,
  ]);
  if (uiBundle.isErr()) {
    return uiBundle;
  }
  if (functionArtifacts.isErr()) {
    return functionArtifacts;
  }

  return new Ok({
    functionArtifacts: functionArtifacts.value,
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
    frame,
    manifest,
    sourceFiles,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
  }
): Promise<Result<undefined, FramePublicationError | SandboxFunctionError>> {
  const buildResult = await buildFramePublication(auth, {
    frame,
    manifest,
    sourceFiles,
    reconcileDatabases: false,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }

  const publicFunctionsEnabled = isFramesV2PublicFunctionsEnabled(
    await getFeatureFlags(auth)
  );

  const contracts = buildFramePublicationContracts({
    functionArtifacts: buildResult.value.functionArtifacts,
    manifest,
    publicFunctionsEnabled,
    sourceFiles,
  });
  if (contracts.isErr()) {
    return contracts;
  }

  return new Ok(undefined);
}

/**
 * Build the UI and every declared function from one captured source snapshot, reconcile
 * databases when declared, then atomically publish. Function builds and DB reconcile share one
 * Frame-sandbox staging pass and run in parallel with the front-side UI build.
 */
export async function buildAndPublishFramePublication(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceFiles,
    publishedByAgentConfigurationId,
    mode,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    publishedByAgentConfigurationId?: string;
    mode: FramePublishMode;
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
    FramePublicationError | SandboxFunctionError
  >
> {
  const timingContext: FramePublishTimingContext = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    frameId: frame.sId,
    sourceFileCount: sourceFiles.length,
    functionCount: manifest.functions.length,
    databaseCount: manifest.databases.length,
  };

  return withFramePublishTimingResult(
    "publish_total",
    timingContext,
    async () => {
      const buildResult = await buildFramePublication(auth, {
        frame,
        manifest,
        sourceFiles,
        reconcileDatabases: true,
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
        mode,
      });
    }
  );
}
