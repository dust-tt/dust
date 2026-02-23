import { getShrinkWrapedConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import { ConversationError } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

function buildFirstMessage(shrinkWrappedConversation: string): string {
  return `<dust_system>
Build an agent that replicates the workflow shown in the conversation below.

<conversation>
${shrinkWrappedConversation}
</conversation>

Analyze this conversation to identify the replicatable workflow. Before suggesting agent instructions, confirm with me (unless all are obvious from the conversation):

- What kind of **inputs** will users provide to the agent?
- What **output** should the agent produce?
- What is the **goal** of the agent?

Then suggest the agent configuration (instructions, tools, skills, etc.) that replicates this workflow.
</dust_system>`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const { conversationId } = req.query;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: `The conversationId query parameter is invalid or missing.`,
      },
    });
  }

  switch (req.method) {
    case "GET":
      const conversationRes = await getShrinkWrapedConversation(auth, {
        conversationId,
      });

      if (conversationRes.isErr()) {
        // Distinguish between "not found" and "access restricted" for the UI.
        const canAccess = await ConversationResource.canAccess(
          auth,
          conversationId
        );
        const error =
          canAccess === "conversation_access_restricted"
            ? new ConversationError("conversation_access_restricted")
            : conversationRes.error;
        return apiErrorForConversation(req, res, error);
      }

      const firstMessage = buildFirstMessage(conversationRes.value.text);
      return res.status(200).json(firstMessage);
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
