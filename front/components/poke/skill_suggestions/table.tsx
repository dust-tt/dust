import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSkillSuggestions } from "@app/components/poke/skill_suggestions/columns";
import { usePokeSkillSuggestions } from "@app/poke/swr/skill_suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import {
  SKILL_SUGGESTION_KINDS,
  SKILL_SUGGESTION_SOURCES,
  SKILL_SUGGESTION_STATES,
} from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillSuggestionDetailsDialogProps {
  onClose: () => void;
  suggestion: SkillSuggestionType;
}

function SkillSuggestionDetailsDialog({
  suggestion,
  onClose,
}: SkillSuggestionDetailsDialogProps) {
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

interface SkillSuggestionDataTableProps {
  owner: LightWorkspaceType;
  skillId: string;
}

export function SkillSuggestionDataTable({
  owner,
  skillId,
}: SkillSuggestionDataTableProps) {
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<SkillSuggestionType | null>(null);

  const useSuggestionsWithSkill = (props: PokeConditionalFetchProps) =>
    usePokeSkillSuggestions({ ...props, skillId });

  const facets = [
    {
      columnId: "kind",
      title: "Kind",
      options: SKILL_SUGGESTION_KINDS.map((kind) => ({
        label: asDisplayName(kind),
        value: kind,
      })),
    },
    {
      columnId: "state",
      title: "State",
      options: SKILL_SUGGESTION_STATES.map((state) => ({
        label: asDisplayName(state),
        value: state,
      })),
    },
    {
      columnId: "source",
      title: "Source",
      options: SKILL_SUGGESTION_SOURCES.map((source) => ({
        label: asDisplayName(source),
        value: source,
      })),
    },
  ];

  return (
    <>
      {selectedSuggestion && (
        <SkillSuggestionDetailsDialog
          suggestion={selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
        />
      )}
      <PokeDataTableConditionalFetch
        header="Suggestions"
        owner={owner}
        useSWRHook={useSuggestionsWithSkill}
      >
        {(suggestions, mutate) => {
          const columns = makeColumnsForSkillSuggestions(
            owner,
            skillId,
            async () => {
              await mutate();
            },
            setSelectedSuggestion
          );

          return (
            <PokeDataTable<SkillSuggestionType, unknown>
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
