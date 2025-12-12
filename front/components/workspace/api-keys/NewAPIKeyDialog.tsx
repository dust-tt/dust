import {
  Button,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  PlusIcon,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import type { GroupType } from "@app/types";
import { GLOBAL_SPACE_NAME } from "@app/types";

import { prettifyGroupName } from "./utils";

type NewAPIKeyDialogProps = {
  groups: GroupType[];
  isGenerating: boolean;
  isRevoking: boolean;
  onCreate: (params: {
    name: string;
    group: GroupType | null;
  }) => Promise<void>;
};

export const NewAPIKeyDialog = ({
  groups,
  isGenerating,
  isRevoking,
  onCreate,
}: NewAPIKeyDialogProps) => {
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyRestrictedGroup, setNewApiKeyRestrictedGroup] =
    useState<GroupType | null>(null);

  const nonGlobalGroups = useMemo(
    () => groups.filter((g) => g.kind !== "global"),
    [groups]
  );

  return (
    <Dialog modal={false}>
      <DialogTrigger asChild>
        <Button
          label="Create API Key"
          icon={PlusIcon}
          disabled={isGenerating || isRevoking}
        />
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New API Key</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-4">
            <div>
              <Label>API Key Name</Label>
              <Input
                name="API Key"
                placeholder="Type an API key name"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
              />
            </div>
            <div>
              <Label>Default Space</Label>
              <div>
                <Button
                  label={GLOBAL_SPACE_NAME}
                  size="sm"
                  variant="outline"
                  disabled={true}
                  tooltip={`${GLOBAL_SPACE_NAME} is mandatory.`}
                />
              </div>
            </div>
            <div>
              <Label>Add optional additional Space</Label>
              <div>
                {newApiKeyRestrictedGroup ? (
                  <Chip
                    label={prettifyGroupName(newApiKeyRestrictedGroup)}
                    onRemove={() => setNewApiKeyRestrictedGroup(null)}
                    size="sm"
                  />
                ) : (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label={
                          newApiKeyRestrictedGroup
                            ? prettifyGroupName(newApiKeyRestrictedGroup)
                            : "Add a space"
                        }
                        size="sm"
                        variant="outline"
                        isSelect={newApiKeyRestrictedGroup === null}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {nonGlobalGroups
                        .sort((a, b) =>
                          prettifyGroupName(a)
                            .toLowerCase()
                            .localeCompare(prettifyGroupName(b).toLowerCase())
                        )
                        .map((group: GroupType) => (
                          <DropdownMenuItem
                            key={group.id}
                            label={prettifyGroupName(group)}
                            onClick={() => setNewApiKeyRestrictedGroup(group)}
                          />
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Create",
            variant: "primary",
            onClick: async () => {
              await onCreate({
                name: newApiKeyName,
                group: newApiKeyRestrictedGroup,
              });
              setNewApiKeyName("");
              setNewApiKeyRestrictedGroup(null);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
