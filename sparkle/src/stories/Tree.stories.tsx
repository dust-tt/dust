import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { fn } from "storybook/test";

import {
  DriveLogo,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
} from "@sparkle/logo/platforms";

import {
  Button,
  Chip,
  DustLogo,
  File02,
  Folder,
  Settings01,
  Tree,
} from "../index_with_tw_base";

const meta = {
  title: "Data Display/Tree",
  tags: ["a11y-issues"],
  component: Tree,
  parameters: {
    docs: {
      description: {
        component: `A hierarchical, expandable list. **Tree** wraps a set of **Tree.Item** nodes, each taking a **label**, optional **visual** icon, and nested children. Items support a **type** (\`node\` / \`leaf\`), optional **checkbox** for multi-selection, per-item actions, and an \`isLoading\` state on a child **Tree** for lazy expansion.

**When to use**
- To browse nested structures such as folders, data sources, or document hierarchies.

**Guidelines**
- Provide a **visual** to distinguish node kinds (e.g. folders vs. leaves), and use \`type="leaf"\` for terminal items.
- For lazily loaded branches, render a child \`<Tree isLoading />\` until data arrives rather than blocking the whole tree.`,
      },
    },
  },
} satisfies Meta<typeof Tree>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// Local checkbox-selection state shared by the interactive stories.
function useCheckedFixture() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => {
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };
  return { checked, toggle };
}

const PLATFORMS = [
  { label: "Intercom", visual: IntercomLogo },
  { label: "Notion", visual: NotionLogo },
  { label: "Slack", visual: SlackLogo },
  { label: "Dust", visual: DustLogo },
] as const;

// Actions row used by the data-source display story.
const ConnectionActions = () => (
  <div className="flex flex-row items-center justify-center gap-3">
    <span className="text-sm text-muted-foreground">
      Managed by: Stanislas Polu
    </span>
    <Chip size="sm" color="success" label="Syncing (235)" />
    <Button label="Manage" icon={Settings01} variant="outline" size="sm" />
  </div>
);

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * A basic folder hierarchy: expandable nodes with nested **Tree** children,
 * terminal `type="leaf"` items, a **Tree.Empty** placeholder, and
 * `defaultCollapsed` controlling the initial expansion of each branch.
 * @summary Expandable folder hierarchy.
 */
export const Default: Story = {
  render: () => (
    <Tree>
      <Tree.Item label="Reports" visual={Folder} defaultCollapsed={false}>
        <Tree>
          <Tree.Item label="Q1 summary" type="leaf" visual={File02} />
          <Tree.Item label="Q2 summary" type="leaf" visual={File02} />
          <Tree.Empty label="(+ 4 items)" />
        </Tree>
      </Tree.Item>
      <Tree.Item label="Archives" visual={Folder} defaultCollapsed={true}>
        <Tree>
          <Tree.Item label="2023" type="leaf" visual={File02} />
          <Tree.Item label="2024" type="leaf" visual={File02} />
        </Tree>
      </Tree.Item>
      <Tree.Item label="Drafts" visual={Folder}>
        <Tree>
          <Tree.Empty label="No documents" onItemClick={fn()} />
        </Tree>
      </Tree.Item>
      <Tree.Item label="Readme" type="leaf" visual={File02} />
    </Tree>
  ),
};

/**
 * A single-level list of `type="item"` rows with checkboxes — no expansion
 * affordance. The first row shows the `"partial"` checked state used when
 * only some descendants of a group are selected.
 * @summary Flat selectable list without nesting.
 */
export const FlatList: Story = {
  render: function Render() {
    const { checked, toggle } = useCheckedFixture();
    return (
      <Tree>
        <Tree.Item
          label="Item 1"
          type="item"
          visual={Folder}
          checkbox={{
            checked: "partial",
            onCheckedChange: fn(),
          }}
        />
        {["Item 2", "Item 3", "Item 4", "Item 5"].map((label) => (
          <Tree.Item
            key={label}
            label={label}
            type="item"
            visual={Folder}
            checkbox={{
              checked: checked[label],
              onCheckedChange: () => {
                toggle(label);
              },
            }}
          />
        ))}
      </Tree>
    );
  },
};

/**
 * Any icon component works as a **visual** — here platform logos distinguish
 * connected services instead of the generic folder/file icons.
 * @summary Platform logos as item visuals.
 */
export const CustomVisuals: Story = {
  render: function Render() {
    const { checked, toggle } = useCheckedFixture();
    return (
      <Tree>
        {PLATFORMS.map(({ label, visual }) => (
          <Tree.Item
            key={label}
            label={label}
            type="item"
            visual={visual}
            checkbox={{
              checked: checked[label],
              onCheckedChange: () => {
                toggle(label);
              },
            }}
          />
        ))}
      </Tree>
    );
  },
};

/**
 * Multi-selection inside a hierarchy: leaf items carry a **checkbox**, and a
 * parent reflects a mixed selection with the `"partial"` checked state.
 * @summary Nested checkbox selection with partial state.
 */
export const CheckboxSelection: Story = {
  render: function Render() {
    const { checked, toggle } = useCheckedFixture();
    return (
      <Tree>
        <Tree.Item
          label="Projects"
          visual={Folder}
          defaultCollapsed={false}
          checkbox={{
            checked: "partial",
            onCheckedChange: fn(),
          }}
        >
          <Tree>
            {["Roadmap", "Specs", "Retros"].map((label) => (
              <Tree.Item
                key={label}
                label={label}
                type="leaf"
                checkbox={{
                  checked: checked[label],
                  onCheckedChange: () => {
                    toggle(label);
                  },
                }}
              />
            ))}
          </Tree>
        </Tree.Item>
      </Tree>
    );
  },
};

/**
 * Lazily loaded branches: render a child \`<Tree isLoading />\` while the
 * branch's content is being fetched. The spinner can stand alone or follow
 * items that already arrived.
 * @summary Loading spinner for lazily fetched branches.
 */
export const LazyLoading: Story = {
  render: () => (
    <Tree>
      <Tree.Item label="Loading branch" visual={Folder}>
        <Tree isLoading />
      </Tree.Item>
      <Tree.Item
        label="Loading more, with existing items"
        visual={Folder}
        defaultCollapsed={false}
      >
        <Tree isLoading>
          <Tree.Item label="Already fetched" type="leaf" visual={File02} />
        </Tree>
      </Tree.Item>
    </Tree>
  ),
};

/**
 * The `navigator` variant styles the tree as a sidebar navigation: rows are
 * clickable via **onItemClick**, the current location is marked with
 * **isSelected**, and long labels truncate within the container width.
 * @summary Sidebar navigation styling with a selected row.
 */
export const NavigationBar: Story = {
  render: () => (
    <div className="max-w-xs">
      <Tree variant="navigator">
        <Tree.Item
          label="Intercom  github.com-apache-incubator-devlake-tree-main-backend"
          visual={IntercomLogo}
          onItemClick={fn()}
          isSelected={true}
        >
          <Tree variant="navigator">
            <Tree.Item
              label="Conversations with a very very very very long title"
              visual={Folder}
            >
              <Tree variant="navigator">
                <Tree.Item
                  label="Tickets with a very very very very very long title"
                  visual={Folder}
                  type="leaf"
                />
                <Tree.Item label="Help center" visual={Folder} />
                <Tree.Item label="News" visual={Folder} />
              </Tree>
            </Tree.Item>
            <Tree.Item label="Teams" visual={Folder}>
              <Tree variant="navigator">
                <Tree.Item label="Support" visual={Folder} />
                <Tree.Item label="Sales" visual={Folder} />
              </Tree>
            </Tree.Item>
          </Tree>
        </Tree.Item>
        <Tree.Item label="Notion" visual={NotionLogo} />
        <Tree.Item label="Slack" visual={SlackLogo} />
        <Tree.Item label="Dust" visual={DustLogo} />
      </Tree>
    </div>
  ),
};

/**
 * Read-only management view of connected data sources: each connection row
 * keeps its **actions** (sync status **Chip** and a Manage **Button**)
 * permanently visible via `areActionsFading={false}`.
 * @summary Data-source rows with permanent status and actions.
 */
export const DataSourceDisplay: Story = {
  render: () => (
    <div className="w-full">
      <Tree>
        <Tree.Item
          label="Intercom"
          visual={IntercomLogo}
          areActionsFading={false}
          actions={<ConnectionActions />}
        />
        <Tree.Item
          label="Slack"
          defaultCollapsed={true}
          visual={SlackLogo}
          areActionsFading={false}
          actions={<ConnectionActions />}
        />
        <Tree.Item
          label="Notion"
          visual={NotionLogo}
          areActionsFading={false}
          actions={<ConnectionActions />}
          defaultCollapsed={false}
        >
          <Tree>
            <Tree.Item label="Product wiki" />
            <Tree.Item label="Meeting notes" />
            <Tree.Item label="OKRs" />
          </Tree>
        </Tree.Item>
        <Tree.Item
          label="Google Drive"
          visual={DriveLogo}
          areActionsFading={false}
          defaultCollapsed={true}
          actions={<ConnectionActions />}
        />
      </Tree>
    </div>
  ),
};

/**
 * Picking content to sync from connected data sources: every connection and
 * nested folder carries a **checkbox**, so whole sources or individual
 * branches can be selected.
 * @summary Selecting data sources and folders via checkboxes.
 */
export const DataSourceSelection: Story = {
  render: function Render() {
    const { checked, toggle } = useCheckedFixture();
    return (
      <Tree>
        <Tree.Item
          label="Intercom"
          visual={IntercomLogo}
          checkbox={{
            checked: checked["Intercom"],
            onCheckedChange: () => {
              toggle("Intercom");
            },
          }}
        />
        <Tree.Item
          label="Slack"
          defaultCollapsed={true}
          visual={SlackLogo}
          checkbox={{
            checked: checked["Slack"],
            onCheckedChange: () => {
              toggle("Slack");
            },
          }}
        />
        <Tree.Item
          label="Notion"
          visual={NotionLogo}
          checkbox={{
            checked: checked["Notion"],
            onCheckedChange: () => {
              toggle("Notion");
            },
          }}
          defaultCollapsed={false}
        >
          <Tree>
            {["Product wiki", "Meeting notes", "OKRs"].map((label) => (
              <Tree.Item
                key={label}
                label={label}
                checkbox={{
                  checked: checked[label],
                  onCheckedChange: () => {
                    toggle(label);
                  },
                }}
              />
            ))}
          </Tree>
        </Tree.Item>
        <Tree.Item
          label="Google Drive"
          visual={DriveLogo}
          defaultCollapsed={true}
          checkbox={{
            checked: checked["Google Drive"],
            onCheckedChange: () => {
              toggle("Google Drive");
            },
          }}
        />
      </Tree>
    );
  },
};

/**
 * The `isBoxed` prop wraps the tree in a bordered, contained surface — use it
 * when the tree sits directly on the page rather than inside a panel.
 * @summary Boxed container styling.
 */
export const Boxed: Story = {
  render: () => (
    <Tree isBoxed>
      <Tree.Item label="Reports" visual={Folder} defaultCollapsed={false}>
        <Tree>
          <Tree.Item label="Q1 summary" type="leaf" visual={File02} />
          <Tree.Item label="Q2 summary" type="leaf" visual={File02} />
        </Tree>
      </Tree.Item>
      <Tree.Item label="Archives" visual={Folder} defaultCollapsed={true}>
        <Tree>
          <Tree.Item label="2023" type="leaf" visual={File02} />
        </Tree>
      </Tree.Item>
      <Tree.Item label="Readme" type="leaf" visual={File02} />
    </Tree>
  ),
};
