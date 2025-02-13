import {
  Avatar,
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  SearchInput,
  Separator,
  UserIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useSearchMembers } from "@app/lib/swr/memberships";

interface SearchMembersPopoverProps {
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  onMembersUpdated: (members: UserType[]) => void;
}

const DefaultPagination = { pageIndex: 0, pageSize: 25 };

export function SearchMembersPopover({
  owner,
  selectedMembers,
  onMembersUpdated,
}: SearchMembersPopoverProps) {
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

  // effect to reset pagination when search term changes
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
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button label="Add members" icon={UserIcon} size="sm" />
      </PopoverTrigger>
      <PopoverContent mountPortal={false} className="mr-2 p-4">
        <SearchInput
          name="search"
          placeholder="Search members (email)"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e);
          }}
        />
        <ScrollArea className="mt-2 flex max-h-[300px] flex-col">
          <div className="space-y-1">
            {filteredMembers.map((member) => (
              <div
                key={member.sId}
                className="flex cursor-pointer flex-col items-start hover:opacity-80"
                onClick={addMember(member)}
              >
                <div className="my-1 flex items-center gap-2">
                  <Avatar size="sm" visual={member.image || ""} />
                  <div>
                    <div className="text-sm">{member.fullName}</div>
                    <div className="text-xs text-element-700">
                      {member.email}
                    </div>
                  </div>
                </div>
                <Separator />
              </div>
            ))}
          </div>
          <InfiniteScroll
            nextPage={loadNextPage}
            hasMore={hasMore}
            isValidating={isLoading}
            isLoading={isLoading}
          >
            {isLoading && (
              <div className="py-2 text-center text-sm text-element-700">
                Loading more members...
              </div>
            )}
          </InfiniteScroll>
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}
