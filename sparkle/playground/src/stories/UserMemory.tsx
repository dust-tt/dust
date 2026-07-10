import {
  ArrowUp,
  AssistantCard,
  ContentMessage,
  ContentMessageAction,
  Attachment01,
  Avatar,
  BarChart01,
  Beaker02,
  Bell01,
  BookOpen01,
  CardGrid,
  ChevronDown,
  Icon,
  Chip,
  ChromeLogo,
  cn,
  ContactsRobot,
  Cube01,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  IntersectDust,
  Label,
  LayoutLeft,
  Lightbulb04,
  LogOut01,
  MessagePlusCircle,
  Moon01,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListLabel,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  NewButton,
  NewInput,
  Notification,
  Planet,
  Plus,
  Robot,
  ScrollArea,
  SearchInput,
  Separator,
  Server03,
  Settings01,
  ShapesPlus,
  Spinner,
  Star01,
  Tabs,
  TabsList,
  TabsTrigger,
  Terminal,
  TextArea,
  User01,
  useSendNotification,
  VoicePicker,
  XClose,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import { SliderToggle } from "@sparkle/components/SliderToggle";
import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
} from "../components/PanelLayout";
import {
  createConversationsWithMessages,
  mockAgents,
  mockConversations,
  mockUsers,
  type Conversation,
  type User,
} from "../data";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_MEMORY_CHARS = 2000;

const WORKSPACES = [
  { id: "jd", name: "jd" },
  { id: "usability", name: "usability-test-2025f" },
  { id: "dusteu", name: "Dust (EU)" },
  { id: "pinot", name: "pinotalexandre" },
  { id: "dusttest", name: "dust-test" },
  { id: "dustdemo", name: "dust_demo" },
  { id: "slack", name: "pinotalexSlack" },
  { id: "dust", name: "Dust" },
];

const STARRED = [{ id: "s1", label: "Initiative Admin Governance", count: 2 }];

const PODS = [
  { id: "p1", label: "Design" },
  { id: "p2", label: "Initiative Pods" },
  { id: "p3", label: "Skills In Skills" },
  { id: "p4", label: "TestAlex" },
];

// ─── Settings: SectionContent ─────────────────────────────────────────────────

interface SectionContentProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function SectionContent({
  title,
  description,
  children,
  footer,
}: SectionContentProps) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-8 pt-5 sm:px-6 sm:pt-8">
        <header className="flex flex-col gap-1">
          <h2 className="heading-2xl text-foreground">{title}</h2>
          {description && (
            <p className="copy-sm text-muted-foreground">{description}</p>
          )}
        </header>
        {children}
      </div>
      {footer && (
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Settings: PersonalInfoSection ───────────────────────────────────────────

function PersonalInfoSection({ user }: { user: User }) {
  const sendNotification = useSendNotification();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);

  return (
    <SectionContent
      title="Personal Informations"
      footer={
        <NewButton
          label="Save"
          variant="primary"
          onClick={() =>
            sendNotification({ type: "success", title: "Profile saved" })
          }
        />
      }
    >
      <div className="group relative w-fit">
        <Avatar size="lg" visual={user.portrait ?? undefined} isRounded />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label="First Name"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Last Name"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label>Email</Label>
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </div>
      </div>
    </SectionContent>
  );
}

// ─── Settings: MemoryControls ────────────────────────────────────────────────

interface MemoryControlsProps {
  memoryEnabled: boolean;
  onMemoryEnabledChange: (v: boolean) => void;
  memoryContent: string;
  onMemoryContentChange: (v: string) => void;
  reinforcedEnabled: boolean;
  onReinforcedChange: (v: boolean) => void;
  onSaveRef?: React.MutableRefObject<(() => void) | null>;
  suggestions?: MemorySuggestion[];
  onDismissSuggestion?: (id: string) => void;
}

function MemoryControls({
  memoryEnabled,
  onMemoryEnabledChange,
  memoryContent,
  onMemoryContentChange,
  reinforcedEnabled,
  onReinforcedChange,
  onSaveRef,
  suggestions = [],
  onDismissSuggestion,
}: MemoryControlsProps) {
  const sendNotification = useSendNotification();
  const [savedContent, setSavedContent] = useState(memoryContent);
  const isDirty = memoryContent !== savedContent;

  const handleSave = () => {
    setSavedContent(memoryContent);
    sendNotification({
      type: "success",
      title: "Memory saved",
      description: "Agents will use this in future conversations.",
    });
  };

  if (onSaveRef) {
    onSaveRef.current = isDirty ? handleSave : null;
  }
  const charsLeft = MAX_MEMORY_CHARS - memoryContent.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            Generate memory from chat history
          </span>
          <span className="text-xs text-muted-foreground">
            A personal memory file is injected into your agent conversations so
            they can personalize their responses.
          </span>
        </div>
        <SliderToggle
          selected={memoryEnabled}
          onClick={() => onMemoryEnabledChange(!memoryEnabled)}
        />
      </div>

      <AnimatePresence initial={false}>
        {memoryEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label>Memory</Label>
                <span
                  className={cn(
                    "text-xs",
                    charsLeft < 200
                      ? "text-warning-500"
                      : "text-muted-foreground"
                  )}
                >
                  {charsLeft.toLocaleString()} /{" "}
                  {MAX_MEMORY_CHARS.toLocaleString()} characters
                </span>
              </div>
              <TextArea
                value={memoryContent}
                onChange={(e) => onMemoryContentChange(e.target.value)}
                placeholder={
                  "# About me\nI'm a product designer at Acme Corp...\n\n# Preferences\n- Prefer concise, technical answers\n- Timezone: CET"
                }
                minRows={14}
                resize="vertical"
                maxLength={MAX_MEMORY_CHARS}
              />

              {/* Suggestions from Reinforced Memory */}
              {suggestions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Label>Suggestions</Label>
                    <Chip
                      size="xs"
                      color="primary"
                      label={String(suggestions.length)}
                    />
                  </div>
                  <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                    {suggestions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <Icon
                            visual={Lightbulb04}
                            size="sm"
                            className="mt-0.5 shrink-0 text-highlight-500"
                          />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground">
                              {s.label}
                            </span>
                            {s.description && (
                              <span className="text-xs text-muted-foreground">
                                {s.description}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <NewButton
                            size="xs"
                            variant="primary"
                            label="Add"
                            onClick={() => onDismissSuggestion?.(s.id)}
                          />
                          <NewButton
                            size="xs"
                            variant="ghost-secondary"
                            icon={XClose}
                            onClick={() => onDismissSuggestion?.(s.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Settings: Nav items ──────────────────────────────────────────────────────

type SettingsSection =
  | "personal"
  | "usage"
  | "customization"
  | "notifications"
  | "tools";

const NAV_ITEMS: Array<{
  section: SettingsSection;
  icon: React.ComponentType;
  label: string;
}> = [
  { section: "personal", icon: User01, label: "Personal Information" },
  { section: "usage", icon: BarChart01, label: "Usage" },
  { section: "customization", icon: Settings01, label: "Customization" },
  { section: "notifications", icon: Bell01, label: "Notifications" },
  { section: "tools", icon: ShapesPlus, label: "Tools and Triggers" },
];

// ─── Settings: Dialog ────────────────────────────────────────────────────────

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User;
  memoryEnabled: boolean;
  onMemoryEnabledChange: (v: boolean) => void;
  memoryContent: string;
  onMemoryContentChange: (v: string) => void;
  reinforcedEnabled: boolean;
  onReinforcedChange: (v: boolean) => void;
  initialSection?: SettingsSection;
  suggestions?: MemorySuggestion[];
  onDismissSuggestion?: (id: string) => void;
}

function SettingsDialog({
  open,
  onOpenChange,
  user,
  memoryEnabled,
  onMemoryEnabledChange,
  memoryContent,
  onMemoryContentChange,
  reinforcedEnabled,
  onReinforcedChange,
  initialSection = "personal",
  suggestions = [],
  onDismissSuggestion,
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection);
  const memorySaveRef = useRef<(() => void) | null>(null);

  const handleSave = () => {
    if (memorySaveRef.current) {
      memorySaveRef.current();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" height="xl" className="h-[90vh]">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 sm:flex-row">
            <div className="hidden w-64 flex-shrink-0 flex-col border-r border-border sm:flex">
              <div className="flex-shrink-0 p-2">
                <DialogClose asChild>
                  <NewButton
                    variant="ghost-secondary"
                    size="xs"
                    icon={XClose}
                  />
                </DialogClose>
              </div>
              <NavigationList className="flex-1 px-2 pb-3">
                {NAV_ITEMS.map(({ section, icon, label }) => (
                  <NavigationListItem
                    key={section}
                    icon={icon}
                    label={label}
                    selected={activeSection === section}
                    onClick={() => setActiveSection(section)}
                  />
                ))}
              </NavigationList>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
              {activeSection === "personal" && (
                <PersonalInfoSection user={user} />
              )}
              {activeSection === "usage" && (
                <SectionContent
                  title="Usage"
                  description="Manage the usage of your Dust workspace"
                >
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Spinner />
                  </div>
                </SectionContent>
              )}
              {activeSection === "customization" && (
                <SectionContent
                  title="Customization"
                  description="Personalize your Dust experience."
                >
                  {/* Theme + Keyboard Shortcuts */}
                  <div className="flex w-full gap-8">
                    <div className="flex flex-col gap-2">
                      <Label>Theme</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <NewButton
                            variant="outline"
                            icon={Moon01}
                            label="Light"
                            isSelect
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem label="Light" onClick={() => {}} />
                          <DropdownMenuItem label="Dark" onClick={() => {}} />
                          <DropdownMenuItem label="System" onClick={() => {}} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <Label>Keyboard Shortcuts</Label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-foreground">
                          Send message:
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <NewButton
                              variant="outline"
                              label="Enter (↵)"
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              label="Enter (↵)"
                              onClick={() => {}}
                            />
                            <DropdownMenuItem
                              label="Cmd + Enter"
                              onClick={() => {}}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <MemoryControls
                    memoryEnabled={memoryEnabled}
                    onMemoryEnabledChange={onMemoryEnabledChange}
                    memoryContent={memoryContent}
                    onMemoryContentChange={onMemoryContentChange}
                    reinforcedEnabled={reinforcedEnabled}
                    onReinforcedChange={onReinforcedChange}
                    onSaveRef={memorySaveRef}
                    suggestions={suggestions}
                    onDismissSuggestion={onDismissSuggestion}
                  />
                </SectionContent>
              )}
              {activeSection === "notifications" && (
                <SectionContent
                  title="Notifications"
                  description="Control how and when Dust notifies you"
                >
                  <p className="text-sm text-muted-foreground">
                    Notification preferences.
                  </p>
                </SectionContent>
              )}
              {activeSection === "tools" && (
                <SectionContent title="Tools and Triggers">
                  <p className="text-sm text-muted-foreground">
                    Manage your connected tools.
                  </p>
                </SectionContent>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center justify-end border-t border-border px-6 py-4">
            <NewButton variant="primary" label="Save" onClick={handleSave} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Dropdown ────────────────────────────────────────────────────────────

interface UserDropdownProps {
  user: User;
  onSettingsOpen: () => void;
}

function UserDropdown({ user, onSettingsOpen }: UserDropdownProps) {
  const [workspace, setWorkspace] = useState("dust");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left transition-colors hover:bg-hover">
          <Avatar
            size="sm"
            name={user.fullName}
            visual={user.portrait ?? undefined}
            isRounded
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="s-copy-sm s-font-semibold truncate text-foreground">
              {user.fullName}
            </span>
            <span className="s-copy-xs truncate text-muted-foreground">
              Dust
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={workspace} onValueChange={setWorkspace}>
          {WORKSPACES.map((w) => (
            <DropdownMenuRadioItem key={w.id} value={w.id} label={w.name} />
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={BookOpen01} label="Help" onClick={() => {}} />
        <DropdownMenuItem
          icon={BookOpen01}
          label="Dust Academy"
          onClick={() => {}}
        />
        <DropdownMenuItem
          icon={ChromeLogo}
          label="Chrome extension"
          onClick={() => {}}
        />
        <DropdownMenuItem
          icon={Beaker02}
          label="Exploratory features"
          onClick={() => {}}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem
          icon={User01}
          label="Personal Settings"
          onClick={onSettingsOpen}
        />
        <DropdownMenuItem icon={LogOut01} label="Sign out" onClick={() => {}} />
        <DropdownMenuItem
          icon={Terminal}
          label="Dev Tools"
          onClick={() => {}}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Homepage ─────────────────────────────────────────────────────────────────

interface HomepageProps {
  user: User;
  onStartConversation: (id: string) => void;
}

function Homepage({ user, onStartConversation }: HomepageProps) {
  const [input, setInput] = useState("");
  const firstName = user.firstName ?? user.fullName.split(" ")[0];
  const displayedAgents = mockAgents.slice(0, 6);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
        {/* Greeting */}
        <h1 className="heading-2xl text-foreground">Bonjour, {firstName}! ✏️</h1>

        {/* Input bar — matches production InputBarContainer layout */}
        <div className="flex flex-col gap-0 rounded-2xl border border-border bg-muted-background">
          <textarea
            className="min-h-[80px] w-full resize-none border-0 bg-transparent px-4 pt-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Get work done"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1">
              <Chip label="dust" size="xs" icon={Robot} onClick={() => {}} />
              <NewButton
                variant="ghost-secondary"
                size="xs"
                icon={ShapesPlus}
                tooltip="Tools"
                onClick={() => {}}
              />
              <NewButton
                variant="ghost-secondary"
                size="xs"
                icon={Attachment01}
                tooltip="Attach"
                onClick={() => {}}
              />
            </div>
            <div className="flex items-center gap-1">
              <VoicePicker
                status="idle"
                level={0}
                elapsedSeconds={0}
                onRecordStart={() => {}}
                onRecordStop={() => {}}
                size="xs"
              />
              <NewButton
                variant="primary"
                size="xs"
                icon={ArrowUp}
                disabled={!input.trim()}
                onClick={() =>
                  onStartConversation(mockConversations[0]?.id ?? "")
                }
              />
            </div>
          </div>
        </div>

        {/* Chat with... */}
        <div className="flex flex-col gap-2">
          <h2 className="heading-lg text-foreground">Chat with...</h2>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchInput
                name="agent-search"
                placeholder="Search"
                value=""
                onChange={() => {}}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <NewButton
                  variant="primary"
                  size="sm"
                  label="Create"
                  icon={Plus}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Agent from scratch"
                  onClick={() => {}}
                />
                <DropdownMenuItem
                  label="Agent from template"
                  onClick={() => {}}
                />
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <NewButton
                  variant="primary"
                  size="sm"
                  label="Manage"
                  icon={ContactsRobot}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem label="Agents" onClick={() => {}} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Tabs — matches production Tabs/TabsList/TabsTrigger */}
          <Tabs defaultValue="favorites">
            <TabsList>
              <TabsTrigger value="favorites" label="Favorites" />
              <TabsTrigger value="all" label="All agents" />
              <TabsTrigger value="editable" label="Editable by me" />
              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <NewButton
                      variant="outline"
                      size="sm"
                      label="By popularity"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      label="By popularity"
                      onClick={() => {}}
                    />
                    <DropdownMenuItem label="Alphabetical" onClick={() => {}} />
                    <DropdownMenuItem
                      label="Recently updated"
                      onClick={() => {}}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TabsList>
          </Tabs>

          {/* Agent cards — production uses CardGrid from Sparkle */}
          <CardGrid>
            {displayedAgents.map((agent) => (
              <AssistantCard
                key={agent.sId}
                title={agent.name}
                description={agent.description ?? ""}
                pictureUrl={agent.pictureUrl ?? ""}
                subtitle={agent.scope === "global" ? "Dust" : "Me"}
                onClick={() =>
                  onStartConversation(mockConversations[0]?.id ?? "")
                }
              />
            ))}
          </CardGrid>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar memory suggestion card ──────────────────────────────────────────

interface MemorySuggestion {
  id: string;
  label: string;
  description?: string;
}

const GRID_STYLE = { display: "grid" } as const;
const GRID_ANIMATE = { gridTemplateRows: "1fr", opacity: 1 };
const GRID_EXIT = { gridTemplateRows: "0fr", opacity: 0 };

interface MemorySuggestionsSectionProps {
  suggestions: MemorySuggestion[];
  onOpenSettings: () => void;
}

function MemorySuggestionsSection({
  suggestions,
  onOpenSettings,
}: MemorySuggestionsSectionProps) {
  if (suggestions.length === 0) return null;

  return (
    <NavigationListCollapsibleSection
      label="Memory suggestions"
      count={suggestions.length}
      className="bg-background rounded-xl border border-border p-1 mx-sidebar-side-spacing"
      actionOnHover={false}
    >
      <AnimatePresence initial={false}>
        {suggestions.map((s) => (
          <motion.div
            key={s.id}
            style={GRID_STYLE}
            animate={GRID_ANIMATE}
            exit={GRID_EXIT}
            transition={{ ease: "easeOut", duration: 0.1 }}
          >
            <div className="overflow-hidden">
              <NavigationListItem
                label={s.label}
                icon={Lightbulb04}
                onClick={onOpenSettings}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </NavigationListCollapsibleSection>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onSettingsOpen: () => void;
  onHomeClick: () => void;
  reinforcedEnabled: boolean;
  memorySuggestions: MemorySuggestion[];
  titleFilter: string;
  onTitleFilterChange: (v: string) => void;
}

function Sidebar({
  user,
  conversations,
  activeConversationId,
  onSelectConversation,
  onSettingsOpen,
  onHomeClick,
  reinforcedEnabled,
  memorySuggestions,
  titleFilter,
  onTitleFilterChange,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Search + New */}
      <div className="flex items-center gap-2 px-sidebar-side-spacing py-2">
        <div className="flex-1">
          <SearchInput
            name="search"
            placeholder="Search"
            value={titleFilter}
            onChange={onTitleFilterChange}
          />
        </div>
        <NewButton
          label="New"
          icon={MessagePlusCircle}
          className="shrink-0"
          onClick={onHomeClick}
        />
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 py-2">
          {/* Memory suggestions */}
          <AnimatePresence initial={false}>
            {reinforcedEnabled && memorySuggestions.length > 0 && (
              <motion.div
                key="memory-suggestions"
                style={GRID_STYLE}
                animate={GRID_ANIMATE}
                exit={GRID_EXIT}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="overflow-hidden pb-2">
                  <MemorySuggestionsSection
                    suggestions={memorySuggestions}
                    onOpenSettings={onSettingsOpen}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Starred */}
          <NavigationList className="mx-sidebar-side-spacing">
            <NavigationListCollapsibleSection label="Starred" icon={Star01}>
              {STARRED.map((item) => (
                <NavigationListItem
                  key={item.id}
                  label={item.label}
                  icon={Cube01}
                  count={item.count}
                  onClick={() => {}}
                />
              ))}
            </NavigationListCollapsibleSection>
          </NavigationList>

          {/* Pods */}
          <NavigationList className="mx-sidebar-side-spacing">
            <NavigationListCollapsibleSection label="Pods" visibleItems={4}>
              {PODS.map((pod) => (
                <NavigationListItem
                  key={pod.id}
                  label={pod.label}
                  icon={Server03}
                  onClick={() => {}}
                />
              ))}
            </NavigationListCollapsibleSection>
          </NavigationList>

          {/* Conversations — grouped by date like production */}
          <NavigationList className="mx-sidebar-side-spacing">
            {(() => {
              const filtered = conversations.filter(
                (c) =>
                  !titleFilter ||
                  c.title.toLowerCase().includes(titleFilter.toLowerCase())
              );
              const today = filtered.slice(0, 5);
              const yesterday = filtered.slice(5, 10);
              const older = filtered.slice(10);
              return (
                <>
                  {today.map((c) => (
                    <NavigationListItem
                      key={c.id}
                      selected={activeConversationId === c.id}
                      label={c.title}
                      onClick={() => onSelectConversation(c.id)}
                    />
                  ))}
                  {yesterday.length > 0 && (
                    <>
                      <NavigationListLabel label="Yesterday" isSticky />
                      {yesterday.map((c) => (
                        <NavigationListItem
                          key={c.id}
                          selected={activeConversationId === c.id}
                          label={c.title}
                          onClick={() => onSelectConversation(c.id)}
                        />
                      ))}
                    </>
                  )}
                  {older.length > 0 && (
                    <>
                      <NavigationListLabel label="Last Week" isSticky />
                      {older.map((c) => (
                        <NavigationListItem
                          key={c.id}
                          selected={activeConversationId === c.id}
                          label={c.title}
                          onClick={() => onSelectConversation(c.id)}
                        />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </NavigationList>
        </div>
      </ScrollArea>

      {/* Bottom user dropdown */}
      <UserDropdown user={user} onSettingsOpen={onSettingsOpen} />
    </div>
  );
}

// ─── Memory suggestion in conversation ───────────────────────────────────────

type SuggestionState = "active" | "accepted" | "rejected";

interface ConversationMemorySuggestionProps {
  state: SuggestionState;
  onAccept: () => void;
  onReject: () => void;
}

function ConversationMemorySuggestion({
  state,
  onAccept,
  onReject,
}: ConversationMemorySuggestionProps) {
  if (state === "rejected") {
    return null;
  }
  if (state === "accepted") {
    return null;
  }
  return (
    <div className="px-4 pb-3">
      <ContentMessage
        variant="primary"
        icon={Lightbulb04}
        title="Add to memory?"
        size="lg"
        action={
          <div className="flex items-center gap-1">
            <ContentMessageAction
              variant="highlight"
              label="Add"
              onClick={onAccept}
            />
            <ContentMessageAction
              variant="ghost"
              label="Dismiss"
              onClick={onReject}
            />
          </div>
        }
      >
        Avoid em dashes (—) in all responses. The user explicitly asked to never
        use them.
      </ContentMessage>
    </div>
  );
}

// ─── Main conversation panel ──────────────────────────────────────────────────

interface MainPanelProps {
  conversation: Conversation | null;
  locutor: User;
  conversationsWithMessages: Conversation[];
  reinforcedEnabled: boolean;
  suggestionState: SuggestionState;
  onSuggestionAccept: () => void;
  onSuggestionReject: () => void;
  onBack: () => void;
}

function ConversationInputBar() {
  const [input, setInput] = useState("");
  return (
    <div className="flex flex-col gap-0 rounded-2xl border border-border bg-muted-background">
      <textarea
        className="min-h-[80px] w-full resize-none border-0 bg-transparent px-4 pt-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
        placeholder="Reply..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-1">
          <Chip label="dust" size="xs" icon={Robot} onClick={() => {}} />
          <NewButton
            variant="ghost-secondary"
            size="xs"
            icon={ShapesPlus}
            tooltip="Tools"
            onClick={() => {}}
          />
          <NewButton
            variant="ghost-secondary"
            size="xs"
            icon={Attachment01}
            tooltip="Attach"
            onClick={() => {}}
          />
        </div>
        <div className="flex items-center gap-1">
          <VoicePicker
            status="idle"
            level={0}
            elapsedSeconds={0}
            onRecordStart={() => {}}
            onRecordStop={() => {}}
            size="xs"
          />
          <NewButton
            variant="primary"
            size="xs"
            icon={ArrowUp}
            disabled={!input.trim()}
            onClick={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

function MainPanel({
  conversation,
  locutor,
  conversationsWithMessages,
  reinforcedEnabled,
  suggestionState,
  onSuggestionAccept,
  onSuggestionReject,
}: MainPanelProps) {
  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a conversation
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <ConversationView
          conversation={conversation}
          locutor={locutor}
          users={mockUsers}
          agents={mockAgents}
          conversationsWithMessages={conversationsWithMessages}
          hideInputBar
        />
      </div>
      <div className="mx-auto w-full max-w-3xl px-4">
        {reinforcedEnabled && (
          <ConversationMemorySuggestion
            state={suggestionState}
            onAccept={onSuggestionAccept}
            onReject={onSuggestionReject}
          />
        )}
        <div className="pb-4 pt-2">
          <ConversationInputBar />
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const INITIAL_MEMORY = `# About me
I'm a product designer at Acme Corp focused on B2B SaaS. I work closely with engineering and prefer concise, actionable answers.

# Communication preferences
- Prefer bullet points over long paragraphs
- Give me examples when possible
- My timezone is CET

# Context
- I often ask about design systems, user research, and Figma
- Team size: ~20 people`;

const INITIAL_SUGGESTIONS: MemorySuggestion[] = [
  {
    id: "s1",
    label: "Your role at Acme Corp",
    description:
      'Add "Product Designer at Acme Corp, working on B2B SaaS products" to your memory so agents can tailor advice to your role and context.',
  },
  {
    id: "s2",
    label: "Preferred response format",
    description:
      'Add "Prefer concise bullet points over long paragraphs, with concrete examples" to your memory so agents match your communication style by default.',
  },
];

function UserMemoryInner() {
  const sendNotification = useSendNotification();
  const user = useMemo(
    () => mockUsers[Math.floor(Math.random() * mockUsers.length)],
    []
  );

  const conversations = useMemo(() => mockConversations.slice(0, 8), []);

  const [conversationsWithMessages] = useState<Conversation[]>(() =>
    createConversationsWithMessages(user.id)
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  // null = homepage, string = conversation id
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryContent, setMemoryContent] = useState(INITIAL_MEMORY);
  const [reinforcedEnabled, setReinforcedEnabled] = useState(true);

  const [memorySuggestions, setMemorySuggestions] =
    useState<MemorySuggestion[]>(INITIAL_SUGGESTIONS);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(
    null
  );
  const [suggestionState, setSuggestionState] =
    useState<SuggestionState>("active");
  const [titleFilter, setTitleFilter] = useState("");

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const handleDismissSuggestion = useCallback(
    (id: string) => {
      setMemorySuggestions((prev) => prev.filter((s) => s.id !== id));
      if (activeSuggestionId === id) setActiveSuggestionId(null);
    },
    [activeSuggestionId]
  );

  const handleReinforcedChange = useCallback((v: boolean) => {
    setReinforcedEnabled(v);
    if (!v) {
      setSuggestionState("active");
      setMemorySuggestions(INITIAL_SUGGESTIONS);
    }
  }, []);

  // P2 content: homepage when no conversation selected, conversation otherwise
  const p2Content =
    activeConversationId === null ? (
      <Homepage
        user={user}
        onStartConversation={(id) => setActiveConversationId(id)}
      />
    ) : (
      <MainPanel
        conversation={activeConversation}
        locutor={user}
        conversationsWithMessages={conversationsWithMessages}
        reinforcedEnabled={reinforcedEnabled && memoryEnabled}
        suggestionState={suggestionState}
        onSuggestionAccept={() => {
          setSuggestionState("accepted");
          sendNotification({
            type: "success",
            title: "Added to memory",
            description: '"Avoid em dashes" has been added to your memory.',
          });
        }}
        onSuggestionReject={() => setSuggestionState("rejected")}
        onBack={() => setActiveConversationId(null)}
      />
    );

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        memoryEnabled={memoryEnabled}
        onMemoryEnabledChange={setMemoryEnabled}
        memoryContent={memoryContent}
        onMemoryContentChange={setMemoryContent}
        reinforcedEnabled={reinforcedEnabled}
        onReinforcedChange={handleReinforcedChange}
        initialSection="customization"
        suggestions={memorySuggestions}
        onDismissSuggestion={handleDismissSuggestion}
      />

      <PanelLayout>
        <PanelLayoutNav
          topBarLeft={
            <NavTabPill value="work" className="w-full">
              <NavTabPillList>
                <NavTabPillTrigger value="work" icon={IntersectDust}>
                  Work
                </NavTabPillTrigger>
                <NavTabPillTrigger value="spaces" icon={Planet}>
                  Spaces
                </NavTabPillTrigger>
              </NavTabPillList>
            </NavTabPill>
          }
        >
          {(closeNav) => (
            <Sidebar
              user={user}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => {
                setActiveConversationId(id);
                closeNav();
              }}
              onSettingsOpen={() => setSettingsOpen(true)}
              onHomeClick={() => {
                setActiveConversationId(null);
                closeNav();
              }}
              reinforcedEnabled={reinforcedEnabled && memoryEnabled}
              memorySuggestions={memorySuggestions}
              titleFilter={titleFilter}
              onTitleFilterChange={setTitleFilter}
            />
          )}
        </PanelLayoutNav>

        <PanelLayoutPanel
          label={activeConversation?.title ?? "Home"}
          isOpen={activeConversationId !== null}
          onClose={() => setActiveConversationId(null)}
        >
          {p2Content}
        </PanelLayoutPanel>
      </PanelLayout>
    </>
  );
}

export default function UserMemory() {
  return (
    <Notification.Area>
      <UserMemoryInner />
    </Notification.Area>
  );
}
