import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  Checkbox,
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
  SearchInput,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ConversationWithoutContentType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { isBuilder, isOnlyUser } from "@dust-tt/types";
import moment from "moment";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useState } from "react";

import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import {
  useConversations,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { classNames, removeDiacritics, subFilter } from "@app/lib/utils";

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
  const { conversationsNavigationRef } = useConversationsNavigation();

  const { setSidebarOpen } = useContext(SidebarContext);
  const { conversations, isConversationsError } = useConversations({
    workspaceId: owner.sId,
  });
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    ConversationWithoutContentType[]
  >([]);
  const doDelete = useDeleteConversation(owner);

  const [showDeleteDialog, setShowDeleteDialog] = useState<
    "all" | "selection" | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string>("");
  const sendNotification = useSendNotification();

  const toggleMultiSelect = useCallback(() => {
    setIsMultiSelect((prev) => !prev);
    setSelectedConversations([]);
  }, [setIsMultiSelect, setSelectedConversations]);

  const toggleConversationSelection = useCallback(
    (c: ConversationWithoutContentType) => {
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

  const groupConversationsByDate = (
    conversations: ConversationWithoutContentType[]
  ) => {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const lastWeek = moment().subtract(1, "weeks").startOf("day");
    const lastMonth = moment().subtract(1, "months").startOf("day");
    const lastYear = moment().subtract(1, "years").startOf("day");

    const groups: Record<GroupLabel, ConversationWithoutContentType[]> = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
      "Last 12 Months": [],
      Older: [],
    };

    conversations.forEach((conversation: ConversationWithoutContentType) => {
      if (
        titleFilter &&
        !subFilter(
          removeDiacritics(titleFilter).toLowerCase(),
          removeDiacritics(conversation.title ?? "").toLowerCase()
        )
      ) {
        return;
      }

      const updatedAt = moment(conversation.updated ?? conversation.created);
      if (updatedAt.isSameOrAfter(today)) {
        groups["Today"].push(conversation);
      } else if (updatedAt.isSameOrAfter(yesterday)) {
        groups["Yesterday"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastWeek)) {
        groups["Last Week"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastMonth)) {
        groups["Last Month"].push(conversation);
      } else if (updatedAt.isSameOrAfter(lastYear)) {
        groups["Last 12 Months"].push(conversation);
      } else {
        groups["Older"].push(conversation);
      }
    });

    return groups;
  };

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(conversations)
    : ({} as Record<GroupLabel, ConversationWithoutContentType[]>);

  const { setAnimate } = useContext(InputBarContext);

  const triggerInputAnimation = () => {
    setAnimate(true);
  };

  return (
    <>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog !== null}
        isDeleting={isDeleting}
        onClose={() => setShowDeleteDialog(null)}
        onDelete={showDeleteDialog === "all" ? deleteAll : deleteSelection}
        type={showDeleteDialog || "all"}
        selectedCount={selectedConversations.length}
      />
      <div
        className={classNames(
          "flex grow flex-col",
          isOnlyUser(owner)
            ? "border-t border-structure-200 dark:border-structure-200-night"
            : ""
        )}
      >
        <div className="flex h-0 min-h-full w-full overflow-y-auto">
          <div className="flex w-full flex-col">
            {isMultiSelect ? (
              <div className="z-50 flex justify-between gap-2 border-b border-border-dark/60 p-2 dark:border-border-dark/60">
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
              <div className="z-50 flex justify-end gap-2 p-2">
                <SearchInput
                  name="search"
                  placeholder="Search"
                  value={titleFilter}
                  onChange={setTitleFilter}
                />
                <Button
                  href={`/w/${owner.sId}/assistant/new`}
                  shallow
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" icon={MoreIcon} variant="outline" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Assistants</DropdownMenuLabel>
                    <DropdownMenuItem
                      href={`/w/${owner.sId}/builder/assistants/create`}
                      icon={PlusIcon}
                      label="Create new assistant"
                      data-gtm-label="assistantCreationButton"
                      data-gtm-location="sidebarMenu"
                    />
                    {isBuilder(owner) && (
                      <DropdownMenuItem
                        href={`/w/${owner.sId}/builder/assistants`}
                        icon={RobotIcon}
                        label="Manage assistants"
                        data-gtm-label="assistantManagementButton"
                        data-gtm-location="sidebarMenu"
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
              <Label className="px-3 py-4 text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                Error loading conversations
              </Label>
            )}
            <NavigationList
              className="w-full px-3"
              ref={conversationsNavigationRef}
            >
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
            </NavigationList>
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
  conversations: ConversationWithoutContentType[];
  dateLabel: string;
  isMultiSelect: boolean;
  selectedConversations: ConversationWithoutContentType[];
  toggleConversationSelection: (c: ConversationWithoutContentType) => void;
  router: NextRouter;
  owner: WorkspaceType;
}) => {
  if (!conversations.length) {
    return null;
  }

  return (
    <>
      <NavigationListLabel label={dateLabel} isSticky />
      {conversations.map((conversation) => (
        <RenderConversation
          key={conversation.sId}
          conversation={conversation}
          {...props}
        />
      ))}
    </>
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
  conversation: ConversationWithoutContentType;
  isMultiSelect: boolean;
  selectedConversations: ConversationWithoutContentType[];
  toggleConversationSelection: (c: ConversationWithoutContentType) => void;
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
            className="bg-white dark:bg-black"
            checked={selectedConversations.includes(conversation)}
            onCheckedChange={() => toggleConversationSelection(conversation)}
          />
          <Label
            htmlFor={`conversation-${conversation.sId}`}
            className="ml-2 text-sm font-light text-muted-foreground dark:text-muted-foreground-night"
          >
            {conversationLabel}
          </Label>
        </div>
      ) : (
        <NavigationListItem
          selected={router.query.cId === conversation.sId}
          label={conversationLabel}
          href={`/w/${owner.sId}/assistant/${conversation.sId}`}
          shallow
        />
      )}
    </>
  );
};
