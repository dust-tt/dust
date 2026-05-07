import {
  ensureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount,
} from "@app/lib/api/sandbox/egress";
import {
  mountConversationFiles,
  refreshGcsToken,
} from "@app/lib/api/sandbox/gcs/mount";
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

  const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;

  // Egress prep must run BEFORE GCS mounts. When the MITM experiment is
  // enabled, sandbox_resource.buildSandboxEnvVars exports SSL_CERT_FILE /
  // CURL_CA_BUNDLE pointing at /etc/dust/ca-bundle.pem, which the forwarder
  // setup is responsible for creating. Mounting (gcsfuse and friends) makes
  // HTTPS calls that read the trust bundle via those env vars, so the bundle
  // has to exist first.
  if (freshlyCreated) {
    const prepResult = await prepareSandboxEgressBeforeMount(auth, sandbox);
    if (prepResult.isErr()) {
      return prepResult;
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

  // Only mount on first creation. e2b preserves the FUSE mount and the
  // token server across betaPause + connect (verified empirically), so on
  // wake we just need a fresh GCS access token in /tmp/token.json (the
  // running token server will hand it to gcsfuse on the next request).
  if (freshlyCreated) {
    const mountResult = await mountConversationFiles(
      auth,
      sandbox,
      conversation,
      image
    );
    if (mountResult.isErr()) {
      return mountResult;
    }
  } else {
    const refreshResult = await refreshGcsToken(
      auth,
      sandbox,
      conversation,
      image
    );
    if (refreshResult.isErr()) {
      return refreshResult;
    }
  }

  const ensureEgressResult = await ensureSandboxEgressOnExec(auth, sandbox, {
    wokeFromSleep,
  });
  if (ensureEgressResult.isErr()) {
    return ensureEgressResult;
  }

  return new Ok(sandbox);
}
