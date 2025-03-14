import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

export async function softDeleteApp(
  auth: Authenticator,
  app: AppResource
): Promise<Result<void, Error>> {
  const res = await app.delete(auth, { hardDelete: false });
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}

export async function hardDeleteApp(
  auth: Authenticator,
  app: AppResource
): Promise<Result<void, Error>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const deleteProjectRes = await coreAPI.deleteProject({
    projectId: app.dustAPIProjectId,
  });
  if (deleteProjectRes.isErr()) {
    return new Err(new Error(deleteProjectRes.error.message));
  }

  const res = await app.delete(auth, { hardDelete: true });
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}

export async function cloneAppToWorkspace(
  auth: Authenticator,
  app: AppResource,
  targetWorkspace: LightWorkspaceType,
  targetSpace: SpaceResource
): Promise<Result<AppResource, Error>> {
  // Only dust super users can clone apps. Authenticator has no write permissions
  // on the target workspace.
  if (!auth.isDustSuperUser()) {
    throw new Error("Only dust super users can clone apps");
  }
  if (targetWorkspace.id !== targetSpace.workspaceId) {
    return new Err(new Error("Target space must belong to target workspace"));
  }

  // Handle CoreAPI project cloning.
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const cloneRes = await coreAPI.cloneProject({
    projectId: app.dustAPIProjectId,
  });
  if (cloneRes.isErr()) {
    return new Err(new Error(cloneRes.error.message));
  }

  // Use the resource to handle the clone operation.
  return app.clone(auth, targetWorkspace, targetSpace, {
    dustAPIProjectId: cloneRes.value.project.project_id.toString(),
  });
}
