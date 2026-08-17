import type { Meta } from "@storybook/react";
import React from "react";

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
  Settings01,
  ContextItem,
  Folder,
  Icon,
  Edit04,
  Robot,
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

export const ListItemExample = () => (
  <div>
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
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
      <ContextItem.SectionHeader
        title="Connected platforms"
        description="Platforms connected"
      />
      <ContextItem
        title="Notion"
        visual={<ContextItem.Visual visual={NotionLogo} />}
        onClick={() => console.log("clicked item")}
      >
        <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
      </ContextItem>
      <ContextItem
        title="Drive"
        visual={<ContextItem.Visual visual={DriveLogo} />}
        onClick={() => console.log("clicked")}
      >
        <ContextItem.Description description="Hello you" />
      </ContextItem>

      <ContextItem.SectionHeader
        title="Connected platforms"
        description="Platforms connected"
      />
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
        <ContextItem.Description description="Hello you" />
      </ContextItem>
      <ContextItem
        title="Github"
        subElement={<>By: Stan</>}
        action={<SliderToggle />}
        visual={<ContextItem.Visual visual={GithubLogo} />}
      >
        <>
          <div className="py-2">
            <Chip label="Syncing…" color="info" size="sm" isBusy />
          </div>
          <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
        </>
      </ContextItem>
      <ContextItem
        title="@Gpt4"
        action={<SliderToggle />}
        visual={
          <Avatar visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png" />
        }
      >
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
      <ContextItem
        title="@SalesFr"
        subElement={<>By: Edouard Wautier, Amira Hadad</>}
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
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
      <ContextItem
        title="@SupportFr"
        subElement={<>By: Edouard Wautier, Amira Hadad</>}
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
            visual="https://dust.tt/static/droidavatar/Droid_Pink_4.jpg"
            size="sm"
          />
        }
      >
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
      {undefined}
    </ContextItem.List>
  </div>
);
