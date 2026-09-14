import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
import { useBatchUpdateAgentTags } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { compareForFuzzySort, subFilter, tagsSorter } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { DeleteAssistantsDialog } from "./DeleteAssistantsDialog";
import { SetModelAssistantsDialog } from "./SetModelAssistantsDialog";
import { UnpublishAssistantsDialog } from "./UnpublishAssistantsDialog";

type AgentEditBarProps = {
  onClear: () => void;
  onSelectAll: () => void;
  selectedAgents: LightAgentConfigurationType[];
  totalCount: number;
  owner: WorkspaceType;
  tags: TagType[];
  mutateAgentConfigurations: () => Promise<any>;
};

export const AgentEditBar = ({
  onClear,
  onSelectAll,
  selectedAgents,
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
    <BulkSelectionBar
      selectedCount={selectedCount}
      totalCount={totalCount}
      itemLabel="agent"
      canSelectAll={totalCount > selectedCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
      disabled={isLoading}
      isLoading={isLoading}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="primary"
            isSelect
            label="Change tag"
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
      />
      <UnpublishAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        disabled={isLoading}
        onSave={onClear}
      />
      <DeleteAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        disabled={isLoading}
        onSave={onClear}
      />
    </BulkSelectionBar>
  );
};
