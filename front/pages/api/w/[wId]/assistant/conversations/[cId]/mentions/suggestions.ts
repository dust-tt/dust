import type { NextApiRequest, NextApiResponse } from "next";

import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { RichMention, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MentionSuggestionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;

  const conversationRes = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversationRes) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const { select: selectParam, current } = req.query;

  const { query: queryParam } = req.query;
  const query = isString(queryParam) ? queryParam.trim().toLowerCase() : "";

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const mentions_v2_enabled = featureFlags.includes("mentions_v2");

  // Parse select parameter: can be "agents", "users", ["agents", "users"], or undefined.
  const select = (() => {
    if (!selectParam) {
      // Default behavior: agents always, users only if mentions_v2 enabled.
      return { agents: true, users: mentions_v2_enabled };
    }

    const selectValues = isString(selectParam) ? [selectParam] : selectParam;
    const agents = selectValues.includes("agents");
    const users = selectValues.includes("users") && mentions_v2_enabled;

    return { agents, users };
  })();

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    conversationId,
    select,
    current: current === "true",
  });

  return res.status(200).json({ suggestions });
}

export default withSessionAuthenticationForWorkspace(handler);
