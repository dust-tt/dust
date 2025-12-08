import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/types";
import {
  compareAgentsForSort,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types";

export const suggestionsOfMentions = async (
  auth: Authenticator,
  {
    query,
    select = {
      agents: true,
      users: true,
    },
  }: {
    query: string;
    select?: {
      agents: boolean;
      users: boolean;
    };
  }
): Promise<RichMention[]> => {
  const agentSuggestions: RichAgentMention[] = [];
  const userSuggestions: RichUserMention[] = [];

  if (select.agents) {
    // Fetch agent configurations.
    const agentConfigurations = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "list",
      variant: "light",
    });

    // Convert to RichAgentMention format.
    agentSuggestions.push(
      ...agentConfigurations
        .filter((a) => a.status === "active")
        .sort(compareAgentsForSort)
        .map(toRichAgentMentionType)
    );
  }

  if (select.users) {
    const res = await UserResource.searchUsers(auth, {
      searchTerm: query,
      offset: 0,
      limit: SUGGESTION_DISPLAY_LIMIT,
    });

    if (res.isOk()) {
      const { users } = res.value;

      userSuggestions.push(
        ...users.map((u) => toRichUserMentionType(u.toJSON()))
      );
    }
  }

  const filteredAgents = filterAndSortEditorSuggestionAgents(
    query,
    agentSuggestions
  );

  // Combine results: agents first, then users.
  const totalResults = [...filteredAgents, ...userSuggestions];
  return totalResults.slice(0, SUGGESTION_DISPLAY_LIMIT);
};
