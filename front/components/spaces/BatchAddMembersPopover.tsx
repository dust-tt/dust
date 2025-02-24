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
import React, { useCallback, useState } from "react";

import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { isEmailValid } from "@app/lib/utils";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";

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
  const [isLoading, setIsLoading] = useState(false);

  const processEmails = useCallback((content: string) => {
    const emails = removeNulls(
      content
        .split("\n")
        .map((email) => email.trim())
        .filter((email) => isEmailValid(email))
    );
    const error =
      emails.length > MAX_SEARCH_EMAILS
        ? `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`
        : undefined;

    return { emails, error };
  }, []);

  const { emails, error } = processEmails(content);

  const buttonLabel =
    emails.length > 0 ? `Add ${emails.length} members` : "...";

  const onTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
    },
    []
  );

  async function onSave() {
    if (error) {
      sendNotification({
        type: "error",
        title: "Error adding members",
        description: error,
      });
      return;
    }

    setIsLoading(true);

    try {
      const emailsRes = await fetch(
        `/api/w/${owner.sId}/members/search?searchEmails=${emails.join(",")}`
      );
      const membersData: GetMembersResponseBody = await emailsRes.json();

      const members = membersData.members;
      const missingEmails = emails.filter(
        (email) => !membersData.members.some((m) => m.email === email)
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
      setContent("");
    } finally {
      setIsLoading(false);
    }
  }

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
          disabled={isLoading}
        />
        {error && <div className="text-xs text-warning-500">{error}</div>}
        <div className="mt-3 flex flex-row justify-end gap-2">
          <Button
            label={buttonLabel}
            onClick={onSave}
            disabled={!emails.length || isLoading}
            isLoading={isLoading}
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
