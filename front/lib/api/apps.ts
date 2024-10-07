import type { Result } from "@dust-tt/types";
import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";

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
