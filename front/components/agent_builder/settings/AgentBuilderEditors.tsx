import {
  Button,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  UserIcon,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import { MembersList } from "@app/components/members/MembersList";
import { useUser } from "@app/lib/swr/user";
import type { UserType } from "@app/types";

const DEFAULT_PAGE_SIZE = 25;

export function AgentBuilderEditors() {
  const { owner } = useAgentBuilderContext();
  const [isOpen, setIsOpen] = useState(false);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);
  const { user } = useUser();

  const {
    field: { onChange },
  } = useController<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  const editors = useWatch<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  const onRowClick = useCallback(() => {}, []);
  const onRemoveMember = useCallback(
    (user: UserType) => {
      onChange(editors.filter((u) => u.sId !== user.sId));
    },
    [onChange, editors]
  );

  const onAddEditor = useCallback(
    (user: UserType) => {
      onChange([...editors, user]);
    },
    [onChange, editors]
  );
  const membersData = useMemo(
    () => ({
      members:
        editors.map((user) => ({
          ...user,
          workspace: owner,
        })) || [],
      totalMembersCount: editors.length,
      isLoading: false,
      mutateRegardlessOfQueryParams: () => {},
    }),
    [editors, owner]
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent trapFocusScope={false} size="lg">
          <SheetHeader>
            <SheetTitle>Editors</SheetTitle>
          </SheetHeader>
          <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
            <MembersList
              currentUser={user}
              membersData={membersData}
              onRowClick={onRowClick}
              onRemoveMemberClick={onRemoveMember}
              showColumns={["name", "email", "remove"]}
              pagination={pagination}
              setPagination={setPagination}
            />

            <div className="mt-4">
              <AddEditorDropdown
                owner={owner}
                editors={editors || []}
                onAddEditor={onAddEditor}
                trigger={
                  <Button
                    label="Add editors"
                    icon={PlusIcon}
                    onClick={() => {}}
                  />
                }
              />
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
      <Button
        label="Editors"
        variant="outline"
        size="sm"
        icon={UserIcon}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          setIsOpen(true);
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </>
  );
}
