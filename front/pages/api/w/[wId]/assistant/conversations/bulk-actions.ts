import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type BulkActionsResponse = {
  success: boolean;
};

export const MarkAllAsReadBodySchema = z.object({
  action: z.enum(["mark_as_read"]),
  conversationIds: z.array(z.string()).min(1),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<BulkActionsResponse>>,
  auth: Authenticator
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

  const parseResult = MarkAllAsReadBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(parseResult.error).toString(),
      },
    });
  }

  const { conversationIds, action } = parseResult.data;

  if (action === "mark_as_read") {
    await ConversationResource.batchMarkAsReadAndClearActionRequired(
      auth,
      conversationIds
    );

    return res.status(200).json({ success: true });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
