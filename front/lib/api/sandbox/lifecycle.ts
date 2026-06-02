import {
  ensureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount,
} from "@app/lib/api/sandbox/egress";
import {
  mountConversationFiles,
  refreshGcsToken,
} from "@app/lib/api/sandbox/gcs/mount";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import {
  recordSandboxStartupTotal,
  traceSandboxStartupPhase,
} from "@app/lib/api/sandbox/instrumentation";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok, type Result } from "@app/types/shared/result";

export interface EnsureSandboxReadyResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

// /!\ All sandbox-touching tools must use this helper rather than calling
// SandboxResource.ensureActive directly, otherwise the GCS FUSE mount and
// egress forwarder bring-up will be skipped.
export async function ensureSandboxReady(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  const startMs = performance.now();
  // cold is unknown until ensureActive returns; if it errors first (rare) we
  // record the failure as a warm attempt.
  let cold = false;
  let status: "success" | "error" = "success";

  try {
    return await traceSandboxStartupPhase("total", async () => {
      const ensureResult = await traceSandboxStartupPhase(
        "provider_ensure",
        () => SandboxResource.ensureActive(auth, conversation)
      );
      if (ensureResult.isErr()) {
        status = "error";
        return ensureResult;
      }

      const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;
      cold = freshlyCreated;

      // Egress prep must run BEFORE GCS mounts.
      // sandbox_resource.buildSandboxEnvVars exports replace-style trust env
      // vars pointing at /etc/dust/ca-bundle.pem. The image seeds that path
      // with system roots; forwarder setup later merges in the dsbx CA.
      // Mounting (gcsfuse and friends) can make HTTPS calls that read the
      // trust bundle, so the path has to be valid first.
      if (freshlyCreated) {
        const prepResult = await traceSandboxStartupPhase("egress_prep", () =>
          prepareSandboxEgressBeforeMount(auth, sandbox)
        );
        if (prepResult.isErr()) {
          status = "error";
          return prepResult;
        }
      }

      // Synchronous and cheap: not worth a span (it would always read ~0ms).
      const imageResult = getSandboxImage(auth);
      if (imageResult.isErr()) {
        logger.error(
          { err: imageResult.error },
          "Failed to get sandbox image for GCS mount"
        );
        status = "error";
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
        const mountResult = await traceSandboxStartupPhase("gcs_mount", () =>
          mountConversationFiles(auth, sandbox, conversation, image)
        );
        if (mountResult.isErr()) {
          status = "error";
          return mountResult;
        }
      } else {
        const refreshResult = await traceSandboxStartupPhase(
          "gcs_refresh",
          () => refreshGcsToken(auth, sandbox, conversation, image)
        );
        if (refreshResult.isErr()) {
          status = "error";
          return refreshResult;
        }
      }

      const ensureEgressResult = await traceSandboxStartupPhase(
        "egress_on_exec",
        () => ensureSandboxEgressOnExec(auth, sandbox, { wokeFromSleep })
      );
      if (ensureEgressResult.isErr()) {
        status = "error";
        return ensureEgressResult;
      }

      return new Ok({ sandbox, freshlyCreated });
    });
  } finally {
    recordSandboxStartupTotal(performance.now() - startMs, { cold }, status);
  }
}
