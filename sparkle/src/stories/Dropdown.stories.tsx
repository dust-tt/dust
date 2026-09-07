import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Spinner } from "@sparkle/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuFilters,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuStaticItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
} from "@sparkle/components/Dropdown";
import {
  AnthropicLogo,
  DriveLogo,
  GithubLogo,
  MistralLogo,
  NotionLogo,
  OpenaiLogo,
  SlackLogo,
} from "@sparkle/logo/platforms";

import {
  ActionCommand1Icon,
  ArrowDown,
  Upload01,
  Attachment01,
  Avatar,
  Button,
  MessagePlusCircle,
  Chip,
  Download01,
  Settings01,
  File02,
  DoubleIcon,
  Folder,
  ThumbsDown,
  ThumbsUp,
  Icon,
  LogOut01,
  MagicWand02,
  SearchMd,
  Plus,
  Robot,
  SearchDropdownMenu,
  Users01,
  User01,
} from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/Dropdown",
  component: DropdownMenu,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A menu of actions or options revealed from a trigger — Sparkle's equivalent of an action or overflow menu. Built on Radix DropdownMenu, it composes from **DropdownMenuTrigger** and **DropdownMenuContent** and supports items with leading icons and keyboard shortcuts, checkbox and radio items, grouping with labels and separators, submenus, a searchbar/filter, and tag lists.

**When to use**
- To expose secondary or overflow actions tied to a control without cluttering the page.
- To pick one value from a longer list than a **RadioGroup** comfortably shows.

**Guidelines**
- The trigger should be a button — wrap it with \`<DropdownMenuTrigger asChild>\`.
- Keep item labels short and action-first; group related items and use a separator before destructive actions.
- Use **DropdownMenuCheckboxItem** / **DropdownMenuRadioItem** to reflect selection state instead of plain items.
- For a large, searchable dataset, use **DropdownMenuSearchbar** rather than an unbounded list.`,
      },
    },
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A basic account menu: a label, avatar items with descriptions (one
 * truncated via `truncateText`), and plain action items.
 * @summary Basic menu with label, avatar items, and actions.
 */
export const Default: Story = {
  render: () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent className="max-w-[300px]">
          <DropdownMenuLabel label="My Account" />
          <DropdownMenuItem
            icon={() => (
              <Avatar
                size="xs"
                visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
              />
            )}
            label="@hello"
            onClick={fn()}
            description="A long description that is allowed to wrap onto several lines because this item does not set truncateText, so the full text stays visible."
          />
          <DropdownMenuItem
            truncateText
            icon={() => (
              <Avatar
                size="xs"
                visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
              />
            )}
            label="@helloWorld"
            onClick={fn()}
            description="A long description that gets truncated with an ellipsis because this item sets truncateText."
          />
          <DropdownMenuItem label="Profile" />
          <DropdownMenuItem label="Billing" />
          <DropdownMenuItem label="Team" />
          <DropdownMenuItem label="Subscription" />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * A full account menu combining groups with labels, separators, an item with
 * an `endComponent` button, a portal-rendered submenu, a disabled item, and a
 * `warning` variant item for the destructive action.
 * @summary Grouped menu with submenus and a destructive item.
 */
export const GroupedWithSubmenus: Story = {
  render: () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel label="My Account" />
          <DropdownMenuGroup>
            <DropdownMenuItem
              icon={User01}
              label="Profile"
              endComponent={
                <Button size="icon" icon={Upload01} variant="ghost" />
              }
            />
            <DropdownMenuItem icon={ArrowDown} label="Billing" />
            <DropdownMenuItem icon={Settings01} label="Settings" />
            <DropdownMenuItem icon={User01} label="Keyboard shortcuts" />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel label="Team" />
            <DropdownMenuItem icon={User01} label="Members" />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={User01} label="Invite users" />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem icon={MagicWand02} label="Email" />
                  <DropdownMenuItem icon={MessagePlusCircle} label="Message" />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={User01} label="More options" />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuItem icon={Users01} label="New Team" />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={GithubLogo} label="GitHub" />
          <DropdownMenuItem icon={User01} label="Support" />
          <DropdownMenuItem icon={Download01} label="API" disabled />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={LogOut01}
            label="Log out"
            variant="warning"
            href="/api/auth/logout"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * Interaction test: opens a submenu that hosts an auto-focused searchbar and
 * asserts arrow-key focus travels from the searchbar into the items and back.
 * Its value is in the `play` function, not the visual.
 * @summary Keyboard navigation test for searchable submenus.
 */
export const SearchableSubmenuKeyboardNavigation: Story = {
  tags: ["!manifest"],
  render: () => {
    const [search, setSearch] = useState("");

    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Capabilities" />
            <DropdownMenuSubContent
              dropdownHeaders={
                <DropdownMenuSearchbar
                  autoFocus
                  name="search-capabilities"
                  placeholder="Search capabilities"
                  value={search}
                  onChange={setSearch}
                />
              }
            >
              <DropdownMenuItem label="First capability" />
              <DropdownMenuItem label="Second capability" />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem label="Root action" />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const page = within(canvasElement.ownerDocument.body);
    const submenuTrigger = page.getByRole("menuitem", {
      name: "Capabilities",
    });
    await waitFor(() => expect(submenuTrigger).toHaveFocus());

    await userEvent.keyboard("{ArrowRight}");
    const searchInput = page.getByPlaceholderText("Search capabilities");
    await waitFor(() => expect(searchInput).toHaveFocus());

    await userEvent.keyboard("{ArrowDown}");
    await expect(
      page.getByRole("menuitem", { name: "First capability" })
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect(
      page.getByRole("menuitem", { name: "Second capability" })
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    await expect(
      page.getByRole("menuitem", { name: "First capability" })
    ).toHaveFocus();
  },
};

/**
 * Items displaying their keyboard shortcut on the trailing edge via
 * **DropdownMenuShortcut** passed as `endComponent`.
 * @summary Menu items with keyboard shortcut hints.
 */
export const WithShortcuts: Story = {
  render: () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Quick Actions" variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel label="Create" />
          <DropdownMenuItem
            icon={File02}
            label="New File"
            endComponent={<DropdownMenuShortcut shortcut="cmd+n" />}
          />
          <DropdownMenuItem
            icon={Folder}
            label="New Folder"
            endComponent={<DropdownMenuShortcut shortcut="cmd+shift+n" />}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Actions" />
          <DropdownMenuItem
            icon={ActionCommand1Icon}
            label="Command Palette"
            endComponent={<DropdownMenuShortcut shortcut="cmd+shift+p" />}
          />
          <DropdownMenuItem
            icon={Download01}
            label="Download"
            endComponent={<DropdownMenuShortcut shortcut="cmd+shift+d" />}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

type Checked = DropdownMenuCheckboxItemProps["checked"];

/**
 * Multi-select settings via **DropdownMenuCheckboxItem**: each item holds its
 * own checked state, supports a description, and can be disabled.
 * @summary Checkbox items for multi-select options.
 */
export const WithCheckboxes: Story = {
  render: () => {
    const [showStatusBar, setShowStatusBar] = React.useState<Checked>(true);
    const [showActivityBar, setShowActivityBar] =
      React.useState<Checked>(false);
    const [showPanel, setShowPanel] = React.useState<Checked>(false);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel label="Interface Settings" />
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showStatusBar}
            onCheckedChange={setShowStatusBar}
            label="Status Bar"
            description="Show application status and progress indicators"
            truncateText
          />
          <DropdownMenuCheckboxItem
            checked={showActivityBar}
            onCheckedChange={setShowActivityBar}
            label="Activity Bar"
            description="Display sidebar with quick access to tools"
            truncateText
            disabled
          />
          <DropdownMenuCheckboxItem
            checked={showPanel}
            onCheckedChange={setShowPanel}
            label="Panel"
            description="Bottom panel for terminal and debug output"
            truncateText
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * Single-choice selection via **DropdownMenuRadioGroup** /
 * **DropdownMenuRadioItem** — the group's `value` reflects the current
 * choice and `onValueChange` replaces it.
 * @summary Radio group for single-choice selection.
 */
export const WithRadioGroup: Story = {
  render: () => {
    const [position, setPosition] = React.useState("bottom");

    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel label="Panel Position" />
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

interface ModelConfig {
  name: string;
  description: string;
  icon: React.ComponentType;
}

const bestPerformingModels: ModelConfig[] = [
  {
    name: "GPT4-o",
    description: "OpenAI's most advanced model.",
    icon: OpenaiLogo,
  },
  {
    name: "Claude 3.5 Sonnet",
    description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
    icon: AnthropicLogo,
  },
  {
    name: "Mistral Large",
    description: "Mistral's `large 2` model (128k context).",
    icon: MistralLogo,
  },
];

/**
 * A value-picker pattern: the trigger button shows the current value, and
 * radio items with icons and descriptions both select it and reflect the
 * active choice — prefer this over plain items, which give no selected-state
 * affordance.
 * @summary Trigger-label value picker with radio items.
 */
export const ModelSelector: Story = {
  render: () => {
    const [selectedModel, setSelectedModel] = React.useState<string>("GPT4-o");

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label={selectedModel} variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={selectedModel}
            onValueChange={(value) => setSelectedModel(value)}
          >
            <DropdownMenuLabel label="Best performing models" />
            {bestPerformingModels.map((modelConfig) => (
              <DropdownMenuRadioItem
                key={modelConfig.name}
                label={modelConfig.name}
                icon={modelConfig.icon}
                description={modelConfig.description}
                value={modelConfig.name}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

const searchableItems = [
  { name: "Business Intelligence Dashboard", secondaryIcon: DriveLogo },
  { name: "Cloud Infrastructure Setup", secondaryIcon: NotionLogo },
  { name: "Data Migration Service", secondaryIcon: SlackLogo },
  { name: "Enterprise Resource Planning", secondaryIcon: DriveLogo },
  { name: "Financial Analytics Platform", secondaryIcon: NotionLogo },
  { name: "Knowledge Base Integration", secondaryIcon: SlackLogo },
  { name: "Machine Learning Pipeline", secondaryIcon: DriveLogo },
  { name: "Workflow Automation System", secondaryIcon: NotionLogo },
] as const;

/**
 * A search-first menu: **DropdownMenuSearchbar** is pinned in
 * `dropdownHeaders` with an action button, an empty state prompts for a
 * query, and results render with a **DoubleIcon** pairing the content glyph
 * with its source logo.
 * @summary Pinned searchbar with empty state and results.
 */
export const WithSearchbarHeader: Story = {
  render: () => {
    const [searchText, setSearchText] = React.useState("");
    const [selectedItem, setSelectedItem] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState(false);

    const filteredItems = searchableItems.filter((item) =>
      item.name.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            label={selectedItem || "Attach"}
            icon={Attachment01}
            variant="outline"
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[380px]"
          dropdownHeaders={
            <DropdownMenuSearchbar
              autoFocus
              value={searchText}
              onChange={setSearchText}
              name="search"
              placeholder="Search in Dust"
              button={<Button icon={Upload01} label="Upload File" />}
            />
          }
        >
          <DropdownMenuSeparator />
          {searchText ? (
            filteredItems.map((item) => (
              <DropdownMenuItem
                key={item.name}
                label={item.name}
                description="Company Space/Notion"
                icon={
                  <DoubleIcon
                    size="lg"
                    mainIcon={File02}
                    secondaryIcon={item.secondaryIcon}
                  />
                }
                onClick={() => {
                  setSelectedItem(item.name);
                  setSearchText("");
                }}
                truncateText
              />
            ))
          ) : (
            <div className="flex h-full w-full items-center justify-center py-8">
              <div className="flex flex-col items-center justify-center gap-0 text-center text-base font-semibold text-primary-400">
                <Icon visual={SearchMd} size="sm" />
                Search in Dust
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

const agents = [
  {
    name: "Research Assistant",
    description: "Academic research and paper analysis",
    emoji: "🔬",
    backgroundColor: "bg-blue-200",
  },
  {
    name: "Code Companion",
    description: "Pair programming and code review",
    emoji: "💻",
    backgroundColor: "bg-purple-200",
  },
  {
    name: "Data Analyst",
    description: "Data visualization and insights",
    emoji: "📊",
    backgroundColor: "bg-green-200",
  },
  {
    name: "Content Writer",
    description: "Blog posts and marketing copy",
    emoji: "✍️",
    backgroundColor: "bg-yellow-200",
  },
  {
    name: "Customer Support",
    description: "24/7 customer service automation",
    emoji: "🤝",
    backgroundColor: "bg-pink-200",
  },
  {
    name: "Legal Assistant",
    description: "Contract review and legal research",
    emoji: "⚖️",
    backgroundColor: "bg-red-200",
  },
  {
    name: "Design Assistant",
    description: "UI/UX design and prototyping",
    emoji: "🎨",
    backgroundColor: "bg-indigo-200",
  },
  {
    name: "Financial Advisor",
    description: "Investment analysis and planning",
    emoji: "💰",
    backgroundColor: "bg-emerald-200",
  },
] as const;

/**
 * A fixed-height, scrollable picker of rich entities: avatar items with
 * descriptions under a pinned searchbar whose `button` offers a create
 * action. Constrain the content (h-96 here) so long lists scroll.
 * @summary Fixed-height scrollable entity picker.
 */
export const ScrollableItemPicker: Story = {
  render: () => {
    const [searchText, setSearchText] = React.useState("");
    const [open, setOpen] = React.useState(false);

    const filteredAgents = agents.filter((agent) =>
      agent.name.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button icon={Robot} variant="outline" size="sm" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="h-96 w-[380px]"
          dropdownHeaders={
            <DropdownMenuSearchbar
              autoFocus
              name="search"
              value={searchText}
              onChange={setSearchText}
              placeholder="Search Agents"
              button={<Button icon={Plus} label="Create" />}
            />
          }
        >
          <DropdownMenuSeparator />
          {filteredAgents.map((agent) => (
            <DropdownMenuItem
              key={agent.name}
              label={agent.name}
              description={agent.description}
              icon={() => (
                <Avatar
                  size="sm"
                  emoji={agent.emoji}
                  backgroundColor={agent.backgroundColor}
                />
              )}
              onClick={() => {
                setSearchText("");
              }}
              truncateText
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * Read-only rows via **DropdownMenuStaticItem** — label/value pairs or custom
 * children that display information without being actionable, mixed with
 * regular action items.
 * @summary Non-interactive label/value rows.
 */
export const WithStaticItems: Story = {
  render: () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="System Status" variant="outline" size="sm" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[250px]">
          <DropdownMenuLabel label="System Metrics" />
          <DropdownMenuStaticItem label="CPU Usage" value="45%" />
          <DropdownMenuStaticItem label="Memory" value="2.3GB/8GB" />
          <DropdownMenuStaticItem label="Disk Space">
            <span className="flex items-center gap-2 text-muted-foreground">
              3
              <Icon
                size="xs"
                className="text-muted-foreground"
                visual={ThumbsUp}
              />
              1
              <Icon
                size="xs"
                className="text-muted-foreground"
                visual={ThumbsDown}
              />
            </span>
          </DropdownMenuStaticItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Actions" />
          <DropdownMenuItem
            icon={Settings01}
            label="System Settings"
            onClick={fn()}
          />
          <DropdownMenuItem
            icon={Download01}
            label="Download Report"
            onClick={fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * The **SearchDropdownMenu** convenience wrapper: it owns the trigger and
 * searchbar chrome, while the consumer filters and renders the items from
 * the controlled `searchInputValue`.
 * @summary SearchDropdownMenu wrapper with filtered items.
 */
export const WithSearchFilter: Story = {
  render: () => {
    const [searchInputValue, setSearchInputValue] = React.useState("");

    const items = ["Profile", "Billing", "Team", "Subscription"];

    const filteredItems = items.filter((item) =>
      item.toLowerCase().includes(searchInputValue.toLowerCase())
    );

    return (
      <SearchDropdownMenu
        searchInputValue={searchInputValue}
        setSearchInputValue={setSearchInputValue}
      >
        {filteredItems.map((item) => (
          <DropdownMenuItem key={item} label={item} onClick={fn()} />
        ))}
      </SearchDropdownMenu>
    );
  },
};

/**
 * Removable tag pills inside a menu via **DropdownMenuTagList** /
 * **DropdownMenuTagItem**, with an async add action showing a loading
 * button. The **Chip** row below mirrors the same state to show removal
 * stays in sync.
 * @summary Tag list with removable items and async add.
 */
export const WithTags: Story = {
  render: () => {
    const [tags, setTags] = useState([
      "react",
      "typescript",
      "ui",
      "design-system",
    ]);
    const [nextTagId, setNextTagId] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const handleRemoveTag = (tagToRemove: string) => {
      setTags(tags.filter((tag) => tag !== tagToRemove));
    };

    const handleAddTag = () => {
      setIsLoading(true);

      // Simulate API call delay
      setTimeout(() => {
        setTags((prevTags) => [...prevTags, `tag-${nextTagId}`]);
        setNextTagId((prevId) => prevId + 1);
        setIsLoading(false);
      }, 1500);
    };

    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                label="Select Tags"
                icon={Plus}
                size="sm"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80">
              <DropdownMenuLabel label="Available Tags" />
              <DropdownMenuSeparator />
              <DropdownMenuTagList>
                {tags.map((tag) => (
                  <DropdownMenuTagItem
                    key={tag}
                    label={tag}
                    color="highlight"
                    onRemove={() => handleRemoveTag(tag)}
                    onClick={fn()}
                  />
                ))}
              </DropdownMenuTagList>

              <DropdownMenuSeparator />
              <div className="p-2">
                <Button
                  label={isLoading ? "Adding..." : "Add Tag"}
                  onClick={handleAddTag}
                  className="w-full"
                  size="sm"
                  disabled={isLoading}
                  icon={isLoading ? () => <Spinner size="xs" /> : undefined}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border p-4">
          {tags.map((tag) => (
            <div key={tag} className="inline-flex">
              <Chip
                label={tag}
                color="highlight"
                size="xs"
                onRemove={() => handleRemoveTag(tag)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  },
};

/**
 * Category filter pills pinned in `dropdownHeaders` via
 * **DropdownMenuFilters**, combined with a searchbar — selecting a pill
 * narrows the items before the text search applies.
 * @summary Header filter pills combined with search.
 */
export const WithFilters: Story = {
  render: () => {
    const [selectedFilter, setSelectedFilter] = useState<string | null>("all");
    const [searchText, setSearchText] = useState("");

    const filters = [
      { label: "All", value: "all" },
      { label: "Documents", value: "documents" },
      { label: "Images", value: "images" },
      { label: "Videos", value: "videos" },
    ];

    const allItems = [
      { name: "Project Proposal.pdf", type: "documents", icon: File02 },
      { name: "Q4 Report.docx", type: "documents", icon: File02 },
      { name: "Team Photo.jpg", type: "images", icon: Folder },
      { name: "Logo Design.png", type: "images", icon: Folder },
      { name: "Product Demo.mp4", type: "videos", icon: Folder },
      { name: "Tutorial.mov", type: "videos", icon: Folder },
      { name: "Budget 2024.xlsx", type: "documents", icon: File02 },
      { name: "Banner.svg", type: "images", icon: Folder },
    ];

    const filteredItems =
      selectedFilter === "all"
        ? allItems
        : allItems.filter((item) => item.type === selectedFilter);

    const searchFilteredItems = filteredItems.filter((item) =>
      item.name.includes(searchText)
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={`Files (${filteredItems.length})`}
            icon={Folder}
            variant="outline"
            size="sm"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[320px]"
          dropdownHeaders={
            <>
              <DropdownMenuSearchbar
                value={searchText}
                onChange={setSearchText}
                name="search"
              />
              <DropdownMenuFilters
                filters={filters}
                selectedValues={selectedFilter ? [selectedFilter] : []}
                onSelectFilter={setSelectedFilter}
              />
            </>
          }
        >
          <DropdownMenuSeparator />
          {searchFilteredItems.length > 0 ? (
            searchFilteredItems.map((item) => (
              <DropdownMenuItem
                key={item.name}
                label={item.name}
                icon={item.icon}
                onClick={fn()}
              />
            ))
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No items found
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * Rich hover tooltips on menu items via **DropdownTooltipTrigger**: wrap an
 * item to attach a `description` and optional `media` panel, positioned with
 * `side` / `sideOffset` (it adapts automatically when space runs out). Also
 * works on disabled items to explain why they are unavailable.
 * @summary Rich tooltips attached to menu items.
 */
export const WithTooltips: Story = {
  render: () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Data Actions" variant="outline" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuItem label="View Report" />
          <DropdownTooltipTrigger
            description="Export your data in various formats. Choose from CSV, JSON, or PDF depending on your needs."
            media={
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <Download01 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-green-800">
                    Export Status
                  </h4>
                  <p className="text-xs text-green-600">Ready to export</p>
                </div>
              </div>
            }
            side="right"
            sideOffset={8}
          >
            <DropdownMenuItem icon={Download01} label="Export Data" />
          </DropdownTooltipTrigger>
          <DropdownTooltipTrigger
            description="This feature is disabled because you need to configure settings first."
            side="right"
            sideOffset={8}
          >
            <DropdownMenuItem label="Save Draft" icon={Attachment01} disabled />
          </DropdownTooltipTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};
