import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
  WithAPIErrorResponse,
} from "@app/types";
import { compareAgentsForSort } from "@app/types";

type MentionMatchRequestBody = {
  names: string[];
};

type MentionMatchResponseBody = {
  matches: RichMention[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MentionMatchResponseBody>>,
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

  const { names } = req.body as MentionMatchRequestBody;

  if (!Array.isArray(names)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "names must be an array of strings",
      },
    });
  }

  // Normalize names for case-insensitive matching.
  const normalizedNames = names.map((name) => name.toLowerCase().trim());

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

  // Combine all suggestions.
  const allSuggestions: RichMention[] = [
    ...agentSuggestions,
    ...userSuggestions,
  ];

  // Match names case-insensitively.
  const matches = allSuggestions.filter((suggestion) =>
    normalizedNames.includes(suggestion.label.toLowerCase())
  );

  return res.status(200).json({ matches });
}

export default withSessionAuthenticationForWorkspace(handler);
