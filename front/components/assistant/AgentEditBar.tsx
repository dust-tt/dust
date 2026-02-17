import {
  useBatchUpdateAgentScope,
  useBatchUpdateAgentTags,
} from "@app/lib/swr/assistants";
import { compareForFuzzySort, subFilter, tagsSorter } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  EyeSlashIcon,
  Spinner,
  TagIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { DeleteAssistantsDialog } from "./DeleteAssistantsDialog";

type AgentEditBarProps = {
  onClose: () => void;
  selectedAgents: LightAgentConfigurationType[];
  owner: WorkspaceType;
  tags: TagType[];
  mutateAgentConfigurations: () => Promise<any>;
};

export const AgentEditBar = ({
  onClose,
  selectedAgents,
  owner,
  tags,
  mutateAgentConfigurations,
}: AgentEditBarProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const batchUpdateAgentTags = useBatchUpdateAgentTags({
    owner,
  });

  const batchUpdateAgentScope = useBatchUpdateAgentScope({
    owner,
  });

  const filteredTags = tags
    .filter((t) => isBuilder(owner) || t.kind !== "protected")
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
    <>
      <DeleteAssistantsDialog
        owner={owner}
        agentConfigurations={selectedAgents}
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onSave={() => {
          onClose();
          setIsDeleteDialogOpen(false);
        }}
      />

      <div className="border-1 mb-2 flex flex-row items-center gap-2 rounded-xl bg-muted-background p-2 dark:bg-muted-background-night">
        <Button
          size="xs"
          variant="outline"
          disabled={isLoading}
          label="Close edition"
          icon={XMarkIcon}
          onClick={onClose}
        />
        {isLoading && <Spinner size="xs" variant="dark" />}
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              isSelect
              icon={TagIcon}
              label="Tag selection"
              disabled={selectedAgents.length === 0 || isLoading}
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
                    color="golden"
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

        <Button
          size="xs"
          variant="outline"
          icon={EyeSlashIcon}
          label="Unpublish"
          disabled={selectedAgents.length === 0 || isLoading}
          onClick={async () => {
            setIsLoading(true);
            await batchUpdateAgentScope(
              selectedAgents.map((a) => a.sId),
              { scope: "hidden" }
            );
            void mutateAgentConfigurations();
            setIsLoading(false);
            onClose();
          }}
        />

        <Button
          size="xs"
          variant="warning"
          icon={TrashIcon}
          label="Archive selection"
          disabled={selectedAgents.length === 0 || isLoading}
          onClick={() => {
            setIsDeleteDialogOpen(true);
          }}
        />
      </div>
    </>
  );
};
