import {
  checkEgressForwarderHealth,
  setupEgressForwarder,
} from "@app/lib/api/sandbox/egress";
import { ensureConversationFilesMounted } from "@app/lib/api/sandbox/gcs/mount";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok, type Result } from "@app/types/shared/result";

// /!\ All sandbox-touching tools must use this helper rather than calling
// SandboxResource.ensureActive directly, otherwise the GCS FUSE mount and
// egress forwarder bring-up will be skipped.
export async function ensureSandboxReady(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<SandboxResource, Error>> {
  const ensureResult = await SandboxResource.ensureActive(auth, conversation);
  if (ensureResult.isErr()) {
    return ensureResult;
  }

  const { sandbox, freshlyCreated } = ensureResult.value;

  // Egress forwarder setup must run BEFORE GCS mounts. When the MITM
  // experiment is enabled, sandbox_resource.buildSandboxEnvVars exports
  // SSL_CERT_FILE / CURL_CA_BUNDLE pointing at /etc/dust/ca-bundle.pem, which
  // setupEgressForwarder is responsible for creating. Mounting (gcsfuse and
  // friends) makes HTTPS calls that read the trust bundle via those env vars,
  // so the bundle has to exist first.
  if (freshlyCreated) {
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return setupResult;
    }
  }

  const imageResult = getSandboxImage(auth);
  if (imageResult.isErr()) {
    logger.error(
      { err: imageResult.error },
      "Failed to get sandbox image for GCS mount"
    );
    return imageResult;
  }
  const image = imageResult.value;

  void startTelemetry(auth, sandbox, conversation).catch((err) =>
    logger.error({ err }, "Telemetry start failed (fire-and-forget)")
  );

  // ensureConversationFilesMounted is idempotent: it probes the mount and
  // token server, refreshes the token if both are alive, and otherwise
  // rebuilds local state and remounts. No need to branch on freshlyCreated
  // / wokeFromSleep here.
  const mountResult = await ensureConversationFilesMounted(
    auth,
    sandbox,
    conversation,
    image
  );
  if (mountResult.isErr()) {
    return mountResult;
  }

  const healthResult = await checkEgressForwarderHealth(auth, sandbox);
  if (healthResult.isErr()) {
    return healthResult;
  }

  if (!healthResult.value) {
    logger.warn(
      {
        event: "egress.health_fail",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check failed, restarting"
    );
    const setupResult = await setupEgressForwarder(auth, sandbox);
    if (setupResult.isErr()) {
      return setupResult;
    }
  } else {
    logger.info(
      {
        event: "egress.health_ok",
        providerId: sandbox.providerId,
        sandboxId: sandbox.sId,
      },
      "Sandbox egress forwarder health check succeeded"
    );
  }

  return new Ok(sandbox);
}
