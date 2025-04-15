import axios from "axios";
import Bottleneck from "bottleneck";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { ConnectionCredentials, WithAPIErrorResponse } from "@app/types";
import { isHubspotCredentials } from "@app/types";

const hubspotLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 100, // 1000ms / 10 requests per second
});

const TestCredentialsBodySchema = t.type({
  provider: t.literal("hubspot"),
  credentials: t.record(t.string, t.unknown),
});

async function testHubspotCredentials(
  credentials: ConnectionCredentials
): Promise<{ success: boolean; error?: string }> {
  if (!isHubspotCredentials(credentials)) {
    return {
      success: false,
      error: "Invalid credentials type - expected hubspot credentials",
    };
  }

  const hubspotApi = axios.create({
    baseURL: "https://api.hubapi.com",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  try {
    await hubspotLimiter.schedule(() =>
      hubspotApi.get("/crm/v3/objects/companies", {
        params: { limit: 1 },
      })
    );
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
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to test connection credentials.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = TestCredentialsBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
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
      const result = await testHubspotCredentials(
        validatedBody.credentials as ConnectionCredentials
      );
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
