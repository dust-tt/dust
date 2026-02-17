import {
  Avatar,
  BellIcon,
  BoltIcon,
  Button,
  Chip,
  ClockIcon,
  Collapsible,
  CollapsibleContent,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Label,
  LightModeIcon,
  MoonIcon,
  Notification,
  Page,
  PencilSquareIcon,
  SearchInput,
  Separator,
  SunIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { mockUsers, type User } from "../data";

// Fake data types and constants
type Theme = "light" | "dark" | "system";
type SubmitMessageKey = "enter" | "cmd+enter";

// Notification preferences (unplugged – same structure as front, local state only)
type NotificationCondition = "all_messages" | "only_mentions" | "never";
type NotificationPreferencesDelay =
  | "5_minutes"
  | "15_minutes"
  | "30_minutes"
  | "1_hour"
  | "daily";

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "for all new messages",
  only_mentions: "only when I'm mentioned",
  never: "never",
};

const NOTIFICATION_DELAY_OPTIONS: NotificationPreferencesDelay[] = [
  "5_minutes",
  "15_minutes",
  "30_minutes",
  "1_hour",
  "daily",
];

const NOTIFICATION_DELAY_LABELS: Record<NotificationPreferencesDelay, string> =
  {
    "5_minutes": "every 5 minutes",
    "15_minutes": "every 15 minutes",
    "30_minutes": "every 30 minutes",
    "1_hour": "every hour",
    daily: "once a day",
  };

interface ToolRow {
  id: string;
  name: string;
  description: string;
  connected: boolean;
}

interface TriggerRow {
  id: string;
  agentName: string;
  agentPictureUrl: string | null;
  agentStatus: string;
  name: string;
  kind: "schedule" | "mention";
  scheduleLabel?: string;
}

const FAKE_TOOLS: ToolRow[] = [
  {
    id: "tool-1",
    name: "Slack",
    description: "Search and post to Slack channels",
    connected: true,
  },
  {
    id: "tool-2",
    name: "Google Drive",
    description: "Read and search Drive files",
    connected: true,
  },
  {
    id: "tool-3",
    name: "Notion",
    description: "Query Notion workspaces",
    connected: false,
  },
];

const FAKE_TRIGGERS: TriggerRow[] = [
  {
    id: "trig-1",
    agentName: "Analyst",
    agentPictureUrl: null,
    agentStatus: "enabled",
    name: "Daily digest",
    kind: "schedule",
    scheduleLabel: "Every day at 9:00",
  },
  {
    id: "trig-2",
    agentName: "Support Bot",
    agentPictureUrl: null,
    agentStatus: "enabled",
    name: "Mention alert",
    kind: "mention",
  },
];

const randomUser = () =>
  mockUsers[Math.floor(Math.random() * mockUsers.length)];

interface ProfileContentProps {
  initialUser?: User;
}

function ProfileContent({ initialUser }: ProfileContentProps) {
  const randomUserValue = useMemo(randomUser, []);
  const user = initialUser ?? randomUserValue;
  const sendNotification = useSendNotification();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [savedFirstName, setSavedFirstName] = useState(user.firstName);
  const [savedLastName, setSavedLastName] = useState(user.lastName);
  const isNameDirty =
    firstName !== savedFirstName || lastName !== savedLastName;
  const [theme, setTheme] = useState<Theme>("system");
  const [submitMessageKey, setSubmitMessageKey] =
    useState<SubmitMessageKey>("enter");
  const [toolsSearch, setToolsSearch] = useState("");
  const [triggersSearch, setTriggersSearch] = useState("");

  // Notification preferences (unplugged – local state only)
  const [notifyCondition, setNotifyCondition] =
    useState<NotificationCondition>("all_messages");
  const [conversationInApp, setConversationInApp] = useState(true);
  const [conversationEmail, setConversationEmail] = useState(true);
  const [conversationSlack, setConversationSlack] = useState(false);
  const [conversationEmailDelay, setConversationEmailDelay] =
    useState<NotificationPreferencesDelay>("1_hour");

  // New conversation notification preferences (same structure as New messages)
  const [notifyConditionNewConv, setNotifyConditionNewConv] =
    useState<NotificationCondition>("all_messages");
  const [newConvInApp, setNewConvInApp] = useState(true);
  const [newConvEmail, setNewConvEmail] = useState(false);
  const [newConvSlack, setNewConvSlack] = useState(false);
  const [newConvEmailDelay, setNewConvEmailDelay] =
    useState<NotificationPreferencesDelay>("1_hour");

  const [projectInApp, setProjectInApp] = useState(true);
  const [projectEmail, setProjectEmail] = useState(false);
  const [projectNewConvInApp, setProjectNewConvInApp] = useState(true);
  const [projectNewConvEmail, setProjectNewConvEmail] = useState(false);
  const [projectNewConvEmailDelay, setProjectNewConvEmailDelay] =
    useState<NotificationPreferencesDelay>("1_hour");

  const filteredTools = useMemo(() => {
    const q = toolsSearch.toLowerCase();
    if (!q) return FAKE_TOOLS;
    return FAKE_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [toolsSearch]);

  const filteredTriggers = useMemo(() => {
    const q = triggersSearch.toLowerCase();
    if (!q) return FAKE_TRIGGERS;
    return FAKE_TRIGGERS.filter(
      (t) =>
        t.agentName.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    );
  }, [triggersSearch]);

  const toolsColumns = useMemo<ColumnDef<ToolRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        sortingFn: (rowA, rowB) =>
          rowA.original.name.localeCompare(rowB.original.name),
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div className="s-flex s-flex-row s-items-center s-gap-3 s-py-3">
              <div className="s-flex s-min-w-0 s-flex-grow s-flex-col s-gap-0 s-overflow-hidden">
                <div className="s-truncate s-text-sm s-font-semibold s-text-foreground">
                  {row.original.name}
                </div>
                <div className="s-truncate s-text-sm s-text-muted-foreground">
                  {row.original.description}
                </div>
              </div>
              {row.original.connected && (
                <Chip color="success" size="xs">
                  Connected
                </Chip>
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: { className: "s-w-full" },
      },
      {
        header: "",
        accessorKey: "actions",
        cell: ({ row }) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                label: "Clear confirmation preferences",
                onClick: () => {},
              },
            ]}
          />
        ),
        meta: { className: "s-w-12" },
      },
    ],
    []
  );

  const triggersColumns = useMemo<ColumnDef<TriggerRow>[]>(
    () => [
      {
        accessorKey: "agentName",
        header: "Agent",
        sortingFn: (rowA, rowB) =>
          rowA.original.agentName.localeCompare(rowB.original.agentName),
        cell: ({ row }) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-2">
              <Avatar size="xs" visual={row.original.agentPictureUrl} />
              <div className="s-truncate s-text-sm s-font-semibold s-text-foreground">
                {row.original.agentName}
              </div>
              {row.original.agentStatus !== "enabled" && (
                <Chip size="xs" color="primary">
                  {row.original.agentStatus.charAt(0).toUpperCase() +
                    row.original.agentStatus.slice(1)}
                </Chip>
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: { className: "s-w-48" },
      },
      {
        accessorKey: "name",
        header: "Triggers",
        sortingFn: (rowA, rowB) =>
          rowA.original.name.localeCompare(rowB.original.name),
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div className="s-flex s-flex-row s-items-center s-gap-1 s-py-3 s-text-muted-foreground">
              <Avatar
                size="xs"
                visual={
                  row.original.kind === "schedule" ? (
                    <ClockIcon />
                  ) : (
                    <BellIcon />
                  )
                }
              />
              <div className="s-flex s-min-w-0 s-flex-col s-gap-0">
                <div className="s-text-sm s-font-semibold">
                  {row.original.name}
                </div>
                {row.original.scheduleLabel && (
                  <div className="s-truncate s-text-sm">
                    {row.original.scheduleLabel}
                  </div>
                )}
              </div>
            </div>
          </DataTable.CellContent>
        ),
        meta: { className: "s-w-full" },
      },
      {
        header: "Action",
        accessorKey: "actions",
        cell: ({ row }) => (
          <DataTable.CellContent>
            <div className="s-flex s-gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={PencilSquareIcon}
                label="Manage"
              />
              <Button
                variant="outline"
                size="sm"
                icon={TrashIcon}
                label="Delete"
              />
            </div>
          </DataTable.CellContent>
        ),
        meta: { className: "s-w-32" },
      },
    ],
    []
  );

  const themeIcon =
    theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : LightModeIcon;
  const themeLabel =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <Page>
      <Page.Header title="Profile" />
      <Page.Layout direction="vertical">
        <Page.SectionHeader title="Account Settings" />

        <Avatar
          size="lg"
          name={user.fullName}
          visual={user.portrait ?? undefined}
          isRounded
        />
        <div className="s-space-y-1">
          <div className="s-flex s-gap-4">
            <div className="s-flex-1">
              <Input
                name="firstName"
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
              />
            </div>
            <div className="s-flex-1">
              <Input
                name="lastName"
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
              />
            </div>
          </div>

          <Collapsible open={isNameDirty}>
            <CollapsibleContent>
              <div className="s-flex s-gap-2 s-py-2">
                <Button
                  variant="outline"
                  label="Cancel"
                  type="button"
                  onClick={() => {
                    setFirstName(savedFirstName);
                    setLastName(savedLastName);
                  }}
                />
                <Button
                  variant="highlight"
                  label="Save"
                  type="button"
                  onClick={() => {
                    sendNotification({
                      type: "success",
                      title: "Saved",
                      description: "Your name has been updated.",
                    });
                    setSavedFirstName(firstName);
                    setSavedLastName(lastName);
                  }}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="s-flex s-gap-2">
          <Label>Email</Label>
          <span className="s-text-muted-foreground">{user.email}</span>
        </div>

        <div className="s-flex s-w-full s-flex-row s-justify-between s-gap-4">
          <div className="s-flex-1">
            <div>
              <Label>Theme</Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  icon={themeIcon}
                  label={themeLabel}
                  isSelect
                  className="s-w-fit"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  icon={SunIcon}
                  onClick={() => setTheme("light")}
                  label="Light"
                />
                <DropdownMenuItem
                  icon={MoonIcon}
                  onClick={() => setTheme("dark")}
                  label="Dark"
                />
                <DropdownMenuItem
                  icon={LightModeIcon}
                  onClick={() => setTheme("system")}
                  label="System"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="s-flex-1">
            <Label>Keyboard Shortcuts</Label>
            <div className="s-copy-sm s-flex s-items-center s-gap-2 s-text-foreground">
              Send message:
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    variant="outline"
                    label={
                      submitMessageKey === "enter"
                        ? "Enter (↵)"
                        : "Cmd + Enter (⌘ + ↵)"
                    }
                    isSelect
                    className="s-w-fit"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => setSubmitMessageKey("enter")}
                  >
                    Enter
                    <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSubmitMessageKey("cmd+enter")}
                  >
                    Cmd + Enter
                    <DropdownMenuShortcut>⌘ + ↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <Separator />
        <Page.SectionHeader title="Notifications" />

        <div className="s-flex s-flex-col">
          <Label className="s-text-foreground">New messages</Label>
          <div className="s-flex s-flex-wrap s-items-center s-gap-1.5 s-pt-2">
            <span className="s-text-sm s-text-foreground">For</span>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  label={NOTIFICATION_CONDITION_LABELS[notifyCondition]}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.all_messages}
                  onClick={() => setNotifyCondition("all_messages")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.only_mentions}
                  onClick={() => setNotifyCondition("only_mentions")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.never}
                  onClick={() => setNotifyCondition("never")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
            notify me by
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  disabled={notifyCondition === "never"}
                  label={
                    notifyCondition === "never"
                      ? "—"
                      : [
                          conversationInApp && "In-app popup",
                          conversationEmail && "Email",
                          conversationSlack && "Slack",
                        ]
                          .filter(Boolean)
                          .join(", ") || "None"
                  }
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuCheckboxItem
                  checked={conversationInApp}
                  onCheckedChange={(checked) =>
                    setConversationInApp(checked === true)
                  }
                  label="In-app popup"
                />
                <DropdownMenuCheckboxItem
                  checked={conversationEmail}
                  onCheckedChange={(checked) =>
                    setConversationEmail(checked === true)
                  }
                  label="Email"
                />
                <DropdownMenuCheckboxItem
                  checked={conversationSlack}
                  onCheckedChange={(checked) =>
                    setConversationSlack(checked === true)
                  }
                  label="Slack"
                />
              </DropdownMenuContent>
            </DropdownMenu>
            {conversationEmail && notifyCondition !== "never" && (
              <>
                at most
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      isSelect
                      label={NOTIFICATION_DELAY_LABELS[conversationEmailDelay]}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                      <DropdownMenuItem
                        key={delay}
                        label={NOTIFICATION_DELAY_LABELS[delay]}
                        onClick={() => setConversationEmailDelay(delay)}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <div className="s-flex s-flex-col">
          <Label className="s-text-foreground">
            New conversations{" "}
            <span className="s-font-normal s-text-muted-foreground">
              (In projects)
            </span>
          </Label>
          <div className="s-flex s-flex-wrap s-items-center s-gap-1.5 s-pt-2">
            <span className="s-text-sm s-text-foreground">For</span>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  label={NOTIFICATION_CONDITION_LABELS[notifyConditionNewConv]}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.all_messages}
                  onClick={() => setNotifyConditionNewConv("all_messages")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.only_mentions}
                  onClick={() => setNotifyConditionNewConv("only_mentions")}
                />
                <DropdownMenuItem
                  label={NOTIFICATION_CONDITION_LABELS.never}
                  onClick={() => setNotifyConditionNewConv("never")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
            notify me by
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  disabled={notifyConditionNewConv === "never"}
                  label={
                    notifyConditionNewConv === "never"
                      ? "—"
                      : [
                          newConvInApp && "In-app popup",
                          newConvEmail && "Email",
                          newConvSlack && "Slack",
                        ]
                          .filter(Boolean)
                          .join(", ") || "None"
                  }
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuCheckboxItem
                  checked={newConvInApp}
                  onCheckedChange={(checked) =>
                    setNewConvInApp(checked === true)
                  }
                  label="In-app popup"
                />
                <DropdownMenuCheckboxItem
                  checked={newConvEmail}
                  onCheckedChange={(checked) =>
                    setNewConvEmail(checked === true)
                  }
                  label="Email"
                />
                <DropdownMenuCheckboxItem
                  checked={newConvSlack}
                  onCheckedChange={(checked) =>
                    setNewConvSlack(checked === true)
                  }
                  label="Slack"
                />
              </DropdownMenuContent>
            </DropdownMenu>
            {newConvEmail && notifyConditionNewConv !== "never" && (
              <>
                at most
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      isSelect
                      label={NOTIFICATION_DELAY_LABELS[newConvEmailDelay]}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                      <DropdownMenuItem
                        key={delay}
                        label={NOTIFICATION_DELAY_LABELS[delay]}
                        onClick={() => setNewConvEmailDelay(delay)}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <Separator />
        <Page.SectionHeader title="Tools & Triggers" />
        <Tabs defaultValue="tools" className="s-w-full">
          <TabsList>
            <TabsTrigger value="tools" label="Tools" icon={BoltIcon} />
            <TabsTrigger value="triggers" label="Triggers" icon={BellIcon} />
          </TabsList>
          <TabsContent value="tools" className="s-mt-4">
            <div className="s-relative s-my-4">
              <SearchInput
                name="tools-search"
                placeholder="Search tools"
                value={toolsSearch}
                onChange={setToolsSearch}
              />
            </div>
            {filteredTools.length > 0 ? (
              <DataTable
                data={filteredTools}
                columns={toolsColumns}
                sorting={[{ id: "name", desc: false }]}
              />
            ) : (
              <Label>
                {toolsSearch
                  ? "No matching tools found"
                  : "You don't have any tool-specific settings yet."}
              </Label>
            )}
          </TabsContent>
          <TabsContent value="triggers" className="s-mt-4">
            <div className="s-relative s-my-4">
              <SearchInput
                name="triggers-search"
                placeholder="Search triggers and agents"
                value={triggersSearch}
                onChange={setTriggersSearch}
              />
            </div>
            {filteredTriggers.length > 0 ? (
              <DataTable
                data={filteredTriggers}
                columns={triggersColumns}
                sorting={[{ id: "agentName", desc: false }]}
              />
            ) : FAKE_TRIGGERS.length === 0 ? (
              <div className="s-py-8 s-text-center s-text-muted-foreground">
                You haven't created any triggers yet.
              </div>
            ) : (
              <div className="s-py-8 s-text-center s-text-muted-foreground">
                No triggers match your search criteria.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Page.Layout>
    </Page>
  );
}

/** Embedded profile panel for use in sidebar layouts: Notification.Area + ProfileContent with the given user. */
export function ProfilePanel({ user }: { user: User }) {
  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
      <div className="s-min-h-0 s-flex-1 s-overflow-y-auto">
        <Notification.Area>
          <ProfileContent initialUser={user} />
        </Notification.Area>
      </div>
    </div>
  );
}
