import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ProjectJournalEntryType, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

const MAX_PROJECT_JOURNAL_ENTRIES = 10;

export type GetProjectJournalEntriesResponseBody = {
  entries: ProjectJournalEntryType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetProjectJournalEntriesResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  // Only project spaces can have journal entries
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
    case "GET": {
      const { limit } = req.query;
      const limitNumber = limit && isString(limit) ? parseInt(limit, 10) : 10;

      if (
        isNaN(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > MAX_PROJECT_JOURNAL_ENTRIES
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Limit must be a number between 1 and ${MAX_PROJECT_JOURNAL_ENTRIES}`,
          },
        });
      }

      const entries = await ProjectJournalEntryResource.fetchBySpace(
        auth,
        space.id,
        { limit: limitNumber }
      );

      return res.status(200).json({
        entries: entries.map((entry) => entry.toJSON()),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
