import { appPrefixFromSlug } from "@app/lib/api/sandbox_functions/slug";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { PodAppShareSummary } from "@app/types/api/pod_apps";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type PodAppShareErrorCode =
  | "not_a_pod"
  | "not_found"
  | "no_functions"
  | "name_taken"
  | "already_shared"
  | "not_shared"
  | "internal";

export class PodAppShareError extends Error {
  constructor(
    readonly code: PodAppShareErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PodAppShareError";
  }
}

/**
 * View and server-instance mutations are admin-gated at the resource layer, while sharing is a
 * pod editor's gesture: the caller's editorship is checked here (and by the route's withSpace),
 * then the workspace-level artifacts are created under an internal admin authenticator.
 */
async function internalAdminAuth(auth: Authenticator): Promise<Authenticator> {
  return Authenticator.internalAdminForWorkspace(
    auth.getNonNullableWorkspace().sId
  );
}

/**
 * Share a pod app to the workspace as an agent toolset: mint a pod_app_toolset server instance,
 * create its system + global views, and record the binding. Not one DB transaction — the
 * instance/view APIs are not transactional — so the share row comes last and a failure cleans
 * the views up for a clean retry.
 */
export async function sharePodApp(
  auth: Authenticator,
  pod: SpaceResource,
  {
    prefix,
    name,
    description,
  }: { prefix: string; name?: string; description: string }
): Promise<Result<PodAppShareSummary, PodAppShareError>> {
  if (!pod.isProject()) {
    return new Err(new PodAppShareError("not_a_pod", "Not a pod."));
  }
  if (!pod.canAdministrate(auth)) {
    return new Err(
      new PodAppShareError("not_found", `No app "${prefix}" in this pod.`)
    );
  }

  const existing = await PodAppShareResource.fetchByPodAndAppName(
    auth,
    pod,
    prefix
  );
  if (existing) {
    return new Err(
      new PodAppShareError("already_shared", "This app is already shared.")
    );
  }

  const sandboxFunctions = await SandboxFunctionResource.listBySpace(auth, pod);
  const appFunctions = sandboxFunctions.filter(
    (sandboxFunction) => appPrefixFromSlug(sandboxFunction.slug) === prefix
  );
  if (appFunctions.length === 0) {
    return new Err(
      new PodAppShareError(
        "no_functions",
        "This app has no published functions to share."
      )
    );
  }

  const toolsetName = name ?? prefix;
  const adminAuth = await internalAdminAuth(auth);
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
  const { hasConflict } =
    await MCPServerViewResource.hasNameConflictInSpaceByName(
      adminAuth,
      toolsetName,
      globalSpace
    );
  if (hasConflict) {
    return new Err(
      new PodAppShareError(
        "name_taken",
        `A tool named "${toolsetName}" already exists in this workspace.`
      )
    );
  }

  const server = await InternalMCPServerInMemoryResource.makeNew(adminAuth, {
    name: "pod_app_toolset",
    useCase: null,
    viewName: toolsetName,
    viewDescription: description,
  });

  try {
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        server.id
      );
    if (!systemView) {
      throw new Error("Missing system view after server creation.");
    }
    await MCPServerViewResource.create(adminAuth, {
      systemView,
      space: globalSpace,
    });

    const share = await PodAppShareResource.makeNew(auth, {
      space: pod,
      appName: prefix,
      internalMCPServerId: server.id,
      toolsetName,
      description,
    });

    return new Ok(share.toJSON());
  } catch (error) {
    // Best-effort cleanup: without the share row the views are orphans; remove them so a retry
    // can start clean.
    const views = await MCPServerViewResource.listByMCPServer(
      adminAuth,
      server.id
    );
    for (const view of views) {
      await view.delete(adminAuth, { hardDelete: true });
    }
    logger.error(
      { error: normalizeError(error), podId: pod.sId, prefix },
      "Failed to create pod app share; cleaned up views."
    );
    return new Err(
      new PodAppShareError("internal", normalizeError(error).message)
    );
  }
}

export async function unsharePodApp(
  auth: Authenticator,
  pod: SpaceResource,
  prefix: string
): Promise<Result<undefined, PodAppShareError>> {
  const share = await PodAppShareResource.fetchByPodAndAppName(
    auth,
    pod,
    prefix
  );
  if (!share) {
    return new Err(
      new PodAppShareError("not_shared", "This app is not shared.")
    );
  }
  if (!pod.canAdministrate(auth)) {
    return new Err(
      new PodAppShareError("not_found", `No app "${prefix}" in this pod.`)
    );
  }

  const adminAuth = await internalAdminAuth(auth);
  const views = await MCPServerViewResource.listByMCPServer(
    adminAuth,
    share.internalMCPServerId
  );
  for (const view of views) {
    await view.delete(adminAuth, { hardDelete: false });
  }
  await share.revoke(auth);

  return new Ok(undefined);
}

export async function updatePodAppShare(
  auth: Authenticator,
  pod: SpaceResource,
  prefix: string,
  { name, description }: { name?: string; description?: string }
): Promise<Result<PodAppShareSummary, PodAppShareError>> {
  const share = await PodAppShareResource.fetchByPodAndAppName(
    auth,
    pod,
    prefix
  );
  if (!share) {
    return new Err(
      new PodAppShareError("not_shared", "This app is not shared.")
    );
  }
  if (!pod.canAdministrate(auth)) {
    return new Err(
      new PodAppShareError("not_found", `No app "${prefix}" in this pod.`)
    );
  }

  const adminAuth = await internalAdminAuth(auth);
  const views = await MCPServerViewResource.listByMCPServer(
    adminAuth,
    share.internalMCPServerId
  );

  if (name && name !== share.toolsetName) {
    const globalSpace =
      await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
    const globalView = views.find((view) => view.space.kind === "global");
    const { hasConflict } =
      await MCPServerViewResource.hasNameConflictInSpaceByName(
        adminAuth,
        name,
        globalSpace,
        [],
        { excludedMCPServerViewId: globalView?.sId }
      );
    if (hasConflict) {
      return new Err(
        new PodAppShareError(
          "name_taken",
          `A tool named "${name}" already exists in this workspace.`
        )
      );
    }
  }

  for (const view of views) {
    const updateResult = await view.updateNameAndDescription(
      adminAuth,
      name,
      description
    );
    if (updateResult.isErr()) {
      return new Err(
        new PodAppShareError("internal", updateResult.error.message)
      );
    }
  }
  await share.updateShareDetails({ toolsetName: name, description });

  return new Ok(share.toJSON());
}

/**
 * Scrub-time cleanup, called when a pod is deleted: hard-delete every share row of the pod and
 * the server views bound to them.
 */
export async function scrubPodAppSharesForSpace(
  auth: Authenticator,
  space: SpaceResource
): Promise<void> {
  const shares = await PodAppShareResource.deleteAllForSpace(auth, space);
  // O(n) view fetches acceptable: a pod holds a handful of shared apps at most.
  for (const share of shares) {
    const views = await MCPServerViewResource.listByMCPServer(
      auth,
      share.internalMCPServerId
    );
    for (const view of views) {
      await view.delete(auth, { hardDelete: true });
    }
  }
}
