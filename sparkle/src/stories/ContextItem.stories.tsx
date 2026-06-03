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
  Settings01V2,
  ContextItem,
  FolderV2,
  Icon,
  Edit04V2,
  RobotV2,
  SliderToggle,
  Trash01V2,
} from "../index_with_tw_base";

const meta = {
  title: "List/ContextItem",
  component: ContextItem,
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
            <span className="s-h-3 s-w-0.5 s-bg-primary-500" />
            <div className="s-flex s-items-center s-gap-1">
              Used by: 3
              <Icon visual={RobotV2} size="xs" />
            </div>
          </>
        }
        visual={<Icon visual={FolderV2} size="md" />}
      >
        <div className="s-py-2">
          <Chip size="xs" label="Last Sync ~7 days ago" color="green" />
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
          <div className="s-flex s-gap-1">
            <Button icon={Trash01V2} variant="warning" label="Remove" />
            <Button variant="outline" label="Edit" size="sm" icon={Edit04V2} />
          </div>
        }
      >
        <ContextItem.Description description="Hello you" />
      </ContextItem>
      <ContextItem
        title="Github"
        subElement={<>By: Stan</>}
        action={<SliderToggle size="xs" />}
        visual={<ContextItem.Visual visual={GithubLogo} />}
      >
        <>
          <div className="s-py-2">
            <Chip label="Syncing…" color="info" size="sm" isBusy />
          </div>
          <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
        </>
      </ContextItem>
      <ContextItem
        title="@Gpt4"
        action={<SliderToggle size="xs" />}
        visual={
          <Avatar
            visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            size="sm"
          />
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
            icon={Settings01V2}
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
            icon={Settings01V2}
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
