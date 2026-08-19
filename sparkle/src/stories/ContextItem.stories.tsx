import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  DriveLogo,
  GithubLogo,
  NotionLogo,
  SlackLogo,
} from "@sparkle/logo/platforms";

import {
  Avatar,
  Button,
  Chip,
  ContextItem,
  Edit04,
  Folder,
  Icon,
  Robot,
  Settings01,
  SliderToggle,
  Trash01,
} from "../index_with_tw_base";

const meta = {
  title: "Lists/ContextItem",
  tags: ["a11y-issues"],
  component: ContextItem,
  parameters: {
    docs: {
      description: {
        component: `A rich list row for representing a resource, connection, or agent, with a leading **visual**, a **title**, optional **subElement** metadata, free-form children (descriptions, chips), and a trailing **action**. Rows can be made interactive with **onClick** and can reveal their **action** only on hover via **hoverAction**.

**When to use**
- To list connected platforms, data sources, agents, or settings entries that each carry a visual, metadata, and an action.

**Guidelines**
- Compose rows inside **ContextItem.List**, and use the **ContextItem.Visual**, **ContextItem.Description**, and **ContextItem.SectionHeader** subcomponents for consistent layout.
- Use **hoverAction** to keep rows clean and surface controls (e.g. Edit / Remove **Button**s) only on hover.
- For a denser settings layout with a title, description, and a single control, prefer **SettingsList.Row**.`,
      },
    },
  },
} satisfies Meta<typeof ContextItem>;

export default meta;
// Stories compose full ContextItem.List structures rather than a single row,
// so they are render-based and untyped against the row's own props.
type Story = StoryObj;

/**
 * The basic composition: clickable rows in a **ContextItem.List**, each with a
 * platform logo via **ContextItem.Visual** and a **ContextItem.Description**.
 * @summary Clickable list rows with logo visuals and descriptions.
 */
export const ConnectionsList: Story = {
  render: () => (
    <ContextItem.List>
      <ContextItem
        title="Notion"
        visual={<ContextItem.Visual visual={NotionLogo} />}
        onClick={fn()}
      >
        <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering” and “Team Life”." />
      </ContextItem>
      <ContextItem
        title="Drive"
        visual={<ContextItem.Visual visual={DriveLogo} />}
        onClick={fn()}
      >
        <ContextItem.Description description="Shared drives “Product” and “Design”." />
      </ContextItem>
    </ContextItem.List>
  ),
};

/**
 * Use **ContextItem.SectionHeader** to break a long list into titled groups,
 * each with its own description.
 * @summary Rows grouped under titled section headers.
 */
export const WithSectionHeaders: Story = {
  render: () => (
    <ContextItem.List>
      <ContextItem.SectionHeader
        title="Connected platforms"
        description="Data sources synced into this workspace."
      />
      <ContextItem
        title="Notion"
        visual={<ContextItem.Visual visual={NotionLogo} />}
      >
        <ContextItem.Description description="Teamspaces “General” and “Public”." />
      </ContextItem>
      <ContextItem.SectionHeader
        title="Agents"
        description="Agents available to this workspace."
      />
      <ContextItem
        title="@SalesFr"
        visual={
          <Avatar
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_4.jpg"
            size="sm"
          />
        }
      >
        <ContextItem.Description description="Answers sales questions for the French market." />
      </ContextItem>
    </ContextItem.List>
  ),
};

/**
 * Trailing controls: a hover-only Button group via **hoverAction**, a
 * **SliderToggle** to enable/disable a row, and a persistent Manage button.
 * @summary Hover-revealed buttons and toggle actions on rows.
 */
export const WithActions: Story = {
  render: () => (
    <ContextItem.List>
      <ContextItem
        title="Slack"
        visual={<ContextItem.Visual visual={SlackLogo} />}
        hoverAction
        action={
          <div className="flex gap-1">
            <Button icon={Trash01} variant="warning" label="Remove" />
            <Button variant="outline" label="Edit" size="sm" icon={Edit04} />
          </div>
        }
      >
        <ContextItem.Description description="Channels #support and #feedback." />
      </ContextItem>
      <ContextItem
        title="Github"
        action={<SliderToggle />}
        visual={<ContextItem.Visual visual={GithubLogo} />}
      >
        <ContextItem.Description description="Repositories dust-tt/dust and dust-tt/sparkle." />
      </ContextItem>
      <ContextItem
        title="@SalesFr"
        action={
          <Button
            variant="outline"
            label="Manage"
            size="sm"
            icon={Settings01}
          />
        }
        visual={
          <Avatar
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_4.jpg"
            size="sm"
          />
        }
      >
        <ContextItem.Description description="Answers sales questions for the French market." />
      </ContextItem>
    </ContextItem.List>
  ),
};

/**
 * Rich row content: **subElement** metadata next to the title, status
 * **Chip**s as free-form children, and a description below.
 * @summary Rows with subElement metadata, status chips, and descriptions.
 */
export const WithMetadata: Story = {
  render: () => (
    <ContextItem.List>
      <ContextItem
        title="docs.stripe.com-payments-payment-intents-verifying-status"
        subElement={
          <>
            Added by: Edouard Wautier
            <span className="h-3 w-0.5 bg-primary-500" />
            <div className="flex items-center gap-1">
              Used by: 3
              <Icon visual={Robot} size="xs" />
            </div>
          </>
        }
        visual={<Icon visual={Folder} size="md" />}
      >
        <div className="py-2">
          <Chip size="xs" label="Last Sync ~7 days ago" color="success" />
        </div>
        <ContextItem.Description description="Documentation on verifying the status of a payment intent." />
      </ContextItem>
      <ContextItem
        title="Github"
        subElement={<>By: Stan</>}
        visual={<ContextItem.Visual visual={GithubLogo} />}
      >
        <div className="py-2">
          <Chip label="Syncing…" color="info" size="sm" isBusy />
        </div>
        <ContextItem.Description description="Repositories dust-tt/dust and dust-tt/sparkle." />
      </ContextItem>
    </ContextItem.List>
  ),
};
