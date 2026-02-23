import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSuggestions } from "@app/components/poke/suggestions/columns";
import { usePokeSuggestions } from "@app/poke/swr/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import {
  AGENT_SUGGESTION_KINDS,
  AGENT_SUGGESTION_STATES,
} from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";

interface SuggestionDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

export function SuggestionDataTable({
  owner,
  agentId,
}: SuggestionDataTableProps) {
  const useSuggestionsWithAgent = (props: PokeConditionalFetchProps) =>
    usePokeSuggestions({ ...props, agentId });

  const facets = [
    {
      columnId: "kind",
      title: "Kind",
      options: AGENT_SUGGESTION_KINDS.map((kind) => ({
        label: asDisplayName(kind),
        value: kind,
      })),
    },
    {
      columnId: "state",
      title: "State",
      options: AGENT_SUGGESTION_STATES.map((state) => ({
        label: asDisplayName(state),
        value: state,
      })),
    },
  ];

  return (
    <PokeDataTableConditionalFetch
      header="Suggestions"
      owner={owner}
      useSWRHook={useSuggestionsWithAgent}
    >
      {(suggestions) => {
        const columns = makeColumnsForSuggestions();

        return (
          <PokeDataTable<AgentSuggestionType, unknown>
            columns={columns}
            data={suggestions}
            facets={facets}
          />
        );
      }}
    </PokeDataTableConditionalFetch>
  );
}
