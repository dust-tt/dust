import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSearchMembers } from "@app/lib/swr/memberships";
import type { UserType, WorkspaceType } from "@app/types";

export function AddEditorDropdown({
  owner,
  editors,
  onAddEditor,
  trigger,
}: {
  owner: WorkspaceType;
  editors: UserType[];
  onAddEditor: (member: UserType) => void;
  trigger: JSX.Element;
}) {
  const [isEditorPickerOpen, setIsEditorPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { members: workspaceMembers, isLoading: isWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: 0,
      pageSize: 25,
    });

  return (
    <DropdownMenu
      open={isEditorPickerOpen}
      onOpenChange={setIsEditorPickerOpen}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-[380px]"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              name="search"
              onChange={(value) => setSearchTerm(value)}
              placeholder="Search members"
              value={searchTerm}
              button={<Button icon={PlusIcon} label="Add member" />}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isWorkspaceMembersLoading ? (
          <div className="mt-4 flex flex-row items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : (
          workspaceMembers.map((member) => (
            <DropdownMenuItem
              key={member.sId}
              label={member.fullName}
              description={member.email}
              icon={() => <Avatar size="sm" visual={member.image} />}
              onClick={async () => {
                setSearchTerm("");
                setIsEditorPickerOpen(false);
                onAddEditor(member);
              }}
              truncateText
              disabled={editors.some((e) => e.sId === member.sId)}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
