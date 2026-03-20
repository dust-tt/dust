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
import {
  ClipboardCheckIcon,
  ClipboardIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  IconButton,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface SuggestionDetailsDialogProps {
  onClose: () => void;
  suggestion: AgentSuggestionType;
}

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
  const [isCopied, copy] = useCopyToClipboard();
  return (
    <IconButton
      icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
      size="xs"
      variant="outline"
      tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
      onClick={() => copy(text)}
    />
  );
}

function SuggestionDetailsDialog({
  suggestion,
  onClose,
}: SuggestionDetailsDialogProps) {
  const analysisText = suggestion.analysis ?? "No analysis";
  const contentText = JSON.stringify(suggestion.suggestion, null, 2);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggestion Details - {suggestion.sId}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Analysis</h3>
                <CopyButton text={analysisText} />
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                  {analysisText}
                </pre>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Content</h3>
                <CopyButton text={contentText} />
              </div>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                  {contentText}
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
