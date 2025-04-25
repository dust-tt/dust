import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { FreshServiceError } from "@app/temporal/labs/connections/providers/freshservice/client";
import { FreshServiceClient } from "@app/temporal/labs/connections/providers/freshservice/client";
import { HubspotClient } from "@app/temporal/labs/connections/providers/hubspot/client";
import type { WithAPIErrorResponse } from "@app/types";
import {
  FreshServiceCredentialsSchema,
  HubspotCredentialsSchema,
} from "@app/types";

const TestCredentialsBodyCodec = t.union([
  t.type({
    provider: t.literal("hubspot"),
    credentials: HubspotCredentialsSchema,
  }),
  t.type({
    provider: t.literal("freshservice"),
    credentials: FreshServiceCredentialsSchema,
  }),
]);

async function testHubspotCredentials(
  credentials: t.TypeOf<typeof HubspotCredentialsSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new HubspotClient(credentials.accessToken);
    const result = await client.testCredentials();

    if (result.isErr()) {
      logger.error({ error: result.error }, "Hubspot test credentials failed");
      return {
        success: false,
        error: result.error.message,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error({ error }, "Error testing HubSpot credentials");
    return {
      success: false,
      error: "Invalid or expired HubSpot credentials",
    };
  }
}

async function testFreshServiceCredentials(
  credentials: t.TypeOf<typeof FreshServiceCredentialsSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new FreshServiceClient(
      credentials.api_key,
      credentials.domain
    );
    const result = await client.testCredentials();

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        "Freshservice test credentials failed"
      );

      const freshServiceError = result.error as FreshServiceError;
      if (freshServiceError.status === "403") {
        return {
          success: false,
          error:
            freshServiceError.body?.message ||
            "You are not authorized to perform this action.",
        };
      }

      return {
        success: false,
        error:
          result.error.message || "Failed to authenticate with FreshService",
      };
    }

    return { success: true };
  } catch (error: any) {
    logger.error({ error }, "Error testing Freshservice credentials");
    return {
      success: false,
      error: "Invalid or expired Freshservice credentials",
    };
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ success: boolean; error?: string }>
  >
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = TestCredentialsBodyCodec.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    logger.error({ pathError }, "Test credentials request validation failed");
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const validatedBody = bodyValidation.right;

  switch (validatedBody.provider) {
    case "hubspot":
      const hubspotResult = await testHubspotCredentials(
        validatedBody.credentials
      );
      return res.status(200).json(hubspotResult);
    case "freshservice":
      const freshserviceResult = await testFreshServiceCredentials(
        validatedBody.credentials
      );
      return res.status(200).json(freshserviceResult);
    default:
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Unsupported provider",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
