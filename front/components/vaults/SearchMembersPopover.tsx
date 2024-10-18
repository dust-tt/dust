import {
  Avatar,
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Searchbar,
  Separator,
  UserIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import React, { useCallback, useMemo, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useSearchMembers } from "@app/lib/swr/memberships";

interface SearchMembersPopoverProps {
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  onMembersUpdated: (members: UserType[]) => void;
}

export function SearchMembersPopover({
  owner,
  selectedMembers,
  onMembersUpdated,
}: SearchMembersPopoverProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const { members, isLoading, totalMembersCount } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });

  const filteredMembers = useMemo(() => {
    return members?.filter(
      (member) =>
        !selectedMembers.some((selected) => selected.sId === member.sId)
    );
  }, [members, selectedMembers]);

  const addMember = useCallback(
    (member: UserType) => {
      onMembersUpdated([...selectedMembers, member]);
    },
    [selectedMembers, onMembersUpdated]
  );

  const loadMoreMembers = useCallback(() => {
    setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
  }, []);

  return (
    <div className="flex flex-col items-end gap-2">
      <PopoverRoot>
        <PopoverTrigger>
          <Button label="Add members" icon={UserIcon} size="sm" />
        </PopoverTrigger>
        <PopoverContent className="p-4">
          <Searchbar
            name="search"
            placeholder="Search members (email)"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e);
              setPagination({ pageIndex: 0, pageSize: 25 });
            }}
          />
          {isLoading ? (
            <div className="mt-4 text-center">Loading...</div>
          ) : (
            <div className="mt-2 overflow-y-auto">
              <InfiniteScroll
                nextPage={loadMoreMembers}
                hasMore={filteredMembers.length < totalMembersCount}
                isValidating={true}
                isLoading={isLoading}
              >
                {filteredMembers?.map((member) => (
                  <div
                    key={member.sId}
                    className="flex cursor-pointer flex-col items-start hover:opacity-80"
                    onClick={() => addMember(member)}
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
              </InfiniteScroll>
            </div>
          )}
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
