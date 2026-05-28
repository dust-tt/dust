import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { BYOK_MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ProviderCredentialBodySchema = z.object({
  apiKey: z.string(),
});

const ProviderCredentialParamsSchema = z.object({
  providerId: z.enum(BYOK_MODEL_PROVIDER_IDS),
});

export type ProviderCredentialResponseBody = {
  providerCredential: ProviderCredentialType;
};

// Mounted at /api/w/:wId/provider_credentials/:providerId.
const app = workspaceApp();

app.post(
  "/",
  ensureIsAdmin(),
  validate("param", ProviderCredentialParamsSchema),
  validate("json", ProviderCredentialBodySchema),
  async (ctx): HandlerResult<ProviderCredentialResponseBody> => {
    const auth = ctx.get("auth");

    const plan = auth.getNonNullablePlan();
    if (!plan.isByok) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "BYOK is not enabled on this workspace's plan.",
        },
      });
    }

    const { providerId } = ctx.req.valid("param");
    const { apiKey } = ctx.req.valid("json");

    const providerCredential = await ProviderCredentialResource.makeNew(auth, {
      providerId,
      apiKey,
    });

    if (!providerCredential) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The provided credentials are invalid or could not be verified.",
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "credentials.created",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("credential", {
          sId: providerCredential.sId,
          name: providerId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        provider_id: providerId,
      },
    });

    return ctx.json(
      {
        providerCredential: providerCredential.toJSON(),
      },
      201
    );
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("param", ProviderCredentialParamsSchema),
  validate("json", ProviderCredentialBodySchema),
  async (ctx): HandlerResult<ProviderCredentialResponseBody> => {
    const auth = ctx.get("auth");

    const plan = auth.getNonNullablePlan();
    if (!plan.isByok) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "BYOK is not enabled on this workspace's plan.",
        },
      });
    }

    const { providerId } = ctx.req.valid("param");
    const { apiKey } = ctx.req.valid("json");

    const existing = await ProviderCredentialResource.fetchByProvider(
      auth,
      providerId
    );

    if (!existing) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "provider_not_found",
          message: `No credential found for provider ${providerId}.`,
        },
      });
    }

    const providerCredential = await existing.updateApiKey(auth, { apiKey });

    if (!providerCredential) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The provided credentials are invalid or could not be verified.",
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "credentials.updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("credential", {
          sId: providerCredential.sId,
          name: providerId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        provider_id: providerId,
      },
    });

    return ctx.json({
      providerCredential: providerCredential.toJSON(),
    });
  }
);

app.delete(
  "/",
  ensureIsAdmin(),
  validate("param", ProviderCredentialParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const plan = auth.getNonNullablePlan();
    if (!plan.isByok) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "BYOK is not enabled on this workspace's plan.",
        },
      });
    }

    const { providerId } = ctx.req.valid("param");

    const existing = await ProviderCredentialResource.fetchByProvider(
      auth,
      providerId
    );

    if (!existing) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "provider_not_found",
          message: `No credential found for provider ${providerId}.`,
        },
      });
    }

    const deleteResult = await existing.delete(auth);

    if (deleteResult.isErr() || !deleteResult.value) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to delete credential for provider ${providerId}.`,
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "credentials.revoked",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("credential", {
          sId: existing.sId,
          name: providerId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        provider_id: providerId,
        reason: "user_deleted",
      },
    });

    return ctx.body(null, 204);
  }
);

export default app;
