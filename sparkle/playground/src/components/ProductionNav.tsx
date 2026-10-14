import {
  Avatar,
  Button,
  CheckDone01,
  ChevronDown,
  Cube01,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Edit04,
  Heart,
  Icon,
  IntersectDust,
  Link01,
  LogOut01,
  MessagePlusCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Planet,
  Plus,
  PuzzlePiece01,
  Robot,
  ScrollArea,
  ScrollBar,
  SearchMd,
  Settings01,
  Trash01,
  User01,
  ZapOff,
} from "@dust-tt/sparkle";

import { mockUsers } from "../data";

// Production's left sidebar (front: NavigationSidebar, SidebarMenu,
// UnifiedSearchNav, UserMenu), with mock pods, past conversations and user.

export interface NavConversation {
  id: string;
  title: string;
  isRunning: boolean;
  createdAt: Date;
}

const USER = mockUsers[3];
const WORKSPACE = "Dust";

// The first one has a page (PodPage).
export const PODS = ["Pupchi launch", "Brand", "Growth"];

const DAY = 24 * 60 * 60 * 1000;

// Past conversations, to fill the list as in a lived-in workspace. Not
// clickable.
const PAST_CONVERSATIONS: NavConversation[] = [
  { title: "Puppy owner survey: key takeaways", days: 1 },
  { title: "Retail buyer meeting prep", days: 1 },
  { title: "Draft the Pupchi launch email", days: 4 },
  { title: "Compare treat COGS across suppliers", days: 6 },
  { title: "Summarize Q3 brand tracker", days: 20 },
  { title: "Ingredient policy for regulatory", days: 45 },
].map(({ title, days }) => ({
  id: `past-${title}`,
  title,
  isRunning: false,
  createdAt: new Date(Date.now() - days * DAY),
}));

/** Production's date buckets (SidebarMenu). */
function dateBucket(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const time = date.getTime();
  if (time >= startOfToday) {
    return "Today";
  }
  if (time >= startOfToday - DAY) {
    return "Yesterday";
  }
  if (time >= startOfToday - 7 * DAY) {
    return "Last week";
  }
  if (time >= startOfToday - 30 * DAY) {
    return "Last month";
  }
  if (time >= startOfToday - 365 * DAY) {
    return "Last 12 months";
  }
  return "Older";
}

/** A key cap, as production's NavItemKeyboardShortcut. */
function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-separator px-1 font-sans text-xs text-muted-foreground shadow-xs"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** The top tabs (Work, Spaces, Admin); the nav's top bar. */
export function ProductionNavTabs() {
  return (
    <NavTabPill value="conversations">
      <NavTabPillList>
        <NavTabPillTrigger
          className="notranslate"
          value="conversations"
          icon={IntersectDust}
        >
          Work
        </NavTabPillTrigger>
        <NavTabPillTrigger value="data_sources" icon={Planet}>
          Spaces
        </NavTabPillTrigger>
        <NavTabPillTrigger value="settings" icon={Settings01}>
          Admin
        </NavTabPillTrigger>
      </NavTabPillList>
    </NavTabPill>
  );
}

function ConversationMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <NavigationListItemAction />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem label="Rename conversation" icon={Edit04} />
        <DropdownMenuSeparator />
        <DropdownMenuItem label="Copy link" icon={Link01} />
        <DropdownMenuItem label="Delete" icon={Trash01} variant="warning" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="m-2 rounded-xl p-2 hover:bg-hover data-[state=open]:bg-selected">
        <div className="group flex cursor-pointer items-center justify-between gap-2">
          <span className="sr-only">Open user menu</span>
          <div className="flex items-center gap-2">
            <Avatar size="sm" visual={USER.portrait} clickable isRounded />
            <div className="flex min-w-0 flex-1 flex-col items-start text-left">
              <span className="heading-sm w-full truncate text-foreground">
                {USER.firstName}
              </span>
              <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground">
                {WORKSPACE}
              </span>
            </div>
          </div>
          <Icon
            visual={ChevronDown}
            className="shrink-0 text-muted-foreground group-hover:text-primary-400"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64"
      >
        <DropdownMenuItem label="Help" icon={Heart} />
        <DropdownMenuLabel label="Account" />
        <DropdownMenuItem label="Personal Settings" icon={User01} />
        <DropdownMenuSeparator />
        <DropdownMenuItem label="Sign out" icon={LogOut01} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductionNav({
  conversations,
  activeId,
  onSelect,
  onNewConversation,
  selectedPod,
  onSelectPod,
}: {
  conversations: NavConversation[];
  /** The conversation shown; null while a Pod is. */
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  selectedPod: string | null;
  /** Pods with a page (the others aren't clickable). */
  onSelectPod: (pod: string) => void;
}) {
  // Newest first, then grouped by date as production does.
  const all = [...conversations, ...PAST_CONVERSATIONS].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const buckets: Array<{ label: string; items: NavConversation[] }> = [];
  for (const conversation of all) {
    const label = dateBucket(conversation.createdAt);
    const bucket = buckets[buckets.length - 1];
    if (bucket?.label === label) {
      bucket.items.push(conversation);
    } else {
      buckets.push({ label, items: [conversation] });
    }
  }
  const liveIds = new Set(conversations.map((c) => c.id));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-app-background">
      <NavigationList className="mx-sidebar-side-spacing">
        <NavigationListItem
          label="New conversation"
          icon={MessagePlusCircle}
          suffix={<Keys keys={["C"]} />}
          onClick={onNewConversation}
        />
        <NavigationListItem
          label="Search"
          icon={SearchMd}
          suffix={<Keys keys={["⌘", "K"]} />}
        />
      </NavigationList>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <ScrollBar orientation="vertical" size="minimal" />
          <div className="flex flex-col gap-4 pb-4">
            <NavigationList className="mx-sidebar-side-spacing pt-1">
              <NavigationListItem icon={Robot} label="Agents" />
              <NavigationListItem icon={PuzzlePiece01} label="Skills" />
            </NavigationList>
            <NavigationList className="mx-sidebar-side-spacing">
              <NavigationListCollapsibleSection
                label="Pods"
                type="collapse"
                defaultOpen
                action={
                  <Button
                    size="xs"
                    icon={Plus}
                    label="New"
                    variant="ghost-secondary"
                  />
                }
              >
                {PODS.map((pod) => (
                  <NavigationListItem
                    key={pod}
                    icon={Cube01}
                    label={pod}
                    selected={pod === selectedPod}
                    onClick={
                      pod === PODS[0] ? () => onSelectPod(pod) : undefined
                    }
                  />
                ))}
              </NavigationListCollapsibleSection>
            </NavigationList>
            <NavigationList className="mx-sidebar-side-spacing">
              <NavigationListCollapsibleSection
                label="Conversations"
                type="collapse"
                defaultOpen
                action={
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xmini"
                        icon={DotsHorizontal}
                        variant="ghost"
                        aria-label="Conversations options"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel label="Conversations" />
                      <DropdownMenuItem label="Hide triggered" icon={ZapOff} />
                      <DropdownMenuItem
                        label="Edit history"
                        icon={CheckDone01}
                      />
                      <DropdownMenuItem
                        label="Clear history"
                        variant="warning"
                        icon={Trash01}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                {buckets.map((bucket, i) => (
                  <div
                    key={bucket.label}
                    className="sm:flex sm:flex-col sm:gap-0.5"
                  >
                    <NavigationListCompactLabel
                      label={bucket.label}
                      isSticky
                      className={
                        i === 0 ? "bg-app-background pt-2" : "bg-app-background"
                      }
                    />
                    {bucket.items.map((conversation) => (
                      <NavigationListItem
                        key={conversation.id}
                        label={conversation.title}
                        selected={conversation.id === activeId}
                        labelAnimation={
                          conversation.isRunning ? "streaming" : "none"
                        }
                        moreMenu={<ConversationMenu />}
                        onClick={
                          liveIds.has(conversation.id)
                            ? () => onSelect(conversation.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ))}
              </NavigationListCollapsibleSection>
            </NavigationList>
          </div>
        </ScrollArea>
      </div>
      <UserMenu />
    </div>
  );
}
