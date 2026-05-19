import { Hono } from "hono";

import { config } from "@app/lib/api/regions/config";
import { TemplateResource } from "@app/lib/resources/template_resource";
import logger from "@app/logger/logger";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import type { FetchAgentTemplateResponse } from "@app/pages/api/templates/[tId]";

import { apiError } from "@front-api/middleware/utils";

// Mounted at /api/poke/templates/pull. pokeAuth is applied by the parent poke
// sub-app.
const app = new Hono();

app.post("/", async (c) => {
  if (!config.getDustRegionSyncEnabled()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This endpoint can only be called from non-main regions.",
      },
    });
  }

  const mainRegionUrl = config.getDustRegionSyncMasterUrl();
  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(`${mainRegionUrl}/api/templates`, {
    method: "GET",
  });

  if (!response.ok) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch templates from main region.",
      },
    });
  }

  const templatesResponse: FetchAssistantTemplatesResponse =
    await response.json();
  let count = 0;

  for (const templateFromList of templatesResponse.templates) {
    // eslint-disable-next-line no-restricted-globals
    const templateResponse = await fetch(
      `${mainRegionUrl}/api/templates/${templateFromList.sId}`,
      {
        method: "GET",
      }
    );

    if (!templateResponse.ok) {
      logger.error(
        `Failed to fetch template ${templateFromList.sId}: ${templateResponse.status}`
      );
      continue;
    }

    const template: FetchAgentTemplateResponse = await templateResponse.json();

    await TemplateResource.upsertByHandle(template);

    count++;
  }

  return c.json({
    success: true as const,
    count,
  });
});

export default app;
