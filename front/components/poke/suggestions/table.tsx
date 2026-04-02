import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSuggestions } from "@app/components/poke/suggestions/columns";
import { usePokeSuggestions } from "@app/poke/swr/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import {
  AGENT_SUGGESTION_KINDS,
  AGENT_SUGGESTION_SOURCES,
  AGENT_SUGGESTION_STATES,
} from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SuggestionDetailsDialogProps {
  onClose: () => void;
  suggestion: AgentSuggestionType;
}

function SuggestionDetailsDialog({
  suggestion,
  onClose,
}: SuggestionDetailsDialogProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggestion Details - {suggestion.sId}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Analysis</h3>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                  {suggestion.analysis ?? "No analysis"}
                </pre>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Content</h3>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                  {JSON.stringify(suggestion.suggestion, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}

interface SuggestionDataTableProps {
  owner: LightWorkspaceType;
  agentId: string;
}

export function SuggestionDataTable({
  owner,
  agentId,
}: SuggestionDataTableProps) {
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<AgentSuggestionType | null>(null);

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
    {
      columnId: "source",
      title: "Source",
      options: AGENT_SUGGESTION_SOURCES.map((source) => ({
        label: asDisplayName(source),
        value: source,
      })),
    },
  ];

  return (
    <>
      {selectedSuggestion && (
        <SuggestionDetailsDialog
          suggestion={selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
        />
      )}
      <PokeDataTableConditionalFetch
        header="Suggestions"
        owner={owner}
        useSWRHook={useSuggestionsWithAgent}
      >
        {(suggestions, mutate) => {
          const columns = makeColumnsForSuggestions(
            owner,
            agentId,
            async () => {
              await mutate();
            },
            setSelectedSuggestion
          );

          return (
            <PokeDataTable<AgentSuggestionType, unknown>
              columns={columns}
              data={suggestions}
              facets={facets}
            />
          );
        }}
      </PokeDataTableConditionalFetch>
    </>
  );
}
