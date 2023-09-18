import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Drive, Github, Notion, Slack } from "@sparkle/logo/platforms";

import {
  Avatar,
  Button,
  Chip,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  ContextItem,
  PencilSquareIcon,
  SliderToggle,
  TrashIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Molecule/ContextItem",
  component: ContextItem,
} satisfies Meta<typeof ContextItem>;

export default meta;

export const ListItemExample = () => (
  <div>
    <ContextItem.List>
      <ContextItem
        title="Notion"
        visual={<ContextItem.Visual visual={Notion} />}
        action={
          <Button
            variant="primary"
            label="Activate"
            size="sm"
            icon={CloudArrowDownIcon}
          />
        }
      >
        <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
      </ContextItem>
      <ContextItem
        title="Drive"
        visual={<ContextItem.Visual visual={Drive} />}
        action={
          <Button
            variant="secondary"
            label="Manage"
            size="sm"
            icon={Cog6ToothIcon}
          />
        }
      >
        <ContextItem.Description description="Hello you" />
      </ContextItem>
      <ContextItem
        title="Slack"
        visual={<ContextItem.Visual visual={Slack} />}
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
        <ContextItem.Description description="Hello you" />
      </ContextItem>
      <ContextItem
        title="Github"
        visual={<ContextItem.Visual visual={Github} />}
      >
        <>
          <div className="s-py-2">
            <Chip label="Syncing…" color="amber" size="sm" isBusy />
          </div>
          <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
        </>
      </ContextItem>
      <ContextItem
        title="@Gpt4"
        action={<SliderToggle size="md" />}
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
            size="sm"
          />
        }
      >
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
      <ContextItem
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
            size="sm"
          />
        }
      >
        <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
      </ContextItem>
    </ContextItem.List>
  </div>
);
