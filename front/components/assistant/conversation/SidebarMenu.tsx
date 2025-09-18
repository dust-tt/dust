import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  Checkbox,
  DocumentIcon,
  DotIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  FolderOpenIcon,
  Icon,
  Label,
  ListCheckIcon,
  MagicIcon,
  MoreIcon,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  RobotIcon,
  SearchInput,
  Spinner,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import moment from "moment";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";

import { CONVERSATION_VIEW_SCROLL_LAYOUT } from "@app/components/assistant/conversation/constant";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import {
  useConversations,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
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

  const { featureFlags, hasFeature } = useFeatureFlags({
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
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });
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

  // Handle "infinite" scroll
  // We only start with 10 conversations shown (no need more on mobile) and load more until we fill the parent container.
  // We use an intersection observer to detect when the bottom of the list is visible and load more conversations.
  // That way, the list starts lightweight and only show more conversations when needed.
  const CONVERSATIONS_PER_PAGE = 10;

  const [conversationsPage, setConversationsPage] = useState(0);

  const nextPage = useCallback(() => {
    setConversationsPage(conversationsPage + 1);
  }, [setConversationsPage, conversationsPage]);

  const previousEntry = useRef<IntersectionObserverEntry | undefined>(
    undefined
  );

  const { ref, inView, entry } = useInView({
    root: conversationsNavigationRef.current,
    threshold: 0,
  });

  useEffect(() => {
    if (
      // The observer is in view.
      inView &&
      // We have more conversations to show.
      conversations.length > conversationsPage * CONVERSATIONS_PER_PAGE &&
      // The entry is different from the previous one to avoid multiple calls for the same intersection.
      entry != previousEntry.current
    ) {
      previousEntry.current = entry;
      nextPage();
    }
  }, [inView, nextPage, entry, conversations.length, conversationsPage]);

  const conversationsByDate = conversations.length
    ? groupConversationsByDate(
        conversations.slice(0, (conversationsPage + 1) * CONVERSATIONS_PER_PAGE)
      )
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" icon={MoreIcon} variant="outline" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {!isRestrictedFromAgentCreation && (
                      <>
                        <DropdownMenuLabel>Agent</DropdownMenuLabel>
                        <DropdownMenuItem
                          href={getAgentBuilderRoute(owner.sId, "new")}
                          icon={DocumentIcon}
                          label="New agent from scratch"
                          data-gtm-label="assistantCreationButton"
                          data-gtm-location="sidebarMenu"
                        />
                        <DropdownMenuItem
                          href={getAgentBuilderRoute(owner.sId, "create")}
                          icon={MagicIcon}
                          label="New agent from template"
                          data-gtm-label="assistantCreationButton"
                          data-gtm-location="sidebarMenu"
                        />
                        {hasFeature("agent_to_yaml") && (
                          <DropdownMenuItem
                            icon={
                              isUploadingYAML ? (
                                <Spinner size="xs" />
                              ) : (
                                FolderOpenIcon
                              )
                            }
                            label={
                              isUploadingYAML
                                ? "Uploading..."
                                : "New agent from YAML"
                            }
                            disabled={isUploadingYAML}
                            onClick={triggerYAMLUpload}
                            data-gtm-label="yamlUploadButton"
                            data-gtm-location="sidebarMenu"
                          />
                        )}
                      </>
                    )}
                    {isBuilder(owner) && (
                      <DropdownMenuItem
                        href={getAgentBuilderRoute(owner.sId, "manage")}
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
              className="dd-privacy-mask h-full w-full px-3"
              viewportRef={conversationsNavigationRef}
            >
              {conversationsByDate && conversations.length > 0 && (
                <>
                  {Object.keys(conversationsByDate).map((dateLabel) => (
                    <RenderConversations
                      key={dateLabel}
                      conversations={
                        conversationsByDate[dateLabel as GroupLabel]
                      }
                      dateLabel={dateLabel}
                      isMultiSelect={isMultiSelect}
                      selectedConversations={selectedConversations}
                      toggleConversationSelection={toggleConversationSelection}
                      router={router}
                      owner={owner}
                    />
                  ))}
                  {conversationsNavigationRef.current && (
                    <div
                      // Change the key each page to force a re-render and get a new entry
                      key={`infinite-scroll-conversation-${conversationsPage}`}
                      id="infinite-scroll-conversations"
                      ref={ref}
                      style={{ height: "2px" }}
                    />
                  )}
                </>
              )}
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
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
  const conversationLabel =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    conversation.title ||
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  const UnreadIcon = () => (
    <Icon visual={DotIcon} className="-ml-1 -mr-2 text-highlight" />
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
              ? ExclamationCircleIcon
              : conversation.unread
                ? UnreadIcon
                : undefined
          }
          label={conversationLabel}
          className={conversation.unread ? "font-medium" : undefined}
          onClick={async () => {
            // Side bar is the floating sidebar that appears when the screen is small.
            if (sidebarOpen) {
              setSidebarOpen(false);
              // Wait a bit before moving to the new conversation to avoid the sidebar from flickering.
              await new Promise((resolve) => setTimeout(resolve, 600));
            }
            await router.push(
              `/w/${owner.sId}/assistant/${conversation.sId}`,
              undefined,
              {
                shallow: true,
              }
            );
          }}
        />
      )}
    </>
  );
};
