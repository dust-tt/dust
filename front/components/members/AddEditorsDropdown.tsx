import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { useState } from "react";

interface AddEditorDropdownProps {
  owner: WorkspaceType;
  editors: Array<{ sId: string }>;
  onAddEditor: (editor: SearchMemberWithWorkspaceType) => void;
  trigger: ReactElement;
}

export function AddEditorDropdown({
  owner,
  editors,
  onAddEditor,
  trigger,
}: AddEditorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 25,
    disabled: !isOpen,
  });

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        align="end"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              name="search-editors"
              placeholder="Search members"
              value={searchText}
              onChange={setSearchText}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : members.length > 0 ? (
          members.map((member) => (
            <DropdownMenuItem
              key={member.sId}
              label={member.fullName}
              description={member.email}
              icon={() => (
                <Avatar
                  name={member.fullName}
                  visual={member.image ?? undefined}
                  size="sm"
                  isRounded
                />
              )}
              truncateText
              disabled={editors.some((editor) => editor.sId === member.sId)}
              onClick={() => onAddEditor(member)}
              onSelect={(event) => event.preventDefault()}
            />
          ))
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No members found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
