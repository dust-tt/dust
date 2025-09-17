import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { LightWorkspaceType, UserType } from "@app/types";

interface SearchMembersDropdownProps {
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  onMembersUpdated: (members: UserType[]) => void;
}

const DefaultPagination = { pageIndex: 0, pageSize: 25 };

export function SearchMembersDropdown({
  owner,
  selectedMembers,
  onMembersUpdated,
}: SearchMembersDropdownProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState(DefaultPagination);
  const [allMembers, setAllMembers] = useState<UserType[]>([]);

  const { members, isLoading, totalMembersCount } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });

  useEffect(() => {
    if (members && !isLoading) {
      setAllMembers((prevMembers) => {
        if (pagination.pageIndex === 0) {
          // if it's the first page, replace all members
          return members;
        } else {
          // otherwise, append new members
          const newMembers = members.filter(
            (member) =>
              !prevMembers.some((prevMember) => prevMember.sId === member.sId)
          );
          return [...prevMembers, ...newMembers];
        }
      });
    }
  }, [members, isLoading, pagination.pageIndex]);

  // Effect to reset pagination when the search term changes.
  useEffect(() => {
    setPagination(DefaultPagination);
  }, [searchTerm]);

  const filteredMembers = useMemo(() => {
    return allMembers.filter(
      (member) =>
        !selectedMembers.some((selected) => selected.sId === member.sId)
    );
  }, [allMembers, selectedMembers]);

  const addMember = useCallback(
    (member: UserType) => () => {
      onMembersUpdated([member, ...selectedMembers]);
    },
    [selectedMembers, onMembersUpdated]
  );

  const loadNextPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
  }, []);

  const hasMore = totalMembersCount > allMembers.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="Add members" icon={PlusIcon} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        dropdownHeaders={
          <DropdownMenuSearchbar
            value={searchTerm}
            onChange={setSearchTerm}
            name="search"
            placeholder="Search members (email)"
          />
        }
      >
        {filteredMembers.map((member) => (
          <DropdownMenuItem
            key={member.sId}
            onClick={addMember(member)}
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            icon={() => <Avatar size="sm" visual={member.image || ""} />}
            label={member.fullName}
            description={member.email}
          />
        ))}
        {filteredMembers.length === 0 && !isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
            {searchTerm ? "No members found" : "No members available"}
          </div>
        )}
        <InfiniteScroll
          nextPage={loadNextPage}
          hasMore={hasMore}
          showLoader={isLoading}
          loader={
            <div className="py-2 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              Loading more members...
            </div>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
