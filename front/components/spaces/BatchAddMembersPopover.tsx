import { removeNulls } from "@dust-tt/client";
import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  TextArea,
  UserGroupIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import React, { useCallback, useEffect, useState } from "react";

import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { useMembersByEmails } from "@app/lib/swr/memberships";
import { isEmailValid } from "@app/lib/utils";

interface BatchAddMembersPopoverProps {
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  onMembersUpdated: (members: UserType[]) => void;
}

export function BatchAddMembersPopover({
  owner,
  selectedMembers,
  onMembersUpdated,
}: BatchAddMembersPopoverProps) {
  const sendNotification = useSendNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [emails, setEmails] = useState<string[]>([]);
  const [doSave, setDoSave] = useState(false);
  const { members, isMembersLoading } = useMembersByEmails({
    workspaceId: owner.sId,
    emails,
    disabled: !isOpen || !doSave,
  });

  const isListValid = emails?.length && !error;
  const buttonLabel = isListValid ? `Add ${emails.length} members` : "...";

  const onTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      const emails = removeNulls(
        e.target.value
          .split("\n")
          .map((email) => email.trim())
          .filter((email) => isEmailValid(email))
      );
      setEmails(emails);
      setError(
        emails.length > MAX_SEARCH_EMAILS
          ? `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`
          : undefined
      );
    },
    []
  );

  const buttonOnClick = useCallback(() => {
    if (isListValid) {
      setDoSave(true);
    }
  }, [isListValid]);

  useEffect(() => {
    if (doSave && members.length > 0) {
      sendNotification({
        type: "success",
        title: "Batch add members",
        description:
          members.length > 1
            ? `${members.length} members were successfully added to this space.`
            : `${members.length} member was successfully added to this space.`,
      });

      // Check the diff between emails and members
      const missingEmails = emails.filter(
        (email) => !members.some((m) => m.email === email)
      );

      if (missingEmails.length > 0) {
        sendNotification({
          type: "error",
          title: "Some emails were not added",
          description: `The following emails were not added: ${missingEmails.join(", ")}`,
        });
      }

      onMembersUpdated(selectedMembers.concat(members));
      setIsOpen(false);
      setDoSave(false);
      setContent("");
      setEmails([]);
      setError(undefined);
    }
  }, [
    doSave,
    emails,
    members,
    onMembersUpdated,
    selectedMembers,
    sendNotification,
  ]);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button label="Batch add" icon={UserGroupIcon} size="sm" />
      </PopoverTrigger>
      <PopoverContent className="mr-2 p-4">
        <div className="text-sm font-normal text-element-700">
          Enter the list of emails, one per line, max {MAX_SEARCH_EMAILS} per
          batch.
        </div>
        <TextArea
          onChange={onTextAreaChange}
          value={content}
          disabled={isMembersLoading}
        ></TextArea>
        {error && <div className="text-xs text-warning-500">{error}</div>}
        <div className="mt-3 flex flex-row justify-end gap-2">
          <Button
            label={buttonLabel}
            onClick={buttonOnClick}
            disabled={!isListValid || isMembersLoading}
            isLoading={isMembersLoading}
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
