import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";

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
   * The normalized app prefix, which is this app's identifier — apps have no sId. Empty string for
   * the synthetic "unfiled" app collecting artifacts published from the pod root.
   */
  prefix: string;
  /** The folder name as authored (`TaskList`), or null for the unfiled app. */
  name: string | null;
  /** Canonical scoped path of the app folder, or null for the unfiled app. */
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
