import path from "node:path";

import type {
  MigratedFrameV2,
  MigrateFrameToV2Params,
} from "@app/lib/api/frames/migrate_to_v2/types";
import { FRAME_PACKAGE_FILE_CONTENT_TYPE } from "@app/lib/api/frames/migrate_to_v2/types";
import {
  canMigrateFrameToV2,
  copyFrameSources,
  discard,
  listFolderNames,
  planFrameV2Migration,
  readFrameSourceGraph,
  repointPodFrameReferences,
  rollbackFrameV2Layout,
  storeEntrySourceAsText,
} from "@app/lib/api/frames/migrate_to_v2/utils";
import type { Authenticator } from "@app/lib/auth";
import type { LegacyFrameIdentity } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type {
  MigratedFrameV2,
  MigrateFrameToV2Params,
} from "@app/lib/api/frames/migrate_to_v2/types";

/** The Frame was left on v1, the outcome of every path that is not a completed migration. */
const DECLINED = new Ok(null);

/**
 * Every step of the migration, with the rollback that keeps a half-done one from shipping.
 * Wrapped by {@link migrateFrameToV2}, which is what callers are allowed to depend on.
 */
/**
 * @cc [owner:pmilliotte,label:product] lazy-frame-migration-never-fails-the-edit
 * A v1 to v2 Frame migration MUST NOT propagate a failure to its caller. Every outcome other
 * than a completed migration resolves to `Ok(null)`, leaving a working legacy Frame whose
 * content type, name, mount path and metadata are unchanged and whose sources are still where
 * the legacy publish path expects them. The edit or publish that triggered the migration is
 * therefore always free to carry on through the legacy path.
 */
/**
 * @cc [owner:pmilliotte,label:product] migrated-frame-entry-is-stored-as-source
 * Once the v2 publication succeeded, the package's entry MUST be stored as `text/plain`, the
 * content type the canonical write path gives a source file, not the Frame content type it
 * carried as a legacy entry or inherited from the copy that relocated it. The manifest is the
 * Frame; an entry still stored as a Frame is listed and opened as a second one beside it. A
 * storage failure leaves the stale type in place and MUST NOT fail the migration.
 */
/**
 * Migrate one legacy Frame to Frames v2 in place, keeping its `sId`. Returns null when the Frame
 * was left on v1.
 *
 * Ordering is what makes this safe: everything before the publication is additive, so the legacy
 * Frame keeps rendering throughout, and the row flip and the copies are undone together if the
 * publication fails. Only a successful publication removes the original sources.
 *
 * `publish` is injected because only the caller can reach the Frame's conversation, which the v2
 * publication path requires. What this produces is held to a native create by the
 * `frame-v2-creation-and-migration-agree` contract on
 * {@link registerFrameV2FromSourceUsingFileSystem}.
 */
async function runFrameV2Migration<T>(
  auth: Authenticator,
  { dustFs, entryScopedPath, frame, publish }: MigrateFrameToV2Params<T>
): Promise<Result<MigratedFrameV2<T> | null, Error>> {
  // -------------------------------------------------------------------------
  // Step 1 — decline every Frame that has to stay on v1.
  // -------------------------------------------------------------------------

  const isMigratable = await canMigrateFrameToV2(auth, dustFs, frame);
  if (!isMigratable) {
    return DECLINED;
  }

  // -------------------------------------------------------------------------
  // Step 2 — plan the package from the Frame's import graph, which doubles as
  // the gate on whether it builds as v2.
  // -------------------------------------------------------------------------

  const entryRoot = path.posix.dirname(entryScopedPath);
  const graph = await readFrameSourceGraph(dustFs, {
    entryRoot,
    entryRelPath: path.posix.basename(entryScopedPath),
  });
  if (graph.isErr()) {
    logger.info(
      { fileId: frame.sId, err: graph.error },
      "migrateFrameToV2: Frame source does not build as v2, leaving it on v1"
    );

    return DECLINED;
  }

  const plan = planFrameV2Migration({
    frame,
    entryScopedPath,
    sourceScopedPaths: graph.value,
    takenFolderNames: await listFolderNames(dustFs, entryRoot),
  });
  if (plan.isErr()) {
    logger.info(
      { fileId: frame.sId, err: plan.error },
      "migrateFrameToV2: Frame cannot be laid out as a v2 package"
    );

    return DECLINED;
  }

  const {
    folderScopedPath,
    manifestScopedPath,
    manifest,
    relocations,
    uiEntryPoint,
  } = plan.value;

  const existingManifest = await dustFs.readBuffer(manifestScopedPath);
  if (existingManifest.isOk() && existingManifest.value !== null) {
    logger.info(
      { fileId: frame.sId, manifestScopedPath },
      "migrateFrameToV2: a manifest already occupies the target folder"
    );

    return DECLINED;
  }

  const mountFilePath = dustFs.toMountFilePath(manifestScopedPath);
  if (!mountFilePath) {
    return DECLINED;
  }

  // -------------------------------------------------------------------------
  // Step 3 — lay the package out additively, so the Frame keeps working as v1
  // throughout.
  // -------------------------------------------------------------------------

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const written: string[] = [];
  // Set once the row is flipped, so the rollback below knows whether to restore it. Both steps
  // share one catch: a publisher that throws has to undo exactly what one returning `Err` does.
  let previousIdentity: LegacyFrameIdentity | null = null;
  let published: T;

  try {
    const copied = await copyFrameSources(dustFs, relocations);
    written.push(...copied.writtenScopedPaths);
    if (copied.error) {
      throw copied.error;
    }

    const manifestWrite = await dustFs.write(
      manifestScopedPath,
      manifestContent,
      FRAME_PACKAGE_FILE_CONTENT_TYPE
    );
    if (manifestWrite.isErr()) {
      throw manifestWrite.error;
    }
    written.push(manifestScopedPath);

    // ---------------------------------------------------------------------
    // Step 4 — flip the row onto the manifest and publish it. A failed
    // publication undoes both.
    // ---------------------------------------------------------------------

    previousIdentity = await frame.convertToFrameV2Manifest({
      fileSize: Buffer.byteLength(manifestContent),
      mountFilePath,
    });

    const publication = await publish(frame);
    if (publication.isErr()) {
      throw publication.error;
    }
    published = publication.value;
  } catch (err) {
    await rollbackFrameV2Layout(dustFs, frame, {
      previousIdentity,
      writtenScopedPaths: written,
    });
    logger.info(
      { fileId: frame.sId, err: normalizeError(err), folderScopedPath },
      "migrateFrameToV2: could not complete the upgrade, Frame kept on v1"
    );

    return DECLINED;
  }

  // -------------------------------------------------------------------------
  // Step 5 — retire the v1 sources and everything still pointing at them.
  // -------------------------------------------------------------------------

  // The Frame is migrated and published by now, so nothing here can change that outcome. A
  // cleanup that fails leaves stale objects or a stale reference, never a broken Frame.
  try {
    await discard(
      dustFs,
      relocations.map(({ from }) => from)
    );

    await storeEntrySourceAsText(
      dustFs,
      frame,
      `${folderScopedPath}/${uiEntryPoint}`
    );

    await repointPodFrameReferences(auth, frame, {
      from: entryScopedPath,
      to: manifestScopedPath,
    });
  } catch (err) {
    logger.error(
      { fileId: frame.sId, err: normalizeError(err), manifestScopedPath },
      "migrateFrameToV2: Frame migrated but its cleanup did not finish"
    );
  }

  logger.info(
    { fileId: frame.sId, manifestScopedPath, folderScopedPath },
    "migrateFrameToV2: Frame migrated to v2"
  );

  return new Ok({ frame, published });
}

/**
 * The guarded entry point. A step that throws instead of returning `Err` — a publisher
 * answering 404, a storage client raising — must decline like any other failure, or the edit
 * that triggered the upgrade fails with it.
 */
export async function migrateFrameToV2<T>(
  auth: Authenticator,
  params: MigrateFrameToV2Params<T>
): Promise<Result<MigratedFrameV2<T> | null, Error>> {
  try {
    return await runFrameV2Migration(auth, params);
  } catch (err) {
    logger.error(
      { fileId: params.frame.sId, err: normalizeError(err) },
      "migrateFrameToV2: unexpected failure, Frame kept on v1"
    );

    return DECLINED;
  }
}
