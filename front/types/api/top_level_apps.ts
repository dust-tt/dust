/**
 * An App is a Pod marked with `isApp`: one App per Pod, rendered by the full-screen App builder
 * rather than the Pod page. These types describe the App list and the App creation response; the
 * App's own state is read from the Pod itself (`RichSpaceType`).
 *
 * Named "top level" to keep it apart from legacy Dust Apps (`types/api/apps.ts`) and from the
 * Frame-plus-functions folders inside a Pod (`types/api/pod_apps.ts`), which an App contains.
 */

export type TopLevelAppType = {
  /** sId of the Pod backing this App. */
  sId: string;
  name: string;
  /** sId of the App's single continuous conversation. */
  appConversationId: string | null;
  updatedAt: number;
};

export type GetTopLevelAppsResponseBody = {
  apps: TopLevelAppType[];
};

export type PostTopLevelAppResponseBody = {
  app: TopLevelAppType;
};
