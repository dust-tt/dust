import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  Checkbox,
  ClockIcon,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  InformationCircleIcon,
  Label,
  ListCheckIcon,
  MagicIcon,
  MoreIcon,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  RobotIcon,
  SearchInput,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import moment from "moment";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useState } from "react";

import { CONVERSATION_VIEW_SCROLL_LAYOUT } from "@app/components/assistant/conversation/constant";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useConversations,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";
import { isBuilder } from "@app/types";

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

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

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
    const total = selectedConversations.length;
    let successCount = 0;
    if (total > 0) {
      for (const conversation of selectedConversations) {
        const ok = await doDelete(conversation);
        if (ok) {
          successCount += 1;
        }
      }
      toggleMultiSelect();
    }
    setIsDeleting(false);
    setShowDeleteDialog(null);
    if (!total) {
      return;
    }
    if (successCount === total) {
      sendNotification({
        type: "success",
        title: "Conversations successfully deleted",
        description: `${total} conversation${total > 1 ? "s" : ""} have been deleted.`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: "Failed to delete conversations",
        description: `Could not delete the selected ${total > 1 ? "conversations" : "conversation"}.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: "Some conversations couldn’t be deleted",
        description: `Deleted ${successCount} of ${total} conversations.`,
      });
    }
  }, [doDelete, selectedConversations, sendNotification, toggleMultiSelect]);

  const deleteAll = useCallback(async () => {
    setIsDeleting(true);
    const total = conversations.length;
    let successCount = 0;
    for (const conversation of conversations) {
      const ok = await doDelete(conversation);
      if (ok) {
        successCount += 1;
      }
    }
    if (!total) {
      return;
    }
    if (successCount === total) {
      sendNotification({
        type: "success",
        title: "Conversations successfully deleted",
        description: `${total} conversation${total > 1 ? "s" : ""} have been deleted.`,
      });
    } else if (successCount === 0) {
      sendNotification({
        type: "error",
        title: "Failed to delete conversations",
        description: "Could not delete conversation history.",
      });
    } else {
      sendNotification({
        type: "error",
        title: "Some conversations couldn’t be deleted",
        description: `Deleted ${successCount} of ${total} conversations.`,
      });
    }
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

  const handleNewClick = useCallback(async () => {
    setSidebarOpen(false);
    const { cId } = router.query;
    const isNewConversation =
      router.pathname === "/w/[wId]/assistant/[cId]" &&
      typeof cId === "string" &&
      cId === "new";
    if (isNewConversation) {
      setAnimate(true);
      document.getElementById(CONVERSATION_VIEW_SCROLL_LAYOUT)?.scrollTo(0, 0);
    }
  }, [setSidebarOpen, router, setAnimate]);

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
      <div className="flex grow flex-col">
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
                  label="New"
                  href={`/w/${owner.sId}/assistant/new`}
                  icon={ChatBubbleBottomCenterTextIcon}
                  className="shrink"
                  tooltip="Create a new conversation"
                  onClick={handleNewClick}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" icon={MoreIcon} variant="outline" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {!isRestrictedFromAgentCreation && (
                      <>
                        <DropdownMenuLabel>Agent</DropdownMenuLabel>
                        <DropdownMenuItem
                          href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`}
                          icon={DocumentIcon}
                          label="New agent from scratch"
                          data-gtm-label="assistantCreationButton"
                          data-gtm-location="sidebarMenu"
                        />
                        <DropdownMenuItem
                          href={`/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`}
                          icon={MagicIcon}
                          label="New agent from template"
                          data-gtm-label="assistantCreationButton"
                          data-gtm-location="sidebarMenu"
                        />
                      </>
                    )}
                    {isBuilder(owner) && (
                      <DropdownMenuItem
                        href={`/w/${owner.sId}/builder/assistants`}
                        icon={RobotIcon}
                        label="Manage agents"
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
              className="dd-privacy-mask w-full px-3"
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
      <NavigationListLabel
        label={dateLabel}
        isSticky
        className="bg-muted-background dark:bg-muted-background-night"
      />
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

  const ActionRequiredIcon = () => (
    <Icon visual={InformationCircleIcon} className="text-golden-700" />
  );

  return (
    <>
      {isMultiSelect ? (
        <div className="flex items-center px-2 py-2">
          <Checkbox
            id={`conversation-${conversation.sId}`}
            className="bg-background dark:bg-background-night"
            checked={selectedConversations.includes(conversation)}
            onCheckedChange={() => toggleConversationSelection(conversation)}
          />
          <Label
            htmlFor={`conversation-${conversation.sId}`}
            className="copy-sm ml-2 text-muted-foreground dark:text-muted-foreground-night"
          >
            {conversationLabel}
          </Label>
        </div>
      ) : (
        <NavigationListItem
          selected={router.query.cId === conversation.sId}
          icon={
            conversation.actionRequired
              ? ActionRequiredIcon
              : conversation.unread
                ? ClockIcon
                : undefined
          }
          label={conversationLabel}
          href={`/w/${owner.sId}/assistant/${conversation.sId}`}
          shallow
        />
      )}
    </>
  );
};
