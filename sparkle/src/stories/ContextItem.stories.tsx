import type { Meta } from "@storybook/react";
import React from "react";

import { Drive, Github, Notion, Slack } from "@sparkle/logo/platforms";

import {
  Avatar,
  Button,
  Chip,
  Cog6ToothIcon,
  ContextItem,
  PencilSquareIcon,
  SliderToggle,
  TemplateItem,
  TrashIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Components/ContextItem",
  component: ContextItem,
} satisfies Meta<typeof ContextItem>;

export default meta;

export const ListItemExample = () => (
  <div>
    <ContextItem.List>
      <ContextItem.SectionHeader
        title="Connected platforms"
        description="Platforms connected"
      />
      <ContextItem
        title="Notion"
        visual={<ContextItem.Visual visual={Notion} />}
        onClick={() => console.log("clicked item")}
      >
        <ContextItem.Description description="Teamspaces “General” and “Public”, pages “Engineering”, “Team Life”, “Marketing”, “Brand”, “Getting Started at Dust”, “Brand”, “Design”, “Product Decisions”, “Hiring”, “Man" />
      </ContextItem>
      <ContextItem
        title="Drive"
        visual={<ContextItem.Visual visual={Drive} />}
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
        subElement={<>By: Stan</>}
        action={<SliderToggle size="xs" />}
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
        subElement={<>By: Edouard Wautier, Amira Hadad</>}
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
      {undefined}
    </ContextItem.List>
    <ContextItem.SectionHeader title="Featured" hasBorder={false} />
    <TemplateItem
      name="Hiring"
      id="1"
      description="The specialist for coverage, insurance, process related questions"
      visual={{
        backgroundColor: "s-bg-red-100",
        emoji: "🫶",
      }}
      href={""}
    />

    <TemplateItem
      name="Training"
      id="2"
      description="The specialist for coverage, insurance, process related questions with a very long description that does not bring any value"
      visual={{
        backgroundColor: "s-bg-blue-100",
        emoji: "🐴",
      }}
      href={""}
    />

    <TemplateItem
      name="Hiring"
      id="1"
      description="The specialist for coverage, insurance, process related questions"
      visual={{
        backgroundColor: "s-bg-red-100",
        emoji: "🫶",
      }}
      href={""}
    />
  </div>
);
