import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  filterAndSortUserSuggestions,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
  WithAPIErrorResponse,
} from "@app/types";
import { isString } from "@app/types";
import { compareAgentsForSort } from "@app/types";

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

  const { conversationId } = req.query;

  if (conversationId && isString(conversationId)) {
    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found",
        },
      });
    }
  }

  const { query: queryParam } = req.query;
  const query = isString(queryParam) ? queryParam.trim().toLowerCase() : "";

  // Fetch agent configurations.
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });

  // Convert to RichAgentMention format.
  const agentSuggestions: RichAgentMention[] = agentConfigurations
    .filter((a) => a.status === "active")
    .sort(compareAgentsForSort)
    .map((agent) => ({
      type: "agent",
      id: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      userFavorite: agent.userFavorite,
      description: agent.description,
    }));

  // Fetch workspace members if mentions_v2 is enabled.
  const userSuggestions: RichUserMention[] = [];
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);
  const mentions_v2_enabled = featureFlags.includes("mentions_v2");

  if (mentions_v2_enabled) {
    const { members } = await getMembers(auth, { activeOnly: true });

    userSuggestions.push(
      ...members.map(
        (member) =>
          ({
            type: "user",
            id: member.sId,
            label: member.fullName || member.email,
            pictureUrl: member.image ?? "/static/humanavatar/anonymous.png",
            description: member.email,
          }) satisfies RichUserMention
      )
    );
  }

  // Filter and sort agents.
  const filteredAgents = filterAndSortEditorSuggestionAgents(
    query,
    agentSuggestions
  );

  // Filter and sort users.
  const filteredUsers = filterAndSortUserSuggestions(query, userSuggestions);

  // Combine results: agents first, then users.
  const totalResults = [...filteredAgents, ...filteredUsers];
  const suggestions = totalResults.slice(0, SUGGESTION_DISPLAY_LIMIT);

  return res.status(200).json({ suggestions });
}

export default withSessionAuthenticationForWorkspace(handler);
