import {
  appPrefixFromPodDatabaseName,
  podDatabaseNameWithoutAppPrefix,
} from "@app/lib/api/sandbox_functions/db_naming";
import {
  appPrefixFromSlug,
  sandboxFunctionNameFromSlug,
} from "@app/lib/api/sandbox_functions/slug";
import type { PodAppPublishManifest } from "@app/types/api/pod_app_manifest";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type PodAppPublishPlan = {
  databasesToReconcile: { name: string; scopedPath: string }[];
  functionsToPublish: {
    name: string;
    scopedPath: string;
    description: string;
    executionMode: SandboxFunctionExecutionMode;
    defaultStake?: SandboxFunctionStake;
  }[];
  framesToPublish: { relPath: string; scopedPath: string }[];
  functionSlugsToUnpublish: string[];
  warnings: string[];
};

/**
 * Turn a parsed manifest into an executable publish plan, given the current published state.
 *
 * Pure: every input is data, so the declarative-diff rules live here where they are unit-testable
 * without a sandbox. The manifest is the source of truth for FUNCTIONS — a published function
 * carrying this app's prefix that the manifest no longer declares is planned for unpublish.
 * Databases are conservative: an on-disk database with this app's prefix that the manifest does not
 * declare only produces a warning, never a deletion. Frames are publish-only (there is no
 * unpublish-frame operation), so nothing is planned for a frame the manifest dropped.
 */
export function buildPodAppPublishPlan({
  manifest,
  folderPath,
  folderRelPaths,
  prefix,
  publishedFunctionSlugs,
  databaseOnDiskNames,
}: {
  manifest: PodAppPublishManifest;
  folderPath: string;
  folderRelPaths: Set<string>;
  prefix: string;
  publishedFunctionSlugs: string[];
  databaseOnDiskNames: string[];
}): Result<PodAppPublishPlan, Error> {
  const missing = [
    ...manifest.frames.map((frame) => frame.path),
    ...manifest.functions.map((fn) => fn.path),
    ...manifest.databases.map((db) => db.path),
  ].filter((path) => !folderRelPaths.has(path));
  if (missing.length > 0) {
    return new Err(
      new Error(
        `Manifest references files missing from the app folder: ${missing.join(", ")}.`
      )
    );
  }

  const declaredFunctionNames = new Set(
    manifest.functions.map((fn) => fn.name)
  );
  const functionSlugsToUnpublish = publishedFunctionSlugs.filter(
    (slug) =>
      appPrefixFromSlug(slug) === prefix &&
      !declaredFunctionNames.has(sandboxFunctionNameFromSlug(slug))
  );

  const declaredDatabaseNames = new Set(
    manifest.databases.map((db) => db.name)
  );
  const warnings = databaseOnDiskNames
    .filter(
      (onDiskName) =>
        appPrefixFromPodDatabaseName(onDiskName) === prefix &&
        !declaredDatabaseNames.has(podDatabaseNameWithoutAppPrefix(onDiskName))
    )
    .map(
      (onDiskName) =>
        `Database '${onDiskName}' exists but is not declared in the manifest; it was left untouched.`
    );

  return new Ok({
    databasesToReconcile: manifest.databases.map((db) => ({
      name: db.name,
      scopedPath: `${folderPath}/${db.path}`,
    })),
    functionsToPublish: manifest.functions.map((fn) => ({
      name: fn.name,
      scopedPath: `${folderPath}/${fn.path}`,
      description: fn.description,
      executionMode: fn.executionMode,
      ...(fn.defaultStake ? { defaultStake: fn.defaultStake } : {}),
    })),
    framesToPublish: manifest.frames.map((frame) => ({
      relPath: frame.path,
      scopedPath: `${folderPath}/${frame.path}`,
    })),
    functionSlugsToUnpublish,
    warnings,
  });
}
