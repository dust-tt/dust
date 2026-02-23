import config from "@app/lib/api/config";
import type { SandboxProvider } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface EnsureSandboxResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

export async function ensureSandboxActive(
  auth: Authenticator,
  conversationId: ModelId,
  provider: SandboxProvider
): Promise<Result<EnsureSandboxResult, Error>> {
  const e2bConfig = config.getE2BSandboxConfig();
  const templateId = e2bConfig?.templateId;

  const existing = await SandboxResource.fetchByConversationId(
    auth,
    conversationId
  );

  // No existing sandbox — create one.
  if (!existing) {
    try {
      const handle = await provider.create({ templateId });
      const sandbox = await SandboxResource.makeNew(auth, {
        conversationId,
        providerId: handle.providerId,
        status: "running",
      });

      logger.info(
        { sandbox: sandbox.toLogJSON() },
        "Created new sandbox for conversation"
      );

      return new Ok({ sandbox, freshlyCreated: true });
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  const { status } = existing;

  switch (status) {
    case "running": {
      await existing.updateLastActivityAt();

      return new Ok({ sandbox: existing, freshlyCreated: false });
    }

    case "sleeping": {
      try {
        await provider.wake(existing.providerId);
        await existing.updateStatus("running");
        await existing.updateLastActivityAt();

        logger.info({ sandbox: existing.toLogJSON() }, "Woke sleeping sandbox");

        return new Ok({ sandbox: existing, freshlyCreated: false });
      } catch (err) {
        return new Err(normalizeError(err));
      }
    }

    case "deleted": {
      try {
        const handle = await provider.create({ templateId });
        await existing.updateForRecreation(handle.providerId);

        logger.info(
          {
            sandbox: existing.toLogJSON(),
            newProviderId: handle.providerId,
          },
          "Recreated sandbox from deleted state"
        );

        return new Ok({ sandbox: existing, freshlyCreated: true });
      } catch (err) {
        return new Err(normalizeError(err));
      }
    }

    default:
      assertNever(status);
  }
}
