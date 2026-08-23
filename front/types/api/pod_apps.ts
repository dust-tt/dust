import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
} from "@app/types/api/sandbox_functions";
import { z } from "zod";

/**
 * A Pod app is a folder at the pod root that owns a Frame, published functions and databases. It has
 * no record of its own: the folder IS the app, and its identity is the app prefix `deriveAppPrefix`
 * computes from the folder name — the same prefix that already namespaces published function slugs
 * and database filenames. So these types describe a view assembled at read time, never stored.
 */

export type PodAppFrame = {
  /** sId of the Frame's FileResource, or null for a source file with no row yet. */
  fileId: string | null;
  fileName: string;
  /** Canonical scoped path, e.g. `pod-{podId}/MyApp/MyApp.tsx`. */
  path: string;
  /** Whether the Frame has been published (a built bundle exists). */
  isPublished: boolean;
  /** Whether the Frame is pinned as one of the Pod's nav tabs. */
  isPinnedAsTab: boolean;
};

export type PodAppFunction = {
  /**
   * Full published slug, app prefix included, e.g. `myapp__list-notes`. This is what addresses the
   * function everywhere — `call`, `unpublish`, a Frame's reference.
   */
  slug: string;
  /** The slug without its app prefix, e.g. `list-notes`. Display only. */
  name: string;
  description: string;
  executionMode: SandboxFunctionExecutionMode;
  /** The approval level a tool derived from this function starts at. */
  defaultStake: SandboxFunctionStake;
};

export type PodAppDatabase = {
  /**
   * App-relative name, e.g. `chat` — what the schema file declares and `db()` opens.
   */
  name: string;
  /** On-disk name, app prefix included, e.g. `myapp__chat`. What the db tools address. */
  onDiskName: string;
};

export type PodApp = {
  /**
   * The normalized app prefix, which is this app's identifier — apps have no sId.
   */
  prefix: string;
  /** The folder name as authored (`TaskList`), falling back to the prefix if the folder is gone. */
  name: string;
  /** The manifest's display name, or null when the folder has no (valid) manifest. */
  displayName: string | null;
  /** The manifest's description, or null when the folder has no (valid) manifest. */
  description: string | null;
  /** Why the folder's manifest.json could not be used, or null when absent or valid. */
  manifestError: string | null;
  /** Canonical scoped path of the app folder, or null when only published artifacts remain. */
  folderPath: string | null;
  frames: PodAppFrame[];
  functions: PodAppFunction[];
  databases: PodAppDatabase[];
  fileCount: number;
  /**
   * Folder names that normalize onto this same prefix. More than one means the folders silently
   * share published slugs and databases, so the UI warns instead of merging them quietly.
   */
  collidingFolderNames: string[];
};

export type GetPodAppsResponseBody = {
  apps: PodApp[];
};

/**
 * An app's prefix is its identifier — apps have no sId, since the folder is the app. Constrained to
 * what `normalizeAppPrefix` can produce, so a path segment can never smuggle anything else in.
 */
export const DeletePodAppParamsSchema = z.object({
  prefix: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
});

/** Max app folder name length, matching what a prefix can be derived from comfortably. */
export const MAX_POD_APP_NAME_LENGTH = 128;

export const ClonePodAppRequestBodySchema = z.object({
  name: z.string().min(1).max(MAX_POD_APP_NAME_LENGTH),
});

/** What a clone created, as the business layer reports it and the endpoint returns it. */
export type PodAppCloneSummary = {
  prefix: string;
  name: string;
  copiedFileCount: number;
  clonedFrameNames: string[];
  publishedFunctionSlugs: string[];
  reconciledDatabaseNames: string[];
  /** Functions or databases the copy had no source for, so they were not recreated. */
  skipped: string[];
};

export type ClonePodAppResponseBody = {
  app: PodAppCloneSummary;
};

/** What a delete removed, as the business layer reports it and the endpoint returns it. */
export type PodAppDeleteSummary = {
  prefix: string;
  name: string;
  deletedFunctionSlugs: string[];
  deletedDatabaseNames: string[];
  deletedFolderNames: string[];
};

export type DeletePodAppResponseBody = {
  app: PodAppDeleteSummary;
};
