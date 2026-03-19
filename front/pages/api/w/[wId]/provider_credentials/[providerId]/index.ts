/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { apiError } from "@app/logger/withlogging";
import { BYOK_MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const ProviderCredentialBodySchema = z.object({
  apiKey: z.string(),
});

export type ProviderCredentialBody = z.infer<
  typeof ProviderCredentialBodySchema
>;

const ProviderCredentialParamsSchema = z.object({
  providerId: z.enum(BYOK_MODEL_PROVIDER_IDS),
});

export type ProviderCredentialResponseBody = {
  providerCredential: ProviderCredentialType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ProviderCredentialResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can manage provider credentials.",
      },
    });
  }

  const plan = auth.getNonNullablePlan();
  if (!plan.isByok) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "BYOK is not enabled on this workspace's plan.",
      },
    });
  }

  const paramsValidation = ProviderCredentialParamsSchema.safeParse(req.query);
  if (!paramsValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request params are invalid: ${paramsValidation.error.message}.`,
      },
    });
  }

  const { providerId } = paramsValidation.data;

  switch (req.method) {
    case "POST": {
      const bodyValidation = ProviderCredentialBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${bodyValidation.error.message}.`,
          },
        });
      }

      const { apiKey } = bodyValidation.data;

      const providerCredential = await ProviderCredentialResource.makeNew(
        auth,
        { providerId, apiKey }
      );

      if (!providerCredential) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The provided credentials are invalid or could not be verified.",
          },
        });
      }

      return res.status(201).json({
        providerCredential: providerCredential.toJSON(),
      });
    }

    case "PATCH": {
      const bodyValidation = ProviderCredentialBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${bodyValidation.error.message}.`,
          },
        });
      }

      const { apiKey } = bodyValidation.data;

      const existing = await ProviderCredentialResource.fetchByProvider(
        auth,
        providerId
      );

      if (!existing) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "provider_not_found",
            message: `No credential found for provider ${providerId}.`,
          },
        });
      }

      const providerCredential = await existing.updateApiKey(auth, { apiKey });

      if (!providerCredential) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The provided credentials are invalid or could not be verified.",
          },
        });
      }

      return res.status(200).json({
        providerCredential: providerCredential.toJSON(),
      });
    }

    case "DELETE": {
      const existing = await ProviderCredentialResource.fetchByProvider(
        auth,
        providerId
      );

      if (!existing) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "provider_not_found",
            message: `No credential found for provider ${providerId}.`,
          },
        });
      }

      const deleteResult = await existing.delete(auth);

      if (deleteResult.isErr() || !deleteResult.value) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to delete credential for provider ${providerId}.`,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
