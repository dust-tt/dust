import { DustFileSystem } from "@app/lib/api/file_system";
import { listPodDatabaseOnDiskNames } from "@app/lib/api/projects/apps";
import { createPodFrameFile } from "@app/lib/api/projects/pod_frame_file";
import { buildPodAppPublishPlan } from "@app/lib/api/projects/publish_app_plan";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { unpublishSandboxFunction } from "@app/lib/api/sandbox_functions/unpublish_sandbox_function";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { PodAppPublishSummary } from "@app/types/api/pod_app_manifest";
import {
  POD_APP_MANIFEST_FILE,
  PodAppPublishManifestSchema,
} from "@app/types/api/pod_app_manifest";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import { SCOPED_PREFIX_POD } from "@app/types/file_system";
import { frameContentType, isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { fromError } from "zod-validation-error";

export type PodAppPublishErrorCode =
  | "not_a_pod"
  | "invalid_name"
  | "folder_not_found"
  | "manifest_not_found"
  | "invalid_manifest"
  | "colliding_folders"
  | "sandbox_unavailable"
  | "internal";

export class PodAppPublishError extends Error {
  constructor(
    readonly code: PodAppPublishErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppPublishError";
  }
}

/**
 * Publish a Pod app from the `manifest.json` at the root of its folder: reconcile its databases,
 * publish its functions, publish its frames, then unpublish the functions the manifest no longer
 * declares.
 *
 * **The step order is the design.** Databases go first so functions can rely on them; frames go
 * last because `publishFrame` validates their function references against what was just published;
 * cleanup runs after everything the manifest wants exists, so a rename (drop `old`, add `new`)
 * never leaves a window where neither is callable.
 *
 * The manifest is the source of truth for functions (declarative), conservative for databases
 * (never dropped — an undeclared database with this app's prefix is only warned about), and
 * publish-only for frames (no unpublish-frame operation exists).
 *
 * Failure model mirrors `importPodApp`: per-item failures land in `warnings` rather than aborting —
 * a partially published app is visible and fixable. Only an invalid manifest, a prefix collision,
 * and sandbox unavailability abort.
 */
export async function publishPodApp(
  auth: Authenticator,
  pod: SpaceResource,
  { folderName }: { folderName: string }
): Promise<Result<PodAppPublishSummary, PodAppPublishError>> {
  if (!pod.isProject()) {
    return new Err(
      new PodAppPublishError("not_a_pod", "Apps only exist on Pod spaces.")
    );
  }

  const trimmed = folderName.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_POD_APP_NAME_LENGTH ||
    trimmed.includes("/")
  ) {
    return new Err(
      new PodAppPublishError(
        "invalid_name",
        `Invalid app folder name '${folderName}'.`
      )
    );
  }
  const prefix = normalizeAppPrefix(trimmed);
  if (!prefix) {
    return new Err(
      new PodAppPublishError(
        "invalid_name",
        `'${trimmed}' has no letters or digits to derive an app prefix from.`
      )
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(
      new PodAppPublishError("internal", "Failed to initialise file system.")
    );
  }
  const dustFs = fsResult.value;
  const podRoot = `${SCOPED_PREFIX_POD}${pod.sId}`;
  const folderPath = `${podRoot}/${trimmed}`;

  // One recursive root listing serves three needs: the folder's own files, its existence, and
  // prefix collisions with sibling folders (which would silently cross-wire slugs and databases,
  // so they abort — same rule as export).
  const listResult = await dustFs.list(podRoot);
  if (listResult.isErr()) {
    return new Err(
      new PodAppPublishError("internal", listResult.error.message)
    );
  }
  const folderRelPaths = new Set<string>();
  const collidingFolderNames = new Set<string>();
  for (const entry of listResult.value) {
    if (entry.isDirectory || !entry.path.startsWith(`${podRoot}/`)) {
      continue;
    }
    const segments = entry.path
      .slice(podRoot.length + 1)
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length < 2) {
      continue;
    }
    const [head, ...rest] = segments;
    if (head === trimmed) {
      folderRelPaths.add(rest.join("/"));
    } else if (normalizeAppPrefix(head) === prefix) {
      collidingFolderNames.add(head);
    }
  }
  if (collidingFolderNames.size > 0) {
    return new Err(
      new PodAppPublishError(
        "colliding_folders",
        `Folders ${[trimmed, ...collidingFolderNames].join(", ")} all resolve to '${prefix}'. ` +
          "Rename all but one before publishing."
      )
    );
  }
  if (folderRelPaths.size === 0) {
    return new Err(
      new PodAppPublishError(
        "folder_not_found",
        `No folder '${trimmed}' at the pod root.`
      )
    );
  }
  if (!folderRelPaths.has(POD_APP_MANIFEST_FILE)) {
    return new Err(
      new PodAppPublishError(
        "manifest_not_found",
        `Folder '${trimmed}' has no ${POD_APP_MANIFEST_FILE}. Write one at the folder root, then retry.`
      )
    );
  }

  const manifestResult = await dustFs.readBuffer(
    `${folderPath}/${POD_APP_MANIFEST_FILE}`
  );
  if (manifestResult.isErr() || manifestResult.value === null) {
    return new Err(
      new PodAppPublishError(
        "manifest_not_found",
        `Could not read '${trimmed}/${POD_APP_MANIFEST_FILE}'.`
      )
    );
  }
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestResult.value.toString("utf-8"));
  } catch (err) {
    return new Err(
      new PodAppPublishError(
        "invalid_manifest",
        `${POD_APP_MANIFEST_FILE} is not valid JSON: ${normalizeError(err).message}`
      )
    );
  }
  const validation = PodAppPublishManifestSchema.safeParse(manifestJson);
  if (!validation.success) {
    return new Err(
      new PodAppPublishError(
        "invalid_manifest",
        fromError(validation.error).toString()
      )
    );
  }
  const manifest = validation.data;

  const [sandboxFunctions, databaseOnDiskNames] = await Promise.all([
    SandboxFunctionResource.listBySpace(auth, pod),
    listPodDatabaseOnDiskNames(auth, pod),
  ]);

  const planResult = buildPodAppPublishPlan({
    manifest,
    folderPath,
    folderRelPaths,
    prefix,
    publishedFunctionSlugs: sandboxFunctions.map((fn) => fn.slug),
    databaseOnDiskNames,
  });
  if (planResult.isErr()) {
    return new Err(
      new PodAppPublishError("invalid_manifest", planResult.error.message)
    );
  }
  const plan = planResult.value;
  const warnings = [...plan.warnings];

  // 1. Databases first, so functions can rely on them.
  const reconciledDatabaseNames: string[] = [];
  for (const database of plan.databasesToReconcile) {
    const result = await reconcileDatabaseFromPodPath(auth, {
      space: pod,
      database: database.name,
      path: database.scopedPath,
    });
    if (result.isErr()) {
      if (result.error.code === "sandbox_unavailable") {
        return new Err(
          new PodAppPublishError("sandbox_unavailable", result.error.message)
        );
      }
      warnings.push(`Database ${database.name}: ${result.error.message}`);
      continue;
    }
    reconciledDatabaseNames.push(result.value.database);
  }

  // 2. Functions. The scoped path's first segment is the app folder, which is what prefixes the
  // published slug (deriveSandboxFunctionSlug) — so arbitrary paths inside the folder are fine.
  const publishedFunctionSlugs: string[] = [];
  for (const fn of plan.functionsToPublish) {
    const result = await publishSandboxFunction(auth, {
      space: pod,
      slug: fn.name,
      description: fn.description,
      path: fn.scopedPath,
      executionMode: fn.executionMode,
      defaultStake: fn.defaultStake,
    });
    if (result.isErr()) {
      if (result.error.code === "sandbox_unavailable") {
        return new Err(
          new PodAppPublishError("sandbox_unavailable", result.error.message)
        );
      }
      warnings.push(`Function ${fn.name}: ${result.error.message}`);
      continue;
    }
    publishedFunctionSlugs.push(result.value.sandboxFunction.slug);
  }

  // 3. Frames last: publishFrame validates their function references against what step 2 just
  // published. Resolved in one batched query rather than per frame.
  const publishedFrameNames: string[] = [];
  if (plan.framesToPublish.length > 0) {
    const mountPathByRelPath = new Map<string, string>();
    for (const frame of plan.framesToPublish) {
      const mountPath = dustFs.toMountFilePath(frame.scopedPath);
      if (mountPath) {
        mountPathByRelPath.set(frame.relPath, mountPath);
      }
    }
    const files = await FileResource.fetchByMountFilePaths(
      auth,
      Array.from(mountPathByRelPath.values())
    );
    const fileByMountPath = new Map(
      files.flatMap((file) =>
        file.mountFilePath ? [[file.mountFilePath, file] as const] : []
      )
    );

    for (const frame of plan.framesToPublish) {
      const mountPath = mountPathByRelPath.get(frame.relPath);
      let file = mountPath ? fileByMountPath.get(mountPath) : undefined;

      if (file && !isInteractiveContentType(file.contentType)) {
        warnings.push(
          `Frame ${frame.relPath}: its FileResource content type is '${file.contentType}', ` +
            "not a Frame. Create it as interactive content, then retry."
        );
        continue;
      }

      // No FileResource: the manifest declares a frame that exists only as a bare storage
      // object (e.g. copied into the pod, or written directly inside the sandbox, both of which
      // lose the FileResource). Recreate it in place the same way `importPodApp` does, so the
      // manifest-first flow self-heals.
      //
      // The manifest declaring the path as a frame is trusted over the listing's storage MIME
      // type: files written inside the sandbox get their GCS Content-Type guessed from the
      // extension by gcsfuse, and `.tsx` guesses to `application/x-tiled-tsx` (a Tiled tileset),
      // not a Frame type — so that guess can never pass an interactive-content check. The
      // manifest is the authoritative statement that the path is a frame; `publishFrame`'s
      // bundler performs the real validation (TS/JSX parse etc.) and rejects non-frame sources
      // with a meaningful error.
      if (!file) {
        if (frame.relPath.includes("/")) {
          warnings.push(
            `Frame ${frame.relPath}: cannot auto-create a Frame in a subfolder; create it ` +
              "as interactive content, then retry."
          );
          continue;
        }
        const sourceResult = await dustFs.readBuffer(frame.scopedPath);
        if (sourceResult.isErr() || sourceResult.value === null) {
          warnings.push(`Frame ${frame.relPath}: could not read its source.`);
          continue;
        }
        const createResult = await createPodFrameFile(auth, {
          space: pod,
          folderName: trimmed,
          fileName: frame.relPath,
          contentType: frameContentType,
          content: sourceResult.value.toString("utf-8"),
        });
        if (createResult.isErr()) {
          warnings.push(
            `Frame ${frame.relPath}: ${createResult.error.message}`
          );
          continue;
        }
        file = createResult.value;
      }

      const result = await publishFrame(auth, {
        file,
        reader: createMountFrameSourceReader(dustFs, folderPath),
        entryRelPath: frame.relPath,
        rootScopedPath: folderPath,
      });
      if (result.isErr()) {
        warnings.push(`Frame ${frame.relPath}: ${result.error.message}`);
        continue;
      }
      publishedFrameNames.push(frame.relPath);
    }
  }

  // 4. Declarative cleanup: functions with this app's prefix that the manifest dropped. Runs last
  // so a rename never leaves a window where neither the old nor the new name is callable.
  const unpublishedFunctionSlugs: string[] = [];
  for (const slug of plan.functionSlugsToUnpublish) {
    const result = await unpublishSandboxFunction(auth, { space: pod, slug });
    // Already gone is fine — republishing after a partial failure must be safe.
    if (result.isErr() && result.error.code !== "not_found") {
      warnings.push(`Unpublish ${slug}: ${result.error.message}`);
      continue;
    }
    unpublishedFunctionSlugs.push(slug);
  }

  return new Ok({
    prefix,
    name: trimmed,
    displayName: manifest.name,
    reconciledDatabaseNames,
    publishedFunctionSlugs,
    publishedFrameNames,
    unpublishedFunctionSlugs,
    warnings,
  });
}
