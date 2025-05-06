import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { HubspotClient } from "@app/temporal/labs/connections/providers/hubspot/client";
import type { WithAPIErrorResponse } from "@app/types";
import { HubspotCredentialsSchema } from "@app/types";

const TestCredentialsBodyCodec = t.type({
  provider: t.literal("hubspot"),
  credentials: HubspotCredentialsSchema,
});

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
      const result = await testHubspotCredentials(validatedBody.credentials);
      return res.status(200).json(result);
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
