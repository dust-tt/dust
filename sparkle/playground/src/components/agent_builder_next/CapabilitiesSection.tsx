import {
  ActionCard,
  Avatar,
  BookOpen01,
  Button,
  Card,
  CardGrid,
  Checkbox,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  EmptyCTA,
  Hoverable,
  Icon,
  Input,
  Label,
  ListGroup,
  ListItem,
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  SearchInput,
  ShapesPlus,
  Stars02,
  TextArea,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import {
  type ManagedSkill,
  type MockTool,
  SKILL_AVAILABILITY_DISPLAY,
  TOOL_STAKE_LEVELS,
} from "../../data/build";
import { mockUsers } from "../../data/users";
import {
  activeSkills,
  activeTools,
  CAPABILITY_LOGO_STRIP,
  getToolConfigurationKinds,
  mockBuilderSpaces,
  mockChildAgents,
  mockDustApps,
  mockSecrets,
  TIME_FRAME_UNITS,
  type TimeFrameUnit,
  type ToolConfigurationKind,
} from "./data";
import { ConfirmDialog } from "./dialogs";
import { BuilderSection } from "./SectionContainer";

// ---------------------------------------------------------------------------
// Builder state for capabilities
// ---------------------------------------------------------------------------

export type ToolConfiguration = {
  name: string;
  childAgentId: string | null;
  timeFrame: { enabled: boolean; value: number; unit: TimeFrameUnit };
  dustAppId: string | null;
  dustAppSpaceId: string | null;
  podId: string | null;
  secretId: string | null;
  jsonSchema: string;
  additional: Record<string, string>;
};

export type AddedTool = {
  key: string;
  tool: MockTool;
  configuration: ToolConfiguration | null;
};

export type AddedSkill = { skill: ManagedSkill };

export function emptyToolConfiguration(tool: MockTool): ToolConfiguration {
  return {
    name: tool.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    childAgentId: null,
    timeFrame: { enabled: false, value: 7, unit: "day" },
    dustAppId: null,
    dustAppSpaceId: null,
    podId: null,
    secretId: null,
    jsonSchema: "",
    additional: {},
  };
}

function validateConfiguration(
  kinds: ToolConfigurationKind[],
  configuration: ToolConfiguration
): string | null {
  if (!configuration.name.trim()) {
    return "The name cannot be empty.";
  }
  if (!/^[a-z0-9_]+$/.test(configuration.name)) {
    return "The name can only contain lowercase letters, numbers, and underscores (no spaces).";
  }
  if (kinds.includes("child_agent") && !configuration.childAgentId) {
    return "Child agent selection is required";
  }
  if (kinds.includes("dust_app") && !configuration.dustAppId) {
    return "Please select a Dust app";
  }
  if (kinds.includes("secret") && !configuration.secretId) {
    return "Secret selection is required";
  }
  if (kinds.includes("pod") && !configuration.podId) {
    return "Please select one Pod";
  }
  return null;
}

const ADDITIONAL_FIELDS = [
  { key: "base_url", type: "string" as const },
  { key: "timeout_seconds", type: "number" as const },
  { key: "verify_ssl", type: "boolean" as const },
  {
    key: "region",
    type: "enum" as const,
    options: ["eu-west-1", "us-east-1", "ap-south-1"],
  },
];

// ---------------------------------------------------------------------------
// Configuration page
// ---------------------------------------------------------------------------

function ConfigurationPage({
  tool,
  configuration,
  onChange,
}: {
  tool: MockTool;
  configuration: ToolConfiguration;
  onChange: (next: ToolConfiguration) => void;
}) {
  const kinds = getToolConfigurationKinds(tool.id);
  const [agentSearch, setAgentSearch] = useState("");
  const [podSearch, setPodSearch] = useState("");
  const [listSearch, setListSearch] = useState("");
  const pods = mockBuilderSpaces.filter((space) => space.kind === "pod");
  const filteredAgents = mockChildAgents.filter((agent) =>
    agent.name.toLowerCase().includes(agentSearch.trim().toLowerCase())
  );
  const selectedAgent = mockChildAgents.find(
    (agent) => agent.id === configuration.childAgentId
  );
  const selectedApp = mockDustApps.find(
    (app) => app.id === configuration.dustAppId
  );
  const selectedSecret = mockSecrets.find(
    (secret) => secret.id === configuration.secretId
  );
  const appsInSpace = mockDustApps.filter(
    (app) => app.spaceId === configuration.dustAppSpaceId
  );
  const listOptions = [
    "Issues",
    "Pull requests",
    "Discussions",
    "Releases",
    "Wiki",
  ].filter((option) =>
    option.toLowerCase().includes(listSearch.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Name</Label>
        <Input
          placeholder="My tool name…"
          value={configuration.name}
          onChange={(event) =>
            onChange({ ...configuration, name: event.target.value })
          }
        />
      </div>

      {kinds.includes("child_agent") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Select an agent</Label>
          {selectedAgent ? (
            <Card size="sm" variant="secondary">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Avatar
                    size="sm"
                    name={selectedAgent.name}
                    emoji={selectedAgent.emoji}
                    backgroundColor={selectedAgent.backgroundColor}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {selectedAgent.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedAgent.description}
                    </span>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  label="Edit agent"
                  onClick={() =>
                    onChange({ ...configuration, childAgentId: null })
                  }
                />
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              <SearchInput
                name="child-agent-search"
                placeholder="Search"
                value={agentSearch}
                onChange={setAgentSearch}
              />
              {filteredAgents.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No agents available
                </div>
              ) : (
                <ListGroup>
                  {filteredAgents.map((agent) => (
                    <ListItem
                      key={agent.id}
                      itemsAlignment="center"
                      onClick={() =>
                        onChange({ ...configuration, childAgentId: agent.id })
                      }
                    >
                      <Avatar
                        size="xs"
                        name={agent.name}
                        emoji={agent.emoji}
                        backgroundColor={agent.backgroundColor}
                      />
                      <span className="text-sm text-foreground">
                        {agent.name}
                      </span>
                    </ListItem>
                  ))}
                </ListGroup>
              )}
            </div>
          )}
        </div>
      ) : null}

      {kinds.includes("time_frame") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">
            Time range configuration
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              checked={configuration.timeFrame.enabled}
              onCheckedChange={(checked) =>
                onChange({
                  ...configuration,
                  timeFrame: {
                    ...configuration.timeFrame,
                    enabled: checked === true,
                  },
                })
              }
            />
            <span className="text-sm text-foreground">
              Search data from the last
            </span>
            <Input
              type="number"
              containerClassName="w-20"
              value={String(configuration.timeFrame.value)}
              disabled={!configuration.timeFrame.enabled}
              onChange={(event) =>
                onChange({
                  ...configuration,
                  timeFrame: {
                    ...configuration.timeFrame,
                    value: Number(event.target.value) || 1,
                  },
                })
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  className="self-start"
                  disabled={!configuration.timeFrame.enabled}
                  label={`${configuration.timeFrame.unit}${configuration.timeFrame.value > 1 ? "s" : ""}`}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {TIME_FRAME_UNITS.map((unit) => (
                  <DropdownMenuItem
                    key={unit}
                    label={`${unit}${configuration.timeFrame.value > 1 ? "s" : ""}`}
                    onSelect={() =>
                      onChange({
                        ...configuration,
                        timeFrame: { ...configuration.timeFrame, unit },
                      })
                    }
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}

      {kinds.includes("dust_app") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Select a Dust app</Label>
          <p className="text-sm text-muted-foreground">
            The agent will execute a Dust Application of your design before
            replying. The output of the app will be used as context.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Space:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  className="self-start"
                  label={
                    mockBuilderSpaces.find(
                      (space) => space.id === configuration.dustAppSpaceId
                    )?.name ?? "Select a space..."
                  }
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {mockBuilderSpaces
                  .filter((space) => space.kind === "space")
                  .map((space) => (
                    <DropdownMenuItem
                      key={space.id}
                      label={space.name}
                      onSelect={() =>
                        onChange({
                          ...configuration,
                          dustAppSpaceId: space.id,
                          dustAppId: null,
                        })
                      }
                    />
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {selectedApp ? (
            <Card size="sm" variant="secondary">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {selectedApp.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {selectedApp.description}
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  label="Edit selection"
                  onClick={() =>
                    onChange({ ...configuration, dustAppId: null })
                  }
                />
              </div>
            </Card>
          ) : configuration.dustAppSpaceId ? (
            appsInSpace.length === 0 ? (
              <div className="flex flex-col text-sm">
                <span className="font-medium text-foreground">
                  No Dust apps available for this space
                </span>
                <span className="text-muted-foreground">
                  Create one or ask your admin to install apps from other
                  spaces.
                </span>
              </div>
            ) : (
              <ListGroup>
                {appsInSpace.map((app) => (
                  <ListItem
                    key={app.id}
                    itemsAlignment="center"
                    onClick={() =>
                      onChange({ ...configuration, dustAppId: app.id })
                    }
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {app.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {app.description}
                      </span>
                    </div>
                  </ListItem>
                ))}
              </ListGroup>
            )
          ) : null}
        </div>
      ) : null}

      {kinds.includes("pod") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Select a Pod</Label>
          <p className="text-sm text-muted-foreground">
            Choose the Pod that the agent can access through this tool.
          </p>
          {pods.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No Pods available
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  className="self-start"
                  label={
                    pods.find((pod) => pod.id === configuration.podId)?.name ??
                    "Select a Pod..."
                  }
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuSearchbar
                  name="pod-search"
                  placeholder="Search..."
                  value={podSearch}
                  onChange={setPodSearch}
                />
                {pods.filter((pod) =>
                  pod.name
                    .toLowerCase()
                    .includes(podSearch.trim().toLowerCase())
                ).length === 0 ? (
                  <DropdownMenuItem label="No matches" disabled />
                ) : (
                  pods
                    .filter((pod) =>
                      pod.name
                        .toLowerCase()
                        .includes(podSearch.trim().toLowerCase())
                    )
                    .map((pod) => (
                      <DropdownMenuItem
                        key={pod.id}
                        label={pod.name}
                        onSelect={() =>
                          onChange({ ...configuration, podId: pod.id })
                        }
                      />
                    ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : null}

      {kinds.includes("secret") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Select a secret</Label>
          {selectedSecret ? (
            <Card size="sm" variant="secondary">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-foreground">
                  {selectedSecret.name}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  label="Change"
                  onClick={() => onChange({ ...configuration, secretId: null })}
                />
              </div>
            </Card>
          ) : mockSecrets.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No secrets found. Create a secret in your workspace settings
              first.
            </div>
          ) : (
            <ListGroup>
              {mockSecrets.map((secret) => (
                <ListItem
                  key={secret.id}
                  itemsAlignment="center"
                  onClick={() =>
                    onChange({ ...configuration, secretId: secret.id })
                  }
                >
                  <span className="flex-1 font-mono text-sm text-foreground">
                    {secret.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {secret.createdAt}
                  </span>
                </ListItem>
              ))}
            </ListGroup>
          )}
        </div>
      ) : null}

      {kinds.includes("json_schema") ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Schema</Label>
          <p className="text-sm text-muted-foreground">
            Optionally, provide a schema for the data to be extracted. If you do
            not specify a schema, the tool will determine the schema based on
            the conversation context.
          </p>
          <div>
            <Button
              size="sm"
              variant="primary"
              icon={Stars02}
              label="Re-generate from instructions"
              onClick={() =>
                onChange({
                  ...configuration,
                  jsonSchema:
                    '{\n  "type": "object",\n  "properties": {\n    "amount": { "type": "number" },\n    "currency": { "type": "string" }\n  }\n}',
                })
              }
            />
          </div>
          <TextArea
            value={configuration.jsonSchema}
            onChange={(event) =>
              onChange({ ...configuration, jsonSchema: event.target.value })
            }
            placeholder='{ "type": "object", "properties": { ... } }'
            minRows={6}
            resize="vertical"
            className="font-mono text-xs"
          />
        </div>
      ) : null}

      {kinds.includes("additional") ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col">
            <Label className="text-base font-semibold">
              Additional configuration
            </Label>
            <span className="text-sm text-muted-foreground">
              Configure additional parameters required by this action.
            </span>
          </div>
          {ADDITIONAL_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <Label isMuted>{field.key}</Label>
              {field.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={configuration.additional[field.key] === "true"}
                    tooltip={`Whether ${field.key.replace(/_/g, " ")} applies`}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...configuration,
                        additional: {
                          ...configuration.additional,
                          [field.key]: checked === true ? "true" : "false",
                        },
                      })
                    }
                  />
                  <span className="text-sm text-foreground">
                    {field.key.replace(/_/g, " ")}
                  </span>
                </div>
              ) : field.type === "enum" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      isSelect
                      className="self-start"
                      label={
                        configuration.additional[field.key] ??
                        `Select ${field.key}`
                      }
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {field.options?.map((option) => (
                      <DropdownMenuItem
                        key={option}
                        label={option}
                        onSelect={() =>
                          onChange({
                            ...configuration,
                            additional: {
                              ...configuration.additional,
                              [field.key]: option,
                            },
                          })
                        }
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Input
                  type={field.type === "number" ? "number" : "text"}
                  placeholder={`Enter value for ${field.key}`}
                  value={configuration.additional[field.key] ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...configuration,
                      additional: {
                        ...configuration.additional,
                        [field.key]: event.target.value,
                      },
                    })
                  }
                />
              )}
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label isMuted>resources</Label>
            <SearchInput
              name="list-search"
              placeholder="Search resources..."
              value={listSearch}
              onChange={setListSearch}
            />
            {listOptions.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                {listSearch
                  ? `No options match "${listSearch}"`
                  : "No options available"}
              </span>
            ) : (
              <div className="flex flex-col gap-1 pt-1">
                {listOptions.map((option) => {
                  const selected = (configuration.additional.resources ?? "")
                    .split(",")
                    .filter(Boolean);
                  const isChecked = selected.includes(option);
                  return (
                    <div key={option} className="flex items-center gap-2">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => {
                          const next = isChecked
                            ? selected.filter((value) => value !== option)
                            : [...selected, option];
                          onChange({
                            ...configuration,
                            additional: {
                              ...configuration.additional,
                              resources: next.join(","),
                            },
                          });
                        }}
                      />
                      <span className="text-sm text-foreground">{option}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info pages
// ---------------------------------------------------------------------------

function SkillInfoPage({ skill }: { skill: ManagedSkill }) {
  const editors = mockUsers.filter((user) => skill.editorIds.includes(user.id));
  const availability = SKILL_AVAILABILITY_DISPLAY[skill.availability];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Chip size="xs" color={availability.color} label={availability.label} />
        {skill.isDustProvided ? (
          <Chip size="xs" label="Provided by Dust" />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-base font-semibold">Guidelines</Label>
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {skill.guidelines}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-base font-semibold">Tools</Label>
        <div className="flex flex-wrap gap-2">
          {skill.toolIds.map((toolId) => {
            const tool = activeTools.find(
              (candidate) => candidate.id === toolId
            );
            return tool ? (
              <Chip key={toolId} size="xs" icon={tool.icon} label={tool.name} />
            ) : null;
          })}
        </div>
      </div>
      {!skill.isDustProvided ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Last edited{" "}
          {skill.updatedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          by {editors[0]?.fullName ?? "Unknown"}
          <Avatar.Stack
            size="xs"
            avatars={editors.map((user) => ({
              name: user.fullName,
              visual: user.portrait,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function ToolInfoPage({ tool }: { tool: MockTool }) {
  const operations = tool.operations ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="heading-base text-foreground">Available tools</span>
        <Chip size="xs" label={`${operations.length} tools`} />
      </div>
      <p className="text-sm text-muted-foreground">
        These tools will be available to your agent during conversations and can
        be configured with different permission levels:
      </p>
      {operations.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No tools are currently available for this server.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {operations.map((operation) => (
            <div
              key={operation.name}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="flex flex-col">
                <span className="font-mono text-sm text-foreground">
                  {operation.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {operation.description}
                </span>
              </div>
              <Chip
                size="mini"
                color={
                  operation.stake === "high"
                    ? "warning"
                    : operation.stake === "never_ask"
                      ? "success"
                      : "primary"
                }
                label={TOOL_STAKE_LEVELS[operation.stake].label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capabilities sheet
// ---------------------------------------------------------------------------

type SheetPage =
  | { id: "add" }
  | { id: "skill"; skill: ManagedSkill }
  | { id: "tool"; tool: MockTool }
  | {
      id: "configure";
      tool: MockTool;
      existingKey: string | null;
      configuration: ToolConfiguration;
    };

type FilterId = "all" | "skills" | "tools";

export function CapabilitiesSheet({
  open,
  onOpenChange,
  initialPage,
  addedSkills,
  addedTools,
  onAdd,
  onSaveConfiguration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage: SheetPage;
  addedSkills: AddedSkill[];
  addedTools: AddedTool[];
  onAdd: (skills: ManagedSkill[], tools: MockTool[]) => void;
  onSaveConfiguration: (
    tool: MockTool,
    configuration: ToolConfiguration,
    existingKey: string | null
  ) => void;
}) {
  const [page, setPage] = useState<SheetPage>(initialPage);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPage(initialPage);
      setSearch("");
      setFilter("all");
      setSelectedSkillIds(new Set());
      setSelectedToolIds(new Set());
      setIsLoading(true);
      const timer = window.setTimeout(() => setIsLoading(false), 400);
      return () => window.clearTimeout(timer);
    }
  }, [open, initialPage]);

  const needle = search.trim().toLowerCase();
  const addedSkillIds = new Set(addedSkills.map((entry) => entry.skill.id));
  const addedToolIds = new Set(addedTools.map((entry) => entry.tool.id));
  const visibleSkills = useMemo(
    () =>
      activeSkills.filter(
        (skill) =>
          (filter === "all" || filter === "skills") &&
          (!needle ||
            skill.name.toLowerCase().includes(needle) ||
            skill.description.toLowerCase().includes(needle))
      ),
    [filter, needle]
  );
  const visibleTools = useMemo(
    () =>
      activeTools.filter(
        (tool) =>
          (filter === "all" || filter === "tools") &&
          (!needle ||
            tool.name.toLowerCase().includes(needle) ||
            tool.description.toLowerCase().includes(needle))
      ),
    [filter, needle]
  );
  const selectedCount = selectedSkillIds.size + selectedToolIds.size;
  const selectedSkills = activeSkills.filter((skill) =>
    selectedSkillIds.has(skill.id)
  );
  const selectedTools = activeTools.filter((tool) =>
    selectedToolIds.has(tool.id)
  );

  const toggleSkill = (id: string) =>
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const toggleTool = (id: string) =>
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const filterButton = (id: FilterId, label: string) => (
    <Button
      key={id}
      size="xs"
      variant={filter === id ? "primary" : "outline"}
      label={label}
      onClick={() => setFilter(id)}
    />
  );

  const addPageContent = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SearchInput
          name="capabilities-search"
          placeholder="Search capabilities..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex gap-2">
          {filterButton("all", "All")}
          {filterButton("skills", "Skills")}
          {filterButton("tools", "Tools")}
        </div>
      </div>
      {isLoading ? (
        <CardGrid>
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl bg-muted-background"
            />
          ))}
        </CardGrid>
      ) : visibleSkills.length === 0 && visibleTools.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-10 text-center">
          <span className="heading-base text-foreground">
            {needle
              ? "No capability matches your search"
              : "No capabilities available"}
          </span>
          <span className="text-sm text-muted-foreground">
            {needle
              ? "Try a different search term."
              : "Add tools or create skills to enhance your agents."}
          </span>
        </div>
      ) : (
        <>
          {visibleSkills.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col">
                <span className="heading-base text-foreground">Skills</span>
                <span className="text-sm text-muted-foreground">
                  Reusable packages of instructions and tools that enable agents
                  to perform specialized tasks.
                </span>
              </div>
              <CardGrid>
                {visibleSkills.map((skill) => {
                  const isAdded = addedSkillIds.has(skill.id);
                  return (
                    <ActionCard
                      key={skill.id}
                      icon={skill.icon}
                      label={skill.name}
                      description={skill.description}
                      cardContainerClassName="h-36"
                      canAdd={!isAdded}
                      isSelected={isAdded || selectedSkillIds.has(skill.id)}
                      onClick={
                        isAdded ? undefined : () => toggleSkill(skill.id)
                      }
                      footer={{
                        label: "Skill details",
                        onClick: () => setPage({ id: "skill", skill }),
                      }}
                    />
                  );
                })}
              </CardGrid>
            </div>
          ) : null}
          {visibleTools.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col">
                <span className="heading-base text-foreground">Tools</span>
                <span className="text-sm text-muted-foreground">
                  Tools that allow agents to retrieve data and take actions.
                </span>
              </div>
              <CardGrid>
                {visibleTools.map((tool) => {
                  const isAdded = addedToolIds.has(tool.id);
                  const needsConfiguration =
                    getToolConfigurationKinds(tool.id).length > 0;
                  return (
                    <ActionCard
                      key={tool.id}
                      icon={tool.icon}
                      label={tool.name}
                      description={tool.description}
                      cardContainerClassName="h-30"
                      canAdd={!isAdded}
                      isSelected={isAdded || selectedToolIds.has(tool.id)}
                      onClick={
                        isAdded
                          ? undefined
                          : needsConfiguration
                            ? () =>
                                setPage({
                                  id: "configure",
                                  tool,
                                  existingKey: null,
                                  configuration: emptyToolConfiguration(tool),
                                })
                            : () => toggleTool(tool.id)
                      }
                      footer={{
                        label: tool.serverUrl
                          ? "Find documentation here."
                          : "Tool details",
                        onClick: () => setPage({ id: "tool", tool }),
                      }}
                    />
                  );
                })}
              </CardGrid>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const selectionFooter =
    selectedCount > 0 ? (
      <div className="flex flex-col gap-2">
        <span className="heading-xs text-muted-foreground">
          Selected capabilities
        </span>
        <div className="flex flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <Chip
              key={skill.id}
              size="xs"
              color="success"
              icon={skill.icon}
              label={skill.name}
              onRemove={() => toggleSkill(skill.id)}
            />
          ))}
          {selectedTools.map((tool) => (
            <Chip
              key={tool.id}
              size="xs"
              color="success"
              icon={tool.icon}
              label={tool.name}
              onRemove={() => toggleTool(tool.id)}
            />
          ))}
        </div>
      </div>
    ) : undefined;

  const configurationError =
    page.id === "configure"
      ? validateConfiguration(
          getToolConfigurationKinds(page.tool.id),
          page.configuration
        )
      : null;

  const pages: MultiPageSheetPage[] = [
    {
      id: "add",
      title: "Add capabilities",
      icon: ShapesPlus,
      content: addPageContent,
      footerContent: selectionFooter,
    },
    ...(page.id === "skill"
      ? [
          {
            id: "skill",
            title: page.skill.name,
            description: page.skill.description,
            icon: page.skill.icon,
            content: <SkillInfoPage skill={page.skill} />,
          },
        ]
      : []),
    ...(page.id === "tool"
      ? [
          {
            id: "tool",
            title: page.tool.name || "Tool information",
            description: page.tool.description || "No description available",
            icon: page.tool.icon,
            content: <ToolInfoPage tool={page.tool} />,
          },
        ]
      : []),
    ...(page.id === "configure"
      ? [
          {
            id: "configure",
            title: page.existingKey
              ? `Edit ${page.tool.name} configuration`
              : `Configure ${page.tool.name}`,
            icon: page.tool.icon,
            content: (
              <ConfigurationPage
                tool={page.tool}
                configuration={page.configuration}
                onChange={(configuration) =>
                  setPage({ ...page, configuration })
                }
              />
            ),
            footerContent: configurationError ? (
              <span className="text-sm text-foreground-warning">
                {configurationError}
              </span>
            ) : undefined,
          },
        ]
      : []),
  ];

  const footerButtons = (() => {
    switch (page.id) {
      case "add":
        return {
          leftButton: {
            label: "Cancel",
            variant: "outline" as const,
            onClick: () => onOpenChange(false),
          },
          rightButton: {
            label:
              selectedCount === 0
                ? "Add capabilities"
                : `Add ${selectedCount} ${selectedCount === 1 ? "capability" : "capabilities"}`,
            variant: "primary" as const,
            disabled: selectedCount === 0,
            onClick: () => {
              onAdd(selectedSkills, selectedTools);
              onOpenChange(false);
            },
          },
        };
      case "skill":
      case "tool":
        return {
          leftButton:
            initialPage.id === "add"
              ? {
                  label: "Back",
                  variant: "outline" as const,
                  onClick: () => setPage({ id: "add" }),
                }
              : undefined,
          rightButton: {
            label: "Close",
            variant: "primary" as const,
            onClick: () => onOpenChange(false),
          },
        };
      case "configure":
        return {
          leftButton: {
            label: page.existingKey ? "Close" : "Cancel",
            variant: "outline" as const,
            onClick: () =>
              page.existingKey ? onOpenChange(false) : setPage({ id: "add" }),
          },
          rightButton: {
            label: "Save",
            variant: "primary" as const,
            disabled: configurationError !== null,
            onClick: () => {
              onSaveConfiguration(
                page.tool,
                page.configuration,
                page.existingKey
              );
              onOpenChange(false);
            },
          },
        };
    }
  })();

  return (
    <MultiPageSheet open={open} onOpenChange={onOpenChange}>
      <MultiPageSheetContent
        pages={pages}
        currentPageId={page.id}
        onPageChange={(id) => {
          if (id === "add") {
            setPage({ id: "add" });
          }
        }}
        size="xl"
        showNavigation={false}
        addFooterSeparator
        leftButton={footerButtons.leftButton}
        rightButton={footerButtons.rightButton}
      />
    </MultiPageSheet>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const EMPTY_STATE_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 50% 0%, rgba(0,0,0,0.04), transparent 60%)",
};

export function CapabilitiesSection({
  addedSkills,
  addedTools,
  knowledgeCount,
  onAdd,
  onRemoveSkill,
  onRemoveTool,
  onSaveConfiguration,
  onOpenKnowledge,
  knowledgeCards,
}: {
  addedSkills: AddedSkill[];
  addedTools: AddedTool[];
  knowledgeCount: number;
  onAdd: (skills: ManagedSkill[], tools: MockTool[]) => void;
  onRemoveSkill: (skillId: string) => void;
  onRemoveTool: (key: string) => void;
  onSaveConfiguration: (
    tool: MockTool,
    configuration: ToolConfiguration,
    existingKey: string | null
  ) => void;
  onOpenKnowledge: () => void;
  /** Knowledge cards rendered by the parent, since their sheet lives there. */
  knowledgeCards: React.ReactNode;
}) {
  const [sheetState, setSheetState] = useState<{
    open: boolean;
    page: SheetPage;
  }>({
    open: false,
    page: { id: "add" },
  });
  const [skillToRemove, setSkillToRemove] = useState<ManagedSkill | null>(null);

  const openSheet = (page: SheetPage) => setSheetState({ open: true, page });
  const hasItems = addedSkills.length + addedTools.length + knowledgeCount > 0;
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  const capabilitiesSummary = [
    addedTools.length ? plural(addedTools.length, "tool") : null,
    addedSkills.length ? plural(addedSkills.length, "skill") : null,
    knowledgeCount ? plural(knowledgeCount, "knowledge source") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const actionButtons = (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={ShapesPlus}
        label="Add capabilities"
        onClick={() => openSheet({ id: "add" })}
      />
      <Button
        size="sm"
        variant="outline"
        icon={BookOpen01}
        label="Add knowledge"
        onClick={onOpenKnowledge}
      />
    </>
  );

  return (
    <BuilderSection
      title="Capabilities and knowledge"
      collapsible
      defaultOpen={hasItems}
      summary={hasItems ? capabilitiesSummary : "Nothing added"}
      description={
        <>
          Add skills, tools, and knowledge to enhance your agent's abilities.
          Need help? Check our{" "}
          <Hoverable
            variant="highlight"
            href="https://docs.dust.tt/docs/skills"
            target="_blank"
          >
            guide
          </Hoverable>
          .
        </>
      }
      headerActions={actionButtons}
    >
      {hasItems ? (
        <CardGrid>
          {addedSkills.map(({ skill }) => (
            <ActionCard
              key={skill.id}
              icon={skill.icon}
              label={skill.name}
              description={skill.description}
              cardContainerClassName="h-28"
              canAdd={false}
              onClick={() => openSheet({ id: "skill", skill })}
              onRemove={() => {
                const isEditor = skill.editorIds.includes(mockUsers[0].id);
                if (
                  skill.availability === "editors" &&
                  !isEditor &&
                  !skill.isDustProvided
                ) {
                  setSkillToRemove(skill);
                } else {
                  onRemoveSkill(skill.id);
                }
              }}
            />
          ))}
          {addedTools.map((entry) => (
            <ActionCard
              key={entry.key}
              icon={entry.tool.icon}
              label={entry.configuration?.name ?? entry.tool.name}
              description={entry.tool.description}
              cardContainerClassName="h-28"
              canAdd={false}
              onClick={() =>
                entry.configuration
                  ? openSheet({
                      id: "configure",
                      tool: entry.tool,
                      existingKey: entry.key,
                      configuration: entry.configuration,
                    })
                  : openSheet({ id: "tool", tool: entry.tool })
              }
              onRemove={() => onRemoveTool(entry.key)}
            />
          ))}
          {knowledgeCards}
        </CardGrid>
      ) : (
        <EmptyCTA
          className="gap-3 p-6"
          styleProps={EMPTY_STATE_STYLE}
          message="Nothing added yet."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CAPABILITY_LOGO_STRIP.map((Logo, index) => (
                <div
                  key={index}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-background shadow-sm"
                >
                  <Icon visual={Logo} size="sm" />
                </div>
              ))}
            </div>
          }
        />
      )}
      <CapabilitiesSheet
        open={sheetState.open}
        onOpenChange={(open) => setSheetState((prev) => ({ ...prev, open }))}
        initialPage={sheetState.page}
        addedSkills={addedSkills}
        addedTools={addedTools}
        onAdd={onAdd}
        onSaveConfiguration={onSaveConfiguration}
      />
      <ConfirmDialog
        open={skillToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSkillToRemove(null);
          }
        }}
        title={skillToRemove ? `Remove ${skillToRemove.name}?` : ""}
        confirmLabel="Remove"
        confirmVariant="warning"
        onConfirm={() => {
          if (skillToRemove) {
            onRemoveSkill(skillToRemove.id);
          }
        }}
      >
        You will not be able to add this skill back because it is only
        accessible to the skill editors and you are not an editor.
      </ConfirmDialog>
    </BuilderSection>
  );
}
