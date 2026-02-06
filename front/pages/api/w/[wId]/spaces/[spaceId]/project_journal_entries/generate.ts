import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { launchProjectJournalGenerationWorkflow } from "@app/temporal/project_journal_queue/client";
import type { WithAPIErrorResponse } from "@app/types";

// const COOLDOWN_HOURS = 24;
// const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
const COOLDOWN_MS = 0;

export type PostGenerateProjectJournalEntryResponseBody = {
  success: true;
};

export async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostGenerateProjectJournalEntryResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Project journal entries are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      // Check cooldown - get the latest entry
      const existingEntries = await ProjectJournalEntryResource.fetchBySpace(
        auth,
        space.id,
        { limit: 1 }
      );

      const latestEntry = existingEntries[0] || null;
      if (latestEntry) {
        const timeSinceLastEntryMs =
          Date.now() - new Date(latestEntry.createdAt).getTime();
        if (timeSinceLastEntryMs < COOLDOWN_MS) {
          const remainingHours = Math.ceil(
            (COOLDOWN_MS - timeSinceLastEntryMs) / (60 * 60 * 1000)
          );
          return apiError(req, res, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: `Please wait ${remainingHours} hour${remainingHours > 1 ? "s" : ""} before generating a new journal entry.`,
            },
          });
        }
      }

      // Launch async workflow to generate the journal entry
      const workflowResult = await launchProjectJournalGenerationWorkflow({
        auth,
        spaceId: space.sId,
      });

      if (workflowResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to start journal entry generation: ${workflowResult.error.message}`,
          },
        });
      }

      return res.status(202).json({
        success: true,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
