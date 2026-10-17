import {
  Announcement01,
  Avatar,
  BarChart01,
  BookOpen01,
  Button,
  CheckDone01,
  ChevronDown,
  Clock,
  cn,
  CollapseButton,
  Counter,
  Cube01,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  GitBranch01,
  Heart,
  Icon,
  IntersectDust,
  LayoutLeft,
  Lightbulb04,
  Link01,
  LogOut01,
  MessageChatCircle,
  MessagePlusCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Planet,
  Plus,
  PuzzlePiece01,
  Robot,
  ScrollArea,
  SearchInput,
  Separator,
  Settings01,
  ShapesPlus,
  SlackLogo,
  Star01,
  Trash01,
  User01,
  ZapOff,
} from "@dust-tt/sparkle";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { Conversation } from "../data";
import {
  CURRENT_USER,
  groupConversationsByDate,
  PODS,
  type PodSummary,
  RELATIVE_DATE_BUCKETS,
  SIDEBAR_CONVERSATIONS,
  STARRED_PODS,
  WORKSPACE_NAME,
} from "./discoverAgentData";

// ── Navigation (front/components/navigation/Navigation.tsx) ─────────────────
// Desktop branch only: the collapsible w-80 column plus the edge handle that
// reopens it. The mobile Sheet is out of scope for this prototype.

interface DiscoverAgentNavigationProps {
  isNavigationBarOpen: boolean;
  setNavigationBarOpen: (isOpen: boolean) => void;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function DiscoverAgentNavigation({
  isNavigationBarOpen,
  setNavigationBarOpen,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: DiscoverAgentNavigationProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 overflow-x-hidden",
        "text-primary",
        "bg-app-background"
      )}
    >
      <div
        className={cn(
          "transition-width flex-none overflow-hidden duration-150 ease-out flex flex-col",
          isNavigationBarOpen ? "w-80" : "w-0"
        )}
      >
        <div className="flex-1 bg-app-background inset-y-0 z-0 flex w-80 flex-col">
          <NavigationSidebar onCollapse={() => setNavigationBarOpen(false)}>
            <AgentSidebarMenu
              activeConversationId={activeConversationId}
              onSelectConversation={onSelectConversation}
              onNewConversation={onNewConversation}
            />
          </NavigationSidebar>
        </div>
      </div>

      <div
        // center handle vertically (top at 50% + translate half the handle height)
        className={cn(
          "fixed z-40 hidden lg:top-1/2 lg:flex lg:-translate-y-1/2",
          isNavigationBarOpen ? "lg:ml-80" : ""
        )}
      >
        {!isNavigationBarOpen && (
          <div
            onClick={() => setNavigationBarOpen(true)}
            className="lg:top-1/2 lg:flex lg:w-5"
          >
            <CollapseButton direction="right" variant="light" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── NavigationSidebar (front/components/navigation/NavigationSidebar.tsx) ───

type TopNavTab = "conversations" | "spaces" | "admin";

const TOP_NAV_TABS: {
  id: TopNavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "conversations", label: "Work", icon: IntersectDust },
  { id: "spaces", label: "Spaces", icon: Planet },
  { id: "admin", label: "Admin", icon: Settings01 },
];

function NavigationSidebar({
  children,
  onCollapse,
}: {
  children: ReactNode;
  onCollapse: () => void;
}) {
  const [currentTab, setCurrentTab] = useState<TopNavTab>("conversations");

  return (
    <div className="flex min-w-0 grow flex-col pt-2">
      <div className={cn("flex flex-col gap-3")}>
        <NavTabPill
          value={currentTab}
          onValueChange={(value) => {
            // The collapse pill shares the tab list but is not a tab.
            if (value !== "close-icon") {
              setCurrentTab(value as TopNavTab);
            }
          }}
        >
          <NavTabPillList className="mx-sidebar-side-spacing">
            {TOP_NAV_TABS.map((tab) => (
              <div key={tab.id}>
                <NavTabPillTrigger
                  className="notranslate"
                  value={tab.id}
                  icon={tab.icon}
                >
                  {tab.label}
                </NavTabPillTrigger>
              </div>
            ))}
            <div className="flex flex-grow justify-end">
              <NavTabPillTrigger
                icon={LayoutLeft}
                value="close-icon"
                onClick={onCollapse}
              />
            </div>
          </NavTabPillList>
          {TOP_NAV_TABS.map((tab) => (
            // NavTabPillContent is display:contents, so it generates no box
            // and margins set on it do nothing — the side spacing has to go
            // on the list itself, as the other tabs' menus already do.
            <NavTabPillContent key={tab.id} value={tab.id}>
              <NavigationList className="mx-sidebar-side-spacing" />
            </NavTabPillContent>
          ))}
        </NavTabPill>
      </div>
      <div className="flex grow flex-col">{children}</div>
      <SidebarUserMenu />
    </div>
  );
}

// ── AgentSidebarMenu (front/components/assistant/conversation/SidebarMenu.tsx)

interface AgentSidebarMenuProps {
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

function AgentSidebarMenu({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: AgentSidebarMenuProps) {
  const [titleFilter, setTitleFilter] = useState("");

  const filteredConversations = useMemo(() => {
    const needle = titleFilter.trim().toLowerCase();
    if (!needle) {
      return SIDEBAR_CONVERSATIONS;
    }
    return SIDEBAR_CONVERSATIONS.filter((c) =>
      c.title.toLowerCase().includes(needle)
    );
  }, [titleFilter]);

  return (
    <div className="flex grow flex-col">
      <div className="flex h-0 min-h-full w-full">
        <div className="flex w-full flex-col">
          <div className="z-50 flex justify-end gap-2 p-sidebar-side-spacing">
            <div className="flex-1">
              <SearchInput
                name="search"
                placeholder="Search"
                value={titleFilter}
                onChange={setTitleFilter}
              />
            </div>
            <div className="flex gap-2">
              <Button
                label="New"
                icon={MessagePlusCircle}
                variant="highlight"
                className="shrink-0"
                tooltip="Create a new conversation"
                onClick={onNewConversation}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <NavigationListWithInbox
              conversations={filteredConversations}
              activeConversationId={activeConversationId}
              onSelectConversation={onSelectConversation}
              topSection={<NavItemsSection />}
              starredSection={<StarredSection />}
              podsSection={<PodsSection />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// "For you" / "Agents" / "Skills" entries at the top of the scrolled list.
function NavItemsSection() {
  return (
    <NavigationList className="mx-sidebar-side-spacing pt-1">
      <NavigationListItem
        label="For you"
        icon={Lightbulb04}
        suffix={<Counter value={2} size="xs" variant="highlight" />}
      />
      <NavigationListItem
        icon={Robot}
        label="Agents"
        keepHoverOnMoreMenu
        moreMenu={
          <NewBuilderItemMenu
            label="New agent"
            items={[
              { label: "From scratch", icon: Robot },
              { label: "From template", icon: Lightbulb04 },
            ]}
          />
        }
      />
      <NavigationListItem
        icon={PuzzlePiece01}
        label="Skills"
        keepHoverOnMoreMenu
        moreMenu={
          <NewBuilderItemMenu
            label="New skill"
            items={[
              { label: "From scratch", icon: PuzzlePiece01 },
              { label: "From existing", icon: BookOpen01 },
            ]}
          />
        }
      />
    </NavigationList>
  );
}

function NewBuilderItemMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <div
      className={cn(
        "absolute right-2 top-1.5",
        "transition-opacity",
        "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
        "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
        "has-[[data-state=open]]:opacity-100"
      )}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            icon={Plus}
            label="New"
            variant="ghost-secondary"
            className="data-[state=open]:bg-hover"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="center"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel label={label} />
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PodListItem({
  summary,
  isStarred,
}: {
  summary: PodSummary;
  isStarred: boolean;
}) {
  return (
    <NavigationListItem
      icon={Cube01}
      label={summary.space.name}
      hasActivity={summary.hasActivity}
      count={summary.unreadCount > 0 ? summary.unreadCount : undefined}
      moreMenu={
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <NavigationListItemAction />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              label={isStarred ? "Unstar" : "Star"}
              icon={Star01}
            />
            <DropdownMenuItem label="Pod settings" icon={Settings01} />
            <Separator className="my-1" />
            <DropdownMenuItem label="Leave" icon={LogOut01} variant="warning" />
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}

function StarredSection() {
  const [open, setOpen] = useState(true);
  const VISIBLE_STARRED = 5;

  if (STARRED_PODS.length === 0) {
    return null;
  }

  return (
    <NavigationList className="mx-sidebar-side-spacing">
      <NavigationListCollapsibleSection
        label="Starred"
        type="collapse"
        visibleItems={VISIBLE_STARRED}
        open={open}
        onOpenChange={setOpen}
      >
        {STARRED_PODS.map((summary) => (
          <PodListItem key={summary.space.id} summary={summary} isStarred />
        ))}
      </NavigationListCollapsibleSection>
    </NavigationList>
  );
}

function PodsSection() {
  const [open, setOpen] = useState(true);
  const VISIBLE_PODS = 4;
  const hidden = PODS.slice(VISIBLE_PODS);
  const hiddenOverflowCount = hidden.reduce((sum, s) => sum + s.unreadCount, 0);
  const hiddenOverflowHasActivity = hidden.some((s) => s.hasActivity);

  return (
    <NavigationList className="mx-sidebar-side-spacing flex-shrink-0">
      <NavigationListCollapsibleSection
        label="Pods"
        type="collapse"
        visibleItems={VISIBLE_PODS}
        overflowCount={hiddenOverflowCount}
        overflowHasActivity={hiddenOverflowHasActivity}
        open={open}
        onOpenChange={setOpen}
        action={
          <>
            <Button
              size="xs"
              icon={Plus}
              label="New"
              variant="ghost-secondary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <Button size="xs" icon={DotsHorizontal} variant="ghost" />
          </>
        }
      >
        {PODS.map((summary) => (
          <PodListItem
            key={summary.space.id}
            summary={summary}
            isStarred={false}
          />
        ))}
      </NavigationListCollapsibleSection>
    </NavigationList>
  );
}

interface NavigationListWithInboxProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  topSection?: ReactNode;
  starredSection?: ReactNode;
  podsSection?: ReactNode;
}

function NavigationListWithInbox({
  conversations,
  activeConversationId,
  onSelectConversation,
  topSection,
  starredSection,
  podsSection,
}: NavigationListWithInboxProps) {
  // The Radix ScrollArea root never scrolls (overflow-hidden); the inner
  // viewport does. Keep it in state so the observer re-binds once mounted.
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null
  );
  const [scrollTopSentinel, setScrollTopSentinel] =
    useState<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isConversationsOpen, setIsConversationsOpen] = useState(true);

  useEffect(() => {
    if (
      !scrollViewport ||
      !scrollTopSentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { root: scrollViewport }
    );
    observer.observe(scrollTopSentinel);

    return () => observer.disconnect();
  }, [scrollViewport, scrollTopSentinel]);

  const conversationsByDate = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations]
  );

  // Empty groups render nothing, so the first non-empty one is the first the
  // user actually sees — that's the one that skips the top padding.
  const nonEmptyDateLabels = RELATIVE_DATE_BUCKETS.filter(
    (bucket) => conversationsByDate[bucket].length > 0
  );

  return (
    <ScrollArea
      viewportRef={setScrollViewport}
      className="dd-privacy-mask h-full w-full"
    >
      <div ref={setScrollTopSentinel} className="h-px" aria-hidden />
      <div className="sticky top-0 z-30 h-0" aria-hidden>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-8 backdrop-blur-[4px]",
            "bg-app-background/100",
            "[mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]",
            "transition-opacity duration-200",
            isScrolled ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
      <div className="flex flex-col gap-4">
        {topSection}
        {starredSection}
        {podsSection}
        <NavigationList className="mx-sidebar-side-spacing">
          <NavigationListCollapsibleSection
            label="Conversations"
            type="collapse"
            open={isConversationsOpen}
            onOpenChange={setIsConversationsOpen}
            action={
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xmini"
                    icon={DotsHorizontal}
                    variant="ghost"
                    aria-label="Conversations options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent onFocusOutside={(e) => e.preventDefault()}>
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label="Hide triggered"
                    icon={ZapOff}
                    disabled
                  />
                  <DropdownMenuItem label="Edit history" icon={CheckDone01} />
                  <DropdownMenuItem
                    label="Clear history"
                    variant="warning"
                    icon={Trash01}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {nonEmptyDateLabels.map((dateLabel, index) => (
              <ConversationList
                key={dateLabel}
                conversations={conversationsByDate[dateLabel]}
                dateLabel={dateLabel}
                isFirstGroup={index === 0}
                activeConversationId={activeConversationId}
                onSelectConversation={onSelectConversation}
              />
            ))}
          </NavigationListCollapsibleSection>
        </NavigationList>
      </div>
    </ScrollArea>
  );
}

function ConversationList({
  conversations,
  dateLabel,
  isFirstGroup,
  activeConversationId,
  onSelectConversation,
}: {
  conversations: Conversation[];
  dateLabel: string;
  isFirstGroup: boolean;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
}) {
  if (!conversations.length) {
    return null;
  }

  return (
    <div className="sm:flex sm:flex-col sm:gap-0.5">
      {/* Compact overline so date groups read as a level below the
       * (semibold) section titles rather than competing with them. The top
       * padding separates a group from the one above it, so the first group
       * — which follows the section header — does without it. */}
      <NavigationListCompactLabel
        label={dateLabel}
        isSticky
        className={cn("bg-app-background", isFirstGroup && "pt-2")}
      />
      {conversations.map((conversation) => (
        <NavigationListItem
          key={conversation.id}
          selected={activeConversationId === conversation.id}
          status="idle"
          label={conversation.title}
          className="cursor-grab active:cursor-grabbing"
          onClick={() => onSelectConversation(conversation.id)}
          moreMenu={
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <NavigationListItemAction />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem label="Rename conversation" icon={Edit04} />
                <DropdownMenuItem
                  label="Branch conversation"
                  icon={GitBranch01}
                />
                <Separator className="my-1" />
                <DropdownMenuItem label="Copy link" icon={Link01} />
                <Separator className="my-1" />
                <DropdownMenuItem
                  label="Delete"
                  icon={Trash01}
                  variant="warning"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      ))}
    </div>
  );
}

// ── SidebarUserMenu (front/components/UserMenu.tsx) ─────────────────────────

function SidebarUserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-hover data-[state=open]:bg-selected rounded-xl p-2 m-2">
        <div className="group flex cursor-pointer items-center justify-between gap-2">
          <span className="sr-only">Open user menu</span>
          <div className="flex gap-2 items-center">
            <Avatar
              size="sm"
              visual={
                CURRENT_USER.portrait ??
                "https://gravatar.com/avatar/anonymous?d=mp"
              }
              clickable
              isRounded
            />
            <div className="flex min-w-0 flex-1 flex-col items-start text-left">
              <span
                className={cn(
                  "heading-sm w-full truncate transition-colors",
                  "text-foreground"
                )}
              >
                {CURRENT_USER.firstName}
              </span>
              <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground">
                {WORKSPACE_NAME}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <Icon
              visual={ChevronDown}
              className="text-muted-foreground group-hover:text-primary-400 group-active:text-primary-950"
            />
          </div>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64"
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Help" icon={Heart} />
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuLabel label="Learn about Dust" />
              <DropdownMenuItem
                label="Guides & Documentation"
                icon={BookOpen01}
              />
              <DropdownMenuItem
                label="Join the Slack Community"
                icon={SlackLogo}
              />
              <DropdownMenuLabel label="Ask questions" />
              <DropdownMenuItem label="Ask @help" icon={MessageChatCircle} />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuItem label="Dust Academy" icon={BookOpen01} />
        <DropdownMenuItem label="Changelog" icon={Announcement01} />
        <Separator className="my-1" />
        <DropdownMenuLabel label="Account" />
        <DropdownMenuItem label="Personal Settings" icon={User01} />
        <DropdownMenuItem label="Tools" icon={ShapesPlus} />
        <DropdownMenuItem label="Automations" icon={Clock} />
        <DropdownMenuItem label="Analytics" icon={BarChart01} />
        <Separator className="my-1" />
        <DropdownMenuItem label="Sign out" icon={LogOut01} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
