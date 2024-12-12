import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  Checkbox,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Label,
  ListCheckIcon,
  MoreIcon,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ConversationType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isBuilder, isOnlyUser } from "@dust-tt/types";
import moment from "moment";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useState } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";

type AssistantSidebarMenuProps = {
  owner: WorkspaceType;
};

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

export function AssistantSidebarMenu({ owner }: AssistantSidebarMenuProps) {
  const router = useRouter();
  const { setSidebarOpen } = useContext(SidebarContext);
  const { conversations, isConversationsError } = useConversations({
    workspaceId: owner.sId,
  });
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    ConversationType[]
  >([]);
  const doDelete = useDeleteConversation(owner);

  const [showDeleteDialog, setShowDeleteDialog] = useState<
    "all" | "selection" | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const sendNotification = useSendNotification();

  const toggleMultiSelect = useCallback(() => {
    setIsMultiSelect((prev) => !prev);
    setSelectedConversations([]);
  }, [setIsMultiSelect, setSelectedConversations]);

  const toggleConversationSelection = useCallback(
    (c: ConversationType) => {
      if (selectedConversations.includes(c)) {
        setSelectedConversations((prev) => prev.filter((id) => id !== c));
      } else {
        setSelectedConversations((prev) => [...prev, c]);
      }
    },
    [selectedConversations, setSelectedConversations]
  );

  const deleteSelection = useCallback(async () => {
    setIsDeleting(true);
    if (selectedConversations.length > 0) {
      for (const conversation of selectedConversations) {
        await doDelete(conversation);
      }
      toggleMultiSelect();
    }
    setIsDeleting(false);
    setShowDeleteDialog(null);
    sendNotification({
      type: "success",
      title: "Conversations successfully deleted",
      description:
        selectedConversations.length > 1
          ? `${selectedConversations.length} conversations have been deleted.`
          : `${selectedConversations.length} conversation has been deleted.`,
    });
  }, [doDelete, selectedConversations, sendNotification, toggleMultiSelect]);

  const deleteAll = useCallback(async () => {
    setIsDeleting(true);
    for (const conversation of conversations) {
      await doDelete(conversation);
    }
    sendNotification({
      type: "success",
      title: "Conversations successfully deleted",
      description:
        conversations.length > 1
          ? `${conversations.length} conversations have been deleted.`
          : `${conversations.length} conversation has been deleted.`,
    });
    setIsDeleting(false);
    setShowDeleteDialog(null);
  }, [conversations, doDelete, sendNotification]);

  const groupConversationsByDate = (conversations: ConversationType[]) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: Record<GroupLabel, ConversationType[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last 12 Months": [],
      Older: [],
    };

    conversations.forEach((conversation: ConversationType) => {
      const createdDate = moment(conversation.created);
      if (createdDate.isSameOrAfter(today)) {
        groups["Today"].push(conversation);
      } else if (createdDate.isSameOrAfter(yesterday)) {
        groups["Yesterday"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastWeek)) {
        groups["Last Week"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastMonth)) {
        groups["Last Month"].push(conversation);
      } else if (createdDate.isSameOrAfter(lastYear)) {
        groups["Last 12 Months"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(conversations)
    : ({} as Record<GroupLabel, ConversationType[]>);

  const { setAnimate } = useContext(InputBarContext);

  const triggerInputAnimation = () => {
    setAnimate(true);
  };

  return (
    <>
      <Dialog
        title="Clear conversation history"
        isOpen={showDeleteDialog === "all"}
        onCancel={() => setShowDeleteDialog(null)}
        onValidate={deleteAll}
        validateVariant="warning"
        isSaving={isDeleting}
      >
        Are you sure you want to delete ALL conversations&nbsp;?
        <br />
        <b>This action cannot be undone.</b>
      </Dialog>
      <Dialog
        title="Delete conversations"
        isOpen={showDeleteDialog === "selection"}
        onCancel={() => setShowDeleteDialog(null)}
        onValidate={deleteSelection}
        validateVariant="warning"
        isSaving={isDeleting}
      >
        Are you sure you want to delete {selectedConversations.length}{" "}
        conversations?
        <br />
        <b>This action cannot be undone.</b>
      </Dialog>
      <div
        className={classNames(
          "flex grow flex-col",
          isOnlyUser(owner) ? "border-t border-structure-200" : ""
        )}
      >
        <div className="flex h-0 min-h-full w-full overflow-y-auto">
          <div className="flex w-full flex-col">
            {isMultiSelect ? (
              <div className="z-50 flex justify-between gap-2 p-2 shadow-tale">
                <Button
                  variant={
                    selectedConversations.length === 0 ? "outline" : "warning"
                  }
                  label="Delete"
                  disabled={selectedConversations.length === 0}
                  onClick={() => setShowDeleteDialog("selection")}
                />
                <Button
                  variant="ghost"
                  icon={XMarkIcon}
                  onClick={toggleMultiSelect}
                />
              </div>
            ) : (
              <div className="z-50 flex justify-end gap-2 p-2 shadow-tale">
                <Button
                  href={`/w/${owner.sId}/assistant/new`}
                  label="New"
                  icon={ChatBubbleBottomCenterPlusIcon}
                  className="shrink"
                  tooltip="Create a new conversation"
                  onClick={() => {
                    setSidebarOpen(false);
                    const { cId } = router.query;
                    const isNewConversation =
                      router.pathname === "/w/[wId]/assistant/[cId]" &&
                      typeof cId === "string" &&
                      cId === "new";

                    if (isNewConversation && triggerInputAnimation) {
                      triggerInputAnimation();
                    }
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" icon={MoreIcon} variant="outline" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Assistants</DropdownMenuLabel>
                    <DropdownMenuItem
                      label="Create new assistant"
                      href={`/w/${owner.sId}/builder/assistants/create`}
                      icon={PlusIcon}
                    />
                    {isBuilder(owner) && (
                      <DropdownMenuItem
                        href={`/w/${owner.sId}/builder/assistants`}
                        label="Manage assistants"
                        icon={RobotIcon}
                      />
                    )}
                    <DropdownMenuLabel>Conversations</DropdownMenuLabel>
                    <DropdownMenuItem
                      label="Edit conversations"
                      onClick={toggleMultiSelect}
                      icon={ListCheckIcon}
                      disabled={conversations.length === 0}
                    />
                    <DropdownMenuItem
                      label="Clear conversation history"
                      onClick={() => setShowDeleteDialog("all")}
                      icon={TrashIcon}
                      disabled={conversations.length === 0}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {isConversationsError && (
              <Label className="py-1 text-xs font-medium text-element-800">
                Error loading conversations
              </Label>
            )}
            <ScrollArea className="w-full px-2">
              {conversationsByDate &&
                Object.keys(conversationsByDate).map((dateLabel) => (
                  <RenderConversations
                    key={dateLabel}
                    conversations={conversationsByDate[dateLabel as GroupLabel]}
                    dateLabel={dateLabel}
                    isMultiSelect={isMultiSelect}
                    selectedConversations={selectedConversations}
                    toggleConversationSelection={toggleConversationSelection}
                    router={router}
                    owner={owner}
                  />
                ))}
            </ScrollArea>
          </div>
        </div>
      </div>
    </>
  );
}

const RenderConversations = ({
  conversations,
  dateLabel,
  ...props
}: {
  conversations: ConversationType[];
  dateLabel: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationType[];
  toggleConversationSelection: (c: ConversationType) => void;
  router: NextRouter;
  owner: WorkspaceType;
}) => {
  if (!conversations.length) {
    return null;
  }

  return (
    <div>
      <NavigationListLabel label={dateLabel} />
      <NavigationList>
        {conversations.map((conversation) => (
          <RenderConversation
            key={conversation.sId}
            conversation={conversation}
            {...props}
          />
        ))}
      </NavigationList>
    </div>
  );
};

const RenderConversation = ({
  conversation,
  isMultiSelect,
  selectedConversations,
  toggleConversationSelection,
  router,
  owner,
}: {
  conversation: ConversationType;
  isMultiSelect: boolean;
  selectedConversations: ConversationType[];
  toggleConversationSelection: (c: ConversationType) => void;
  router: NextRouter;
  owner: WorkspaceType;
}) => {
  const conversationLabel =
    conversation.title ||
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  return (
    <>
      {isMultiSelect ? (
        <div className="flex items-center px-2 py-2">
          <Checkbox
            id={`conversation-${conversation.sId}`}
            className="bg-white"
            checked={selectedConversations.includes(conversation)}
            onCheckedChange={() => toggleConversationSelection(conversation)}
          />
          <Label
            htmlFor={`conversation-${conversation.sId}`}
            className="ml-2 text-sm font-light text-muted-foreground"
          >
            {conversationLabel}
          </Label>
        </div>
      ) : (
        <NavigationListItem
          selected={router.query.cId === conversation.sId}
          label={conversationLabel}
          href={`/w/${owner.sId}/assistant/${conversation.sId}`}
        />
      )}
    </>
  );
};
