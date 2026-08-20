import { useBatchUpdateAgentTags } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { compareForFuzzySort, subFilter, tagsSorter } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  Hoverable,
  Spinner,
  Tag01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { DeleteAssistantsDialog } from "./DeleteAssistantsDialog";
import { SetModelAssistantsDialog } from "./SetModelAssistantsDialog";
import { UnpublishAssistantsDialog } from "./UnpublishAssistantsDialog";

type AgentEditBarProps = {
  onClear: () => void;
  onSelectAll: () => void;
  selectedAgents: LightAgentConfigurationType[];
  pageSelectedCount: number;
  totalCount: number;
  owner: WorkspaceType;
  tags: TagType[];
  mutateAgentConfigurations: () => Promise<any>;
};

export const AgentEditBar = ({
  onClear,
  onSelectAll,
  selectedAgents,
  pageSelectedCount,
  totalCount,
  owner,
  tags,
  mutateAgentConfigurations,
}: AgentEditBarProps) => {
  const [tagSearch, setTagSearch] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const batchUpdateAgentTags = useBatchUpdateAgentTags({
    owner,
  });

  const { hasPermission } = useWorkspacePermissions();
  const canPublishAgents = hasPermission("publish", "agent");

  const selectedCount = selectedAgents.length;

  if (selectedCount === 0) {
    return null;
  }

  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  const filteredTags = tags
    .filter((t) => canPublishAgents || t.kind !== "protected")
    .filter((a) => {
      return subFilter(tagSearch, a.name.toLowerCase());
    })
    .sort((a, b) => {
      if (tagSearch) {
        return compareForFuzzySort(
          tagSearch,
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      } else {
        return tagsSorter(a, b);
      }
    });

  return (
    <div
      className={cn(
        "mt-3 mb-2 flex items-center gap-2 rounded-xl border p-3",
        "border-orange-100 bg-orange-50 dark:border-golden-900 dark:bg-golden-950"
      )}
    >
      <div
        className={cn(
          "flex flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1",
          "text-xs text-orange-800 dark:text-golden-100"
        )}
      >
        {isAllSelected ? (
          <span>
            {selectedCount} agent{pluralize(selectedCount)} are selected.
          </span>
        ) : (
          <>
            <span>
              {pageSelectedCount} agent{pluralize(pageSelectedCount)} selected
              on this page
            </span>
            <Hoverable variant="highlight" onClick={onSelectAll}>
              Select all {totalCount} agent{pluralize(totalCount)}
            </Hoverable>
          </>
        )}
      </div>
      {isLoading && <Spinner size="xs" variant="dark" />}
      <Button
        size="xs"
        variant="ghost"
        label="Clear"
        onClick={onClear}
        disabled={isLoading}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="primary"
            isSelect
            icon={Tag01}
            label="Tag selection"
            disabled={isLoading}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-60"
          dropdownHeaders={
            <>
              <DropdownMenuSearchbar
                name="tagSearch"
                placeholder="Search tags"
                value={tagSearch}
                onChange={setTagSearch}
              />
              <DropdownMenuSeparator />
            </>
          }
        >
          <DropdownMenuTagList>
            {filteredTags.map((t) => {
              return (
                <DropdownMenuTagItem
                  key={t.sId}
                  label={t.name}
                  color="info"
                  onClick={async () => {
                    setIsLoading(true);
                    const agentIds = selectedAgents.map((a) => a.sId);

                    if (
                      selectedAgents.every((a) =>
                        a.tags.find((agentTag) => agentTag.sId === t.sId)
                      )
                    ) {
                      // Remove tag from all selected agents
                      await batchUpdateAgentTags(agentIds, {
                        removeTagIds: [t.sId],
                      });
                    } else {
                      // Add tag to agents that don't have it
                      const toAdd = selectedAgents.filter(
                        (a) =>
                          !a.tags.find((agentTag) => agentTag.sId === t.sId)
                      );
                      await batchUpdateAgentTags(
                        toAdd.map((a) => a.sId),
                        {
                          addTagIds: [t.sId],
                        }
                      );
                    }
                    void mutateAgentConfigurations();
                    setIsLoading(false);
                  }}
                />
              );
            })}
          </DropdownMenuTagList>
        </DropdownMenuContent>
      </DropdownMenu>
      <SetModelAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        disabled={isLoading}
        variant="primary"
      />
      <UnpublishAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        disabled={isLoading}
        onSave={onClear}
        variant="primary"
      />
      <DeleteAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        disabled={isLoading}
        onSave={onClear}
      />
    </div>
  );
};
