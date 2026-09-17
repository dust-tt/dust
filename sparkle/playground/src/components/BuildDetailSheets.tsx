import {
  ActionIcons,
  Avatar,
  Button,
  Check,
  Checkbox,
  Chip,
  ClipboardCheck,
  CloudArrowLeftRight,
  cn,
  ContentMessage,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Edit04,
  Heart,
  IconPicker,
  InfoCircle,
  Input,
  Label,
  ListGroup,
  ListItem,
  LogIn01,
  MessageCircle01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Robot,
  SearchInput,
  Separator,
  Server03,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  AGENT_SCOPE_INFO,
  formatBuildDateLong,
  getManagedAgentById,
  getManagedSkillById,
  getModelById,
  getToolById,
  type ManagedAgent,
  type ManagedSkill,
  type MockTool,
  SKILL_AVAILABILITY_DISPLAY,
  TOOL_ACCOUNT_INFO,
  TOOL_STAKE_LEVELS,
  TOOL_STAKES,
  type ToolOperation,
} from "../data/build";
import { getCompanySpaceById, mockCompanySpaces } from "../data/companySpaces";
import { getUserById } from "../data/users";
import { BulkSelectionBar } from "./BulkSelectionBar";

// The sheets behind the three Build tables. Each one opens on a row and reads
// the item back: nothing here saves, so every button is an affordance and the
// footers only close.

// ── Shared building blocks ───────────────────────────────────────────────────

/** A skill's avatar: its icon on the highlight tint skills carry everywhere. */
function SkillAvatar({
  icon,
  size = "sm",
}: {
  icon: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  return (
    <Avatar
      size={size}
      icon={icon}
      backgroundColor="bg-highlight-50"
      iconColor="text-highlight-700"
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="heading-base text-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** The one-line rows a sheet uses for an item it references but cannot open. */
function EntityRow({
  visual,
  name,
  description,
}: {
  visual: ReactNode;
  name: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {visual}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-foreground">{name}</span>
        {description && (
          <span className="truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptySectionNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Instructions and guidelines, read-only: the builder is where they change. */
function ProseBlock({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted-background p-4">
      {text.split("\n\n").map((paragraph, index) => (
        <p key={index} className="text-sm text-foreground">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function EditorsList({ userIds }: { userIds: string[] }) {
  const editors = userIds.flatMap((id) => {
    const user = getUserById(id);
    return user ? [user] : [];
  });

  if (editors.length === 0) {
    return (
      <EmptySectionNote>
        Dust maintains this one, so it has no editors.
      </EmptySectionNote>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {editors.map((editor) => (
        <EntityRow
          key={editor.id}
          visual={
            <Avatar
              size="sm"
              name={editor.fullName}
              visual={editor.portrait}
              isRounded
            />
          }
          name={editor.fullName}
          description={editor.email}
        />
      ))}
    </div>
  );
}

function SpacesList({ spaceIds }: { spaceIds: string[] }) {
  if (spaceIds.length === 0) {
    return (
      <EmptySectionNote>
        No Space attached — it answers from the conversation alone.
      </EmptySectionNote>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {spaceIds.flatMap((spaceId) => {
        const space = getCompanySpaceById(spaceId);
        return space
          ? [
              <EntityRow
                key={space.id}
                visual={<Avatar size="sm" icon={Server03} />}
                name={space.name}
                description={space.description}
              />,
            ]
          : [];
      })}
    </div>
  );
}

/** The header every one of these sheets opens with, centred over the tabs. */
function DetailHeader({
  avatar,
  chip,
  name,
  updatedAt,
  editorIds,
  actions,
}: {
  avatar: ReactNode;
  chip?: ReactNode;
  name: string;
  updatedAt: Date;
  editorIds: string[];
  actions?: ReactNode;
}) {
  const lastEditor = editorIds[0] ? getUserById(editorIds[0]) : undefined;

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="relative flex flex-col items-center gap-2">
        {avatar}
        {chip && <div className="absolute -bottom-3 shadow-sm">{chip}</div>}
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-semibold text-foreground">{name}</h2>
        <p className="text-sm text-muted-foreground">
          Last edited: {formatBuildDateLong(updatedAt)}
          {lastEditor && ` by ${lastEditor.fullName}`}
        </p>
      </div>
      {actions}
    </div>
  );
}

// ── Agent details ────────────────────────────────────────────────────────────

type AgentDetailsSheetProps = {
  agentId: string | null;
  onClose: () => void;
};

/** What the Agents table opens: everything about an agent but the builder. */
export function AgentDetailsSheet({
  agentId,
  onClose,
}: AgentDetailsSheetProps) {
  const agent = agentId ? getManagedAgentById(agentId) : undefined;
  const [tab, setTab] = useState("info");

  // A fresh agent opens on Info, wherever the last one was left.
  useEffect(() => {
    setTab("info");
  }, [agentId]);

  return (
    <Sheet open={agent != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle className="sr-only">
            {agent?.name ?? "Agent"} details
          </SheetTitle>
          <SheetDescription className="sr-only">
            Instructions, skills, usage and editors for this agent.
          </SheetDescription>
          {agent && (
            <DetailHeader
              avatar={
                <Avatar
                  size="lg"
                  emoji={agent.emoji}
                  backgroundColor={agent.backgroundColor}
                />
              }
              chip={
                <Chip
                  size="mini"
                  color={AGENT_SCOPE_INFO[agent.scope].color}
                  label={AGENT_SCOPE_INFO[agent.scope].label}
                />
              }
              name={agent.name}
              updatedAt={agent.updatedAt}
              editorIds={agent.editorIds}
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Heart}
                    tooltip="Favorite"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    icon={MessageCircle01}
                    label="New conversation"
                  />
                  {agent.canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Edit04}
                      label="Edit"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ClipboardCheck}
                    tooltip="Copy agent ID"
                  />
                  {agent.canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash01}
                      tooltip="Archive"
                    />
                  )}
                </div>
              }
            />
          )}
        </SheetHeader>
        {agent && (
          <SheetContainer>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="info" label="Info" />
                <TabsTrigger value="insights" label="Insights" />
                <TabsTrigger value="editors" label="Editors" />
              </TabsList>
              <TabsContent value="info" className="flex flex-col gap-5 pt-4">
                <AgentInfoTab agent={agent} />
              </TabsContent>
              <TabsContent
                value="insights"
                className="flex flex-col gap-5 pt-4"
              >
                <AgentInsightsTab agent={agent} />
              </TabsContent>
              <TabsContent value="editors" className="flex flex-col gap-5 pt-4">
                <EditorsList userIds={agent.editorIds} />
              </TabsContent>
            </Tabs>
          </SheetContainer>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AgentInfoTab({ agent }: { agent: ManagedAgent }) {
  const model = getModelById(agent.modelId);

  return (
    <>
      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agent.tags.map((tag) => (
            <Chip key={tag} size="xs" label={tag} />
          ))}
        </div>
      )}
      <p className="text-sm text-foreground">{agent.description}</p>
      <Section title="Instructions">
        <ProseBlock text={agent.instructions} />
      </Section>
      <Section title="Skills & Tools">
        {agent.skillIds.length === 0 ? (
          <EmptySectionNote>
            No skill attached — it answers from the model alone.
          </EmptySectionNote>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {agent.skillIds.flatMap((skillId) => {
              const skill = getManagedSkillById(skillId);
              return skill
                ? [
                    <EntityRow
                      key={skill.id}
                      visual={<SkillAvatar icon={skill.icon} />}
                      name={skill.name}
                      description={skill.description}
                    />,
                  ]
                : [];
            })}
          </div>
        )}
      </Section>
      <Section title="Knowledge">
        <SpacesList spaceIds={agent.spaceIds} />
      </Section>
      <Section title="Model">
        <EntityRow
          visual={<Avatar size="sm" icon={Robot} />}
          name={model?.name ?? agent.modelId}
          description={
            model ? `${model.maker} · ${model.tier}` : "Unknown provider"
          }
        />
      </Section>
    </>
  );
}

function AgentInsightsTab({ agent }: { agent: ManagedAgent }) {
  const total = agent.feedbackUp + agent.feedbackDown;

  return (
    <>
      <Section title="Usage">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {agent.usageCount.toLocaleString()}
          </span>{" "}
          messages over the last 30 days.
        </p>
      </Section>
      <Section title="Feedback">
        {total === 0 ? (
          <EmptySectionNote>Nobody has rated it yet.</EmptySectionNote>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {agent.feedbackUp}
            </span>{" "}
            positive and{" "}
            <span className="font-semibold text-foreground">
              {agent.feedbackDown}
            </span>{" "}
            negative, out of {total} ratings.
          </p>
        )}
      </Section>
      <Section title="Editors">
        <EditorsList userIds={agent.editorIds} />
      </Section>
    </>
  );
}

// ── Skill details ────────────────────────────────────────────────────────────

type SkillDetailsSheetProps = {
  skillId: string | null;
  onClose: () => void;
};

/** What the Skills table opens: the guidelines, the tools, the knowledge. */
export function SkillDetailsSheet({
  skillId,
  onClose,
}: SkillDetailsSheetProps) {
  const skill = skillId ? getManagedSkillById(skillId) : undefined;
  const [tab, setTab] = useState("info");

  useEffect(() => {
    setTab("info");
  }, [skillId]);

  return (
    <Sheet open={skill != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle className="sr-only">
            {skill?.name ?? "Skill"} details
          </SheetTitle>
          <SheetDescription className="sr-only">
            Guidelines, tools, knowledge and editors for this skill.
          </SheetDescription>
          {skill && (
            <DetailHeader
              avatar={<SkillAvatar icon={skill.icon} size="lg" />}
              chip={
                <Chip
                  size="mini"
                  color={SKILL_AVAILABILITY_DISPLAY[skill.availability].color}
                  label={SKILL_AVAILABILITY_DISPLAY[skill.availability].label}
                />
              }
              name={skill.name}
              updatedAt={skill.updatedAt}
              editorIds={skill.editorIds}
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Heart}
                    tooltip="Favorite"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    icon={MessageCircle01}
                    label="Try it"
                  />
                  {!skill.isDustProvided && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Edit04}
                      label="Edit"
                    />
                  )}
                  {!skill.isDustProvided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash01}
                      tooltip="Archive"
                    />
                  )}
                </div>
              }
            />
          )}
        </SheetHeader>
        {skill && (
          <SheetContainer>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="info" label="Info" />
                <TabsTrigger value="editors" label="Editors" />
              </TabsList>
              <TabsContent value="info" className="flex flex-col gap-5 pt-4">
                <SkillInfoTab skill={skill} />
              </TabsContent>
              <TabsContent value="editors" className="flex flex-col gap-5 pt-4">
                <EditorsList userIds={skill.editorIds} />
              </TabsContent>
            </Tabs>
          </SheetContainer>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SkillInfoTab({ skill }: { skill: ManagedSkill }) {
  return (
    <>
      <p className="text-sm text-foreground">{skill.description}</p>
      <Section title="Guidelines">
        <ProseBlock text={skill.guidelines} />
      </Section>
      <Section title="Tools">
        {skill.toolIds.length === 0 ? (
          <EmptySectionNote>
            No tool attached — it works off the attached knowledge.
          </EmptySectionNote>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {skill.toolIds.flatMap((toolId) => {
              const tool = getToolById(toolId);
              return tool
                ? [
                    <EntityRow
                      key={tool.id}
                      visual={<Avatar size="sm" icon={tool.icon} />}
                      name={tool.name}
                      description={tool.description}
                    />,
                  ]
                : [];
            })}
          </div>
        )}
      </Section>
      <Section title="Knowledge">
        <SpacesList spaceIds={skill.spaceIds} />
      </Section>
      <Section title="Used by">
        {skill.usedByAgentIds.length === 0 ? (
          <EmptySectionNote>No agent picked it up yet.</EmptySectionNote>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {skill.usedByAgentIds.flatMap((agentId) => {
              const agent = getManagedAgentById(agentId);
              return agent
                ? [
                    <EntityRow
                      key={agent.id}
                      visual={
                        <Avatar
                          size="sm"
                          emoji={agent.emoji}
                          backgroundColor={agent.backgroundColor}
                        />
                      }
                      name={agent.name}
                      description={agent.description}
                    />,
                  ]
                : [];
            })}
          </div>
        )}
      </Section>
    </>
  );
}

// ── Tool details ─────────────────────────────────────────────────────────────

type ToolDetailsSheetProps = {
  toolId: string | null;
  onClose: () => void;
};

/** Everything the four tabs let an admin change about a tool. */
type ToolForm = {
  name: string;
  description: string;
  /** Null for a built-in tool, whose icon is the platform's own logo. */
  iconName: string | null;
  isRestrictedToSkills: boolean;
  isConnected: boolean;
  isWorkspaceWide: boolean;
  spaceIds: string[];
  operations: ToolOperation[];
};

function formFor(tool: MockTool | undefined): ToolForm {
  return {
    name: tool?.name ?? "",
    description: tool?.description ?? "",
    iconName: tool?.iconName ?? null,
    isRestrictedToSkills: tool?.isRestrictedToSkills ?? false,
    isConnected: tool?.isConnected ?? false,
    isWorkspaceWide: tool?.isWorkspaceWide ?? false,
    spaceIds: tool ? [...tool.spaceIds] : [],
    operations: tool ? tool.operations.map((op) => ({ ...op })) : [],
  };
}

/** The icon a tool shows: the one picked for a custom server, or its logo. */
function toolIconFor(tool: MockTool, iconName: string | null) {
  const picked = iconName
    ? ActionIcons[iconName as keyof typeof ActionIcons]
    : undefined;

  return picked ?? tool.icon;
}

/**
 * What the Tools table opens. Unlike the other two this one is a form in the
 * product, so its operations and Spaces are editable here — the footer throws
 * the changes away, since nothing in the sandbox persists.
 */
export function ToolDetailsSheet({ toolId, onClose }: ToolDetailsSheetProps) {
  const tool = toolId ? getToolById(toolId) : undefined;
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState<ToolForm>(() => formFor(tool));
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [stakesSearch, setStakesSearch] = useState("");
  const [selectedOperations, setSelectedOperations] = useState<string[]>([]);

  // The form is seeded from the tool each time one opens, so cancelling is
  // nothing more than closing.
  useEffect(() => {
    setTab("general");
    setForm(formFor(tool));
    setStakesSearch("");
  }, [toolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // An operation that drops out of view drops out of the selection with it, so
  // the bar never acts on something nobody can see.
  useEffect(() => {
    setSelectedOperations([]);
  }, [toolId, tab, stakesSearch]);

  const patch = (changes: Partial<ToolForm>) =>
    setForm((previous) => ({ ...previous, ...changes }));

  const visibleOperations = useMemo(() => {
    const needle = stakesSearch.trim().toLowerCase();

    return form.operations.filter(
      (operation) =>
        needle === "" ||
        operation.name.toLowerCase().includes(needle) ||
        operation.description.toLowerCase().includes(needle)
    );
  }, [form.operations, stakesSearch]);

  const applyToSelectedOperations = (
    patchOperation: Partial<ToolOperation>
  ) => {
    const names = new Set(selectedOperations);

    setForm((previous) => ({
      ...previous,
      operations: previous.operations.map((operation) =>
        names.has(operation.name)
          ? { ...operation, ...patchOperation }
          : operation
      ),
    }));
    setSelectedOperations([]);
  };

  return (
    <Sheet open={tool != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle className="sr-only">
            {tool?.name ?? "Tool"} details
          </SheetTitle>
          <SheetDescription className="sr-only">
            Settings, availability and stakes for this tool.
          </SheetDescription>
          {tool && (
            <DetailHeader
              avatar={
                <Avatar size="lg" icon={toolIconFor(tool, form.iconName)} />
              }
              chip={
                form.isConnected ? undefined : (
                  <Chip size="mini" color="warning" label="Disconnected" />
                )
              }
              name={form.name || tool.name}
              updatedAt={tool.updatedAt}
              editorIds={[tool.editorId]}
            />
          )}
        </SheetHeader>
        {tool && (
          <>
            <SheetContainer>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="general" label="General" />
                  <TabsTrigger value="stakes" label="Tools & Stakes" />
                  <TabsTrigger value="availability" label="Availability" />
                </TabsList>
                <TabsContent
                  value="general"
                  className="flex flex-col gap-5 pt-4"
                >
                  <ToolGeneralTab
                    tool={tool}
                    form={form}
                    onPatch={patch}
                    onDelete={() => setIsDeleteOpen(true)}
                  />
                </TabsContent>
                <TabsContent
                  value="stakes"
                  className="flex flex-col gap-5 pt-4"
                >
                  <ToolStakesTab
                    operations={form.operations}
                    visibleOperations={visibleOperations}
                    search={stakesSearch}
                    onSearchChange={setStakesSearch}
                    selectedNames={selectedOperations}
                    onSelectedNamesChange={setSelectedOperations}
                    onOperationsChange={(operations) => patch({ operations })}
                  />
                </TabsContent>
                <TabsContent
                  value="availability"
                  className="flex flex-col gap-5 pt-2"
                >
                  <ToolAvailabilityTab form={form} onPatch={patch} />
                </TabsContent>
              </Tabs>
            </SheetContainer>
            {/* Outside the container: the body scrolls inside a ScrollArea,
                where nothing can stick to the bottom of the sheet. */}
            {tab === "stakes" && (
              <div className="px-5">
                <ToolStakesBatchBar
                  selectedNames={selectedOperations}
                  visibleCount={visibleOperations.length}
                  onClear={() => setSelectedOperations([])}
                  onApply={applyToSelectedOperations}
                />
              </div>
            )}
            <SheetFooter
              leftButtonProps={{ label: "Cancel", variant: "outline" }}
              rightButtonProps={{ label: "Save", variant: "highlight" }}
            />
            <Dialog
              open={isDeleteOpen}
              onOpenChange={(open) => !open && setIsDeleteOpen(false)}
            >
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>{`Delete ${form.name || tool.name}?`}</DialogTitle>
                </DialogHeader>
                <DialogContainer>
                  <DialogDescription className="text-foreground">
                    Agents and skills that call this tool will stop working.
                    This cannot be undone.
                  </DialogDescription>
                </DialogContainer>
                <DialogFooter
                  leftButtonProps={{ label: "Cancel", variant: "outline" }}
                  rightButtonProps={{
                    label: "Delete",
                    variant: "warning",
                    onClick: () => {
                      setIsDeleteOpen(false);
                      onClose();
                    },
                  }}
                />
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * A tool's name and description are overrides: leaving a field empty falls back
 * to whatever the server itself declares, which is what the placeholder shows.
 * Its connection lives here too, since an unauthenticated tool does nothing at
 * all and that is the first thing to fix when opening one.
 */
function ToolGeneralTab({
  tool,
  form,
  onPatch,
  onDelete,
}: {
  tool: MockTool;
  form: ToolForm;
  onPatch: (changes: Partial<ToolForm>) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-5 text-foreground">
        <Section title="Name">
          <Input
            aria-label="Name"
            value={form.name}
            placeholder={tool.name}
            onChange={(event) => onPatch({ name: event.target.value })}
          />
        </Section>
        <Section title="Description">
          <Input
            aria-label="Description"
            value={form.description}
            placeholder={tool.description}
            onChange={(event) => onPatch({ description: event.target.value })}
          />
        </Section>
        {tool.serverUrl !== null && (
          <ToolServerFields
            tool={tool}
            iconName={form.iconName}
            onIconNameChange={(iconName) => onPatch({ iconName })}
          />
        )}
      </div>

      {/* A tool that needs no credentials has nothing to authenticate. */}
      {tool.account !== "" && (
        <>
          <Separator />
          <ToolAuthSections
            account={TOOL_ACCOUNT_INFO[tool.account]}
            isConnected={form.isConnected}
            onConnectedChange={(isConnected) => onPatch({ isConnected })}
          />
        </>
      )}

      <Separator />
      <Section title="Delete">
        <p className="text-sm text-muted-foreground">
          Agents and skills that call this tool will stop working. This cannot
          be undone.
        </p>
        <div className="flex w-full flex-col items-start">
          <Button
            icon={Trash01}
            variant="warning"
            label="Delete tool"
            onClick={onDelete}
          />
        </div>
      </Section>
    </>
  );
}

/**
 * Where a custom MCP server lives and what it looks like. The URL is read-only
 * — re-pointing a server is a re-registration, not an edit — so the row offers
 * a re-sync next to it, and the icon is the one thing an admin picks by hand.
 */
function ToolServerFields({
  tool,
  iconName,
  onIconNameChange,
}: {
  tool: MockTool;
  iconName: string | null;
  onIconNameChange: (iconName: string) => void;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <Section title="Server URL & Icon">
      <div className="flex gap-2">
        <div className="grow">
          <Input
            aria-label="Server URL"
            value={tool.serverUrl ?? ""}
            disabled
            placeholder="https://example.com/api/mcp"
          />
        </div>
        <Button
          label="Sync"
          icon={CloudArrowLeftRight}
          variant="outline"
          tooltip="Pull the server's tool list again"
        />
        <PopoverRoot open={isPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              icon={toolIconFor(tool, iconName)}
              aria-label="Pick an icon"
              isSelect
              onClick={() => setIsPickerOpen(true)}
            />
          </PopoverTrigger>
          <PopoverContent
            className="w-fit p-0"
            onInteractOutside={() => setIsPickerOpen(false)}
            onEscapeKeyDown={() => setIsPickerOpen(false)}
          >
            <IconPicker
              icons={ActionIcons}
              selectedIcon={iconName ?? ""}
              onIconSelect={(picked) => {
                onIconNameChange(picked);
                setIsPickerOpen(false);
              }}
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    </Section>
  );
}

/**
 * Whose credentials the tool runs with: the connection itself, and what the
 * account means for the people using it. Only shown for a tool that
 * authenticates at all.
 */
function ToolAuthSections({
  account,
  isConnected,
  onConnectedChange,
}: {
  account: { label: string; description: string };
  isConnected: boolean;
  onConnectedChange: (isConnected: boolean) => void;
}) {
  return (
    <>
      <Section title="Authentication">
        <div className="flex items-center gap-2">
          <div className="flex grow">
            <Chip
              size="sm"
              color={isConnected ? "success" : "warning"}
              label={isConnected ? "Active" : "Requires authentication"}
            />
          </div>
          {isConnected ? (
            <Button
              label="Deactivate"
              icon={XClose}
              variant="outline"
              onClick={() => onConnectedChange(false)}
            />
          ) : (
            <Button
              label="Activate"
              icon={LogIn01}
              variant="primary"
              onClick={() => onConnectedChange(true)}
            />
          )}
        </div>
      </Section>
      {isConnected && (
        <Section title="Credentials">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">{account.label}</span>:{" "}
            {account.description}
          </p>
        </Section>
      )}
    </>
  );
}

/**
 * Every operation the server exposes, each one switchable and carrying the
 * stake level that decides whether Dust asks before running it. A real server
 * declares dozens, hence the search and the selection: the batch bar itself
 * lives up in the sheet, which is the only place it can float over the footer.
 */
function ToolStakesTab({
  operations,
  visibleOperations,
  search,
  onSearchChange,
  selectedNames,
  onSelectedNamesChange,
  onOperationsChange,
}: {
  operations: ToolOperation[];
  /** What the search leaves, and the only thing the list renders. */
  visibleOperations: ToolOperation[];
  search: string;
  onSearchChange: (search: string) => void;
  selectedNames: string[];
  onSelectedNamesChange: (names: string[]) => void;
  onOperationsChange: (operations: ToolOperation[]) => void;
}) {
  const update = (name: string, patch: Partial<ToolOperation>) =>
    onOperationsChange(
      operations.map((op) => (op.name === name ? { ...op, ...patch } : op))
    );

  const selected = new Set(selectedNames);

  const toggleSelected = (name: string) =>
    onSelectedNamesChange(
      selected.has(name)
        ? selectedNames.filter((selectedName) => selectedName !== name)
        : [...selectedNames, name]
    );

  // "Select all" only ever reaches what the search left, which is also all the
  // button has to check before it turns into "Deselect all".
  const allVisibleSelected =
    visibleOperations.length > 0 &&
    visibleOperations.every((operation) => selected.has(operation.name));

  return (
    <>
      <div className="heading-base text-foreground">
        {visibleOperations.length === operations.length
          ? `${operations.length} tools available`
          : `${visibleOperations.length} of ${operations.length} tools available`}
      </div>

      <ContentMessage
        className="w-full"
        variant="blue"
        size="lg"
        icon={InfoCircle}
        title="User Approval Settings"
      >
        <ul>
          <li>
            <b>High stake</b> tools need explicit user approval.
          </li>
          <li>
            <b>Medium stake</b> tools allow users to save confirmations for
            specific tool inputs.
          </li>
          <li>
            Users can completely disable confirmations for <b>low stake</b>{" "}
            tools.
          </li>
          <li>
            <b>Never ask</b> tools run automatically.
          </li>
        </ul>
      </ContentMessage>

      <div className="flex items-center gap-2">
        <SearchInput
          name="operation-filter"
          placeholder="Search tools"
          className="grow"
          value={search}
          onChange={onSearchChange}
        />
        <Button
          size="sm"
          variant="outline"
          label={allVisibleSelected ? "Deselect all" : "Select all"}
          disabled={visibleOperations.length === 0}
          onClick={() =>
            onSelectedNamesChange(
              allVisibleSelected
                ? []
                : visibleOperations.map((operation) => operation.name)
            )
          }
        />
      </div>

      {visibleOperations.length === 0 ? (
        <EmptySectionNote>No tool matches that search.</EmptySectionNote>
      ) : (
        <ListGroup>
          {visibleOperations.map((operation) => (
            <ToolOperationRow
              key={operation.name}
              operation={operation}
              isSelected={selected.has(operation.name)}
              onSelectedChange={() => toggleSelected(operation.name)}
              onPatch={(patch) => update(operation.name, patch)}
            />
          ))}
        </ListGroup>
      )}
    </>
  );
}

/**
 * One operation: ticked to put it in the batch, switched off to take it away
 * from every agent, and carrying both its stake and the description the server
 * declared for it. Turning it off leaves the stake visible but out of reach,
 * since a disabled operation has nothing to ask about.
 */
function ToolOperationRow({
  operation,
  isSelected,
  onSelectedChange,
  onPatch,
}: {
  operation: ToolOperation;
  isSelected: boolean;
  onSelectedChange: () => void;
  onPatch: (patch: Partial<ToolOperation>) => void;
}) {
  const checkboxId = `select-operation-${operation.name}`;

  return (
    <ListItem className="flex-col gap-2">
      <div className="flex w-full items-center gap-2">
        {/* The label makes the name a hit target for the checkbox too. */}
        <Label
          htmlFor={checkboxId}
          className="flex grow cursor-pointer items-center gap-2"
        >
          <Checkbox
            id={checkboxId}
            checked={isSelected}
            aria-label={
              isSelected
                ? `Deselect ${operation.name}`
                : `Select ${operation.name}`
            }
            onCheckedChange={onSelectedChange}
          />
          <span className="heading-base text-foreground">{operation.name}</span>
        </Label>
        <SliderToggle
          selected={operation.enabled}
          onClick={() => onPatch({ enabled: !operation.enabled })}
        />
      </div>

      {/* pl-6 clears the checkbox and its gap, so everything below the name
          lines up with the name rather than with the tick. */}
      <ClampedDescription className="pl-6">
        {operation.description}
      </ClampedDescription>

      <div className="flex w-full items-center justify-between gap-2 pl-6">
        <Label>Stake</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={!operation.enabled}
              label={TOOL_STAKE_LEVELS[operation.stake].longLabel}
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {TOOL_STAKES.map((stake) => (
              <DropdownMenuItem
                key={stake}
                label={TOOL_STAKE_LEVELS[stake].longLabel}
                onClick={() => onPatch({ stake })}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ListItem>
  );
}

/**
 * The description a server declares for one of its tools, kept to two lines.
 * These run to a paragraph in the wild, and thirty paragraphs would bury the
 * list they are meant to explain.
 */
function ClampedDescription({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Measured while clamped, so the toggle only shows up on text that really
  // runs past two lines. Expanding lifts the clamp and would measure equal,
  // which is why `isExpanded` is deliberately not a dependency.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (element) {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    }
  }, [children]);

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <p
        ref={textRef}
        className={cn(
          "break-words text-sm italic text-muted-foreground",
          !isExpanded && "line-clamp-2"
        )}
      >
        {children}
      </p>
      {overflows && (
        <Button
          size="xs"
          variant="ghost-secondary"
          label={isExpanded ? "Show less" : "Show more"}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      )}
    </div>
  );
}

/**
 * The batch actions for the operation list, in the same bar the Agents and
 * Skills tables raise once rows are ticked. Nothing here is destructive and
 * the footer's Cancel still throws the lot away, so none of it asks twice.
 */
function ToolStakesBatchBar({
  selectedNames,
  visibleCount,
  onClear,
  onApply,
}: {
  selectedNames: string[];
  visibleCount: number;
  onClear: () => void;
  onApply: (patch: Partial<ToolOperation>) => void;
}) {
  return (
    <BulkSelectionBar
      selectedCount={selectedNames.length}
      totalCount={visibleCount}
      itemLabel="tool"
      // The list carries its own "Select all" next to the search, so the bar
      // does not offer a second one.
      canSelectAll={false}
      onSelectAll={() => {}}
      onClear={onClear}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="primary" isSelect label="Set stake" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label="Set stake" />
          {TOOL_STAKES.map((stake) => (
            <DropdownMenuItem
              key={stake}
              label={TOOL_STAKE_LEVELS[stake].longLabel}
              onClick={() => onApply({ stake })}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="primary" isSelect label="State" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label="State" />
          <DropdownMenuItem
            icon={Check}
            label="Enable"
            onClick={() => onApply({ enabled: true })}
          />
          <DropdownMenuItem
            icon={XClose}
            label="Disable"
            onClick={() => onApply({ enabled: false })}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </BulkSelectionBar>
  );
}

type SharingRow = {
  id: string;
  name: string;
  enabled: boolean;
  /** The whole row toggles, so the switch is not the only hit target. */
  onClick: () => void;
};

/** One switchable availability rule, with the copy that explains its state. */
function AvailabilityRule({
  title,
  selected,
  onToggle,
  children,
}: {
  title: string;
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-y-2">
      <div className="flex w-full items-center justify-between overflow-visible">
        <h3 className="heading-base text-foreground">{title}</h3>
        <SliderToggle selected={selected} onClick={onToggle} />
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

/**
 * Two rules narrow down who reaches the tool: whether a skill has to carry it,
 * and whether the whole workspace gets it or a hand-picked set of Spaces. The
 * Space table only exists in that second case, which is why the toggle hides
 * it — and why it sits last, where it can grow without moving anything.
 */
function ToolAvailabilityTab({
  form,
  onPatch,
}: {
  form: ToolForm;
  onPatch: (changes: Partial<ToolForm>) => void;
}) {
  const [filter, setFilter] = useState("");
  const enabled = useMemo(() => new Set(form.spaceIds), [form.spaceIds]);

  const toggleSpace = (spaceId: string) =>
    onPatch({
      spaceIds: enabled.has(spaceId)
        ? form.spaceIds.filter((id) => id !== spaceId)
        : [...form.spaceIds, spaceId],
    });

  const columns: ColumnDef<SharingRow>[] = useMemo(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: (info: CellContext<SharingRow, string>) => (
          <DataTable.CellContent icon={Server03} grow>
            <span className="truncate">{info.getValue()}</span>
          </DataTable.CellContent>
        ),
      },
      {
        id: "enabled",
        accessorKey: "enabled",
        header: "",
        enableSorting: false,
        cell: (info: CellContext<SharingRow, boolean>) => {
          const { name, onClick } = info.row.original;
          return (
            <DataTable.CellContent className="justify-end">
              <Tooltip
                label={
                  info.getValue() ? `Remove from ${name}` : `Add to ${name}`
                }
                trigger={
                  <div>
                    <SliderToggle
                      selected={info.getValue()}
                      onClick={onClick}
                    />
                  </div>
                }
              />
            </DataTable.CellContent>
          );
        },
        meta: { className: "w-14" },
      },
    ],
    []
  );

  const rows: SharingRow[] = mockCompanySpaces
    .map((space) => ({
      id: space.id,
      name: space.name,
      enabled: enabled.has(space.id),
      /** The whole row toggles, so the switch is not the only hit target. */
      onClick: () => toggleSpace(space.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="flex w-full flex-col gap-5 pt-2">
        <AvailabilityRule
          title="Restrict this tool to skills"
          selected={form.isRestrictedToSkills}
          onToggle={() =>
            onPatch({ isRestrictedToSkills: !form.isRestrictedToSkills })
          }
        >
          {form.isRestrictedToSkills
            ? "Agents can only reach this tool through a skill, which carries the workspace context and safety rules with it."
            : "Agents can pick this tool up on its own, without a skill to frame how it is used."}
        </AvailabilityRule>

        <Separator />

        <AvailabilityRule
          title="Available to all workspace members"
          selected={form.isWorkspaceWide}
          onToggle={() => onPatch({ isWorkspaceWide: !form.isWorkspaceWide })}
        >
          {form.isWorkspaceWide
            ? "These tools are accessible to everyone in the workspace."
            : "These tools are only available to the users of the selected spaces."}
        </AvailabilityRule>
      </div>

      {!form.isWorkspaceWide && (
        <>
          <Separator />

          <Section title="Selected availability">
            <SearchInput
              name="filter"
              placeholder="Search a space"
              className="w-full"
              value={filter}
              onChange={setFilter}
            />
            <DataTable
              data={rows}
              columns={columns}
              filter={filter}
              filterColumn="name"
            />
          </Section>
        </>
      )}
    </>
  );
}
