import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { apiError } from "@app/logger/withlogging";
import type {
  RichAgentMention,
  RichUserMention,
  WithAPIErrorResponse,
} from "@app/types";

const ParseMentionsRequestBodySchema = t.type({
  markdown: t.string,
});

type ParseMentionsResponseBody = {
  markdown: string;
};

/**
 * Parses pasted text containing @ mentions and converts them to the proper mention format.
 * Matches @agentName or @userName patterns against available agents and users.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ParseMentionsResponseBody>>,
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

  const parsedBody = ParseMentionsRequestBodySchema.decode(req.body);

  if (isLeft(parsedBody)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body, `markdown` (string) is required.",
      },
    });
  }

  const { markdown } = parsedBody.right;

  // Fetch agent configurations.
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });

  // Build agent mentions map.
  const agentMentions: RichAgentMention[] = agentConfigurations
    .filter((a) => a.status === "active")
    .map((agent) => ({
      type: "agent",
      id: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      userFavorite: agent.userFavorite,
      description: agent.description,
    }));

  // Fetch workspace members if mentions_v2 is enabled.
  const userMentions: RichUserMention[] = [];
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);
  const mentions_v2_enabled = featureFlags.includes("mentions_v2");

  if (mentions_v2_enabled) {
    const { members } = await getMembers(auth, { activeOnly: true });

    userMentions.push(
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

  // Combine all mentions for matching.
  const allMentions = [...agentMentions, ...userMentions];

  // Sort mentions by label length (descending) to match longer names first.
  // This prevents "AI Assistant Pro" from being matched as "AI" when both exist.
  allMentions.sort((a, b) => b.label.length - a.label.length);

  let processedMarkdown = markdown;

  for (const mention of allMentions) {
    // Use a safe case-insensitive substring search instead of compiling a RegExp
    // per mention. This avoids expensive regex compilation on potentially
    // attacker-controlled large labels or markdown bodies while preserving the
    // previous matching semantics: an @mention must be at the start or preceded
    // by whitespace, and must be followed by whitespace, end-of-string, or
    // punctuation.

    // Skip empty labels and extremely long labels to avoid pathological work.
    if (!mention.label || mention.label.length > 1000) {
      continue;
    }

    const serialized = serializeMention(mention);

    // Work with a lowercase copy for case-insensitive searching, but perform
    // replacements on the original string to preserve character casing outside
    // of the inserted serialized mention.
    let lowerText = processedMarkdown.toLowerCase();
    const needle = `@${mention.label}`.toLowerCase();
    let searchIndex = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pos = lowerText.indexOf(needle, searchIndex);
      if (pos === -1) {
        break;
      }

      // Check character before the match (if any) is start or whitespace
      const beforeIdx = pos - 1;
      if (beforeIdx >= 0) {
        const beforeChar = lowerText.charAt(beforeIdx);
        if (!/\s/.test(beforeChar)) {
          searchIndex = pos + 1; // continue searching
          continue;
        }
      }

      // Check character after the match (if any) is whitespace, punctuation, or end
      const afterIdx = pos + needle.length;
      const afterChar = lowerText.charAt(afterIdx);
      if (afterChar && !/\s|[.,!?;:]/.test(afterChar)) {
        searchIndex = pos + 1;
        continue;
      }

      // Valid mention found — replace the @label with the serialized mention
      processedMarkdown =
        processedMarkdown.slice(0, pos) +
        serialized +
        processedMarkdown.slice(afterIdx);

      // Update lowercase copy and continue searching after the inserted text
      lowerText = processedMarkdown.toLowerCase();
      searchIndex = pos + serialized.length;
    }
  }

  return res.status(200).json({ markdown: processedMarkdown });
}

export default withSessionAuthenticationForWorkspace(handler);
