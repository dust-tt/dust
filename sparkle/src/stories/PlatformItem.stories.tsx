import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Drive, Github, Notion, Slack } from "@sparkle/logo/platforms";

import {
  Avatar,
  Button,
  Chip,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  PlatformItem,
  SliderToggle,
  TrashIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Molecule/PlatformItem",
  component: PlatformItem,
} satisfies Meta<typeof PlatformItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListItemExample = () => (
  <div>
    <PlatformItem.List>
      <PlatformItem
        title="Notion"
        visual={<PlatformItem.Visual visual={Notion} />}
        action={
          <Button
            variant="primary"
            label="Activate"
            size="sm"
            icon={CloudArrowDownIcon}
          />
        }
      >
        <PlatformItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
      </PlatformItem>
      <PlatformItem
        title="Drive"
        visual={<PlatformItem.Visual visual={Drive} />}
        action={
          <Button
            variant="secondary"
            label="Manage"
            size="sm"
            icon={Cog6ToothIcon}
          />
        }
      >
        <PlatformItem.Description description="Hello you" />
      </PlatformItem>
      <PlatformItem
        title="Slack"
        visual={<PlatformItem.Visual visual={Slack} />}
        action={
          <Button.List>
            <Button
              icon={TrashIcon}
              variant="secondaryWarning"
              label="Remove"
              labelVisible={false}
            />
            <Button
              variant="secondary"
              label="Edit"
              size="sm"
              icon={PencilSquareIcon}
            />
          </Button.List>
        }
      >
        <PlatformItem.Description description="Hello you" />
      </PlatformItem>
      <PlatformItem
        title="Github"
        visual={<PlatformItem.Visual visual={Github} />}
      >
        <>
          <div className="s-pb-2">
            <Chip label="Syncing…" color="amber" size="sm" isBusy />
          </div>
          <PlatformItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
        </>
      </PlatformItem>
      <PlatformItem
        title="@Gpt4"
        action={<SliderToggle size="md" />}
        visual={
          <Avatar
            visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            size="md"
          />
        }
      >
        <PlatformItem.Description description="Lats, pricing, history of contacts, contact message" />
      </PlatformItem>
      <PlatformItem
        title="@SalesFr"
        action={
          <Button
            variant="secondary"
            label="Manage"
            size="sm"
            icon={Cog6ToothIcon}
          />
        }
        visual={
          <Avatar
            visual="https://dust.tt/static/droidavatar/Droid_Indigo_4.jpg"
            size="md"
          />
        }
      >
        <PlatformItem.Description description="Lats, pricing, history of contacts, contact message" />
      </PlatformItem>
      <PlatformItem
        title="@SupportFr"
        action={
          <Button
            variant="secondary"
            label="Manage"
            size="sm"
            icon={Cog6ToothIcon}
          />
        }
        visual={
          <Avatar
            visual="https://dust.tt/static/droidavatar/Droid_Pink_4.jpg"
            size="md"
          />
        }
      >
        <PlatformItem.Description description="Lats, pricing, history of contacts, contact message" />
      </PlatformItem>
    </PlatformItem.List>
  </div>
);
