import apiConfig from "@app/lib/api/config";
import { NorthflankSandboxClient } from "@app/lib/api/sandbox/client";
import logger from "@app/logger/logger";

async function getSandboxClient(): Promise<NorthflankSandboxClient> {
  const apiToken = apiConfig.getNorthflankApiToken();
  if (!apiToken) {
    throw new Error("NORTHFLANK_API_TOKEN not configured");
  }
  return NorthflankSandboxClient.create(apiToken);
}

export interface PauseSandboxActivityArgs {
  serviceName: string;
}

export async function pauseSandboxActivity({
  serviceName,
}: PauseSandboxActivityArgs): Promise<void> {
  logger.info({ serviceName }, "[sandbox-lifecycle] Pausing sandbox");

  const client = await getSandboxClient();
  const status = await client.getServiceByName(serviceName);

  if (!status) {
    logger.info(
      { serviceName },
      "[sandbox-lifecycle] Sandbox not found, skipping pause"
    );
    return;
  }

  if (status.isPaused) {
    logger.info(
      { serviceName },
      "[sandbox-lifecycle] Sandbox already paused"
    );
    return;
  }

  const sandbox = client.attach(status.info);
  await sandbox.pause();

  logger.info({ serviceName }, "[sandbox-lifecycle] Sandbox paused");
}

export interface DestroySandboxActivityArgs {
  serviceName: string;
}

export async function destroySandboxActivity({
  serviceName,
}: DestroySandboxActivityArgs): Promise<void> {
  logger.info({ serviceName }, "[sandbox-lifecycle] Destroying sandbox");

  const client = await getSandboxClient();
  const status = await client.getServiceByName(serviceName);

  if (!status) {
    logger.info(
      { serviceName },
      "[sandbox-lifecycle] Sandbox not found, skipping destroy"
    );
    return;
  }

  const sandbox = client.attach(status.info);
  await sandbox.destroy();

  logger.info({ serviceName }, "[sandbox-lifecycle] Sandbox destroyed");
}
