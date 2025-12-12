import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { prettifyGroupName } from "@app/components/workspace/api-keys/utils";
import type { GroupType } from "@app/types";
import { GLOBAL_SPACE_NAME } from "@app/types";

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

  const handleClose = () => {
    setNewApiKeyName("");
    setNewApiKeyRestrictedGroup(null);
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          label="Create API Key"
          icon={PlusIcon}
          disabled={isGenerating || isRevoking}
        />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New API Key</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label>API Key Name</Label>
              <Input
                name="API Key"
                placeholder="Type an API key name"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
              <Label>Add optional additional Space</Label>
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      label={
                        newApiKeyRestrictedGroup
                          ? prettifyGroupName(newApiKeyRestrictedGroup)
                          : "Add a space"
                      }
                      size="sm"
                      variant="outline"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
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
              </div>
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Create",
            variant: "primary",
            onClick: async () => {
              await onCreate({
                name: newApiKeyName,
                group: newApiKeyRestrictedGroup,
              });
              handleClose();
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
