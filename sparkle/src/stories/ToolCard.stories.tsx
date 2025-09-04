import type { Meta } from "@storybook/react";
import React from "react";

import { ToolCard } from "@sparkle/components";
import { BookOpenIcon, CommandLineIcon } from "@sparkle/icons/app";

const meta: Meta<typeof ToolCard> = {
  title: "Modules/ToolCard",
  component: ToolCard,
};

export default meta;

export const Examples = () => (
  <div className="s-grid s-grid-cols-2 s-gap-3">
    {/* Not added */}
    <ToolCard
      icon={BookOpenIcon}
      label="Image Generation"
      description="Agent can generate images (GPT Image 1)."
      isSelected={false}
      canAdd={true}
      onClick={() => console.log("Add Image Generation")}
    />

    {/* Added */}
    <ToolCard
      icon={CommandLineIcon}
      label="Reasoning"
      description="Agent can decide to trigger a reasoning model for complex tasks. Agent can decide to trigger a reasoning model for complex tasks. Agent can decide to trigger a reasoning model for complex tasks. Agent can decide to trigger a reasoning model for complex tasks. Agent can decide to trigger a reasoning model for complex tasks. Agent can decide to trigger a reasoning model for complex tasks."
      isSelected={true}
      canAdd={false}
    />
  </div>
);
