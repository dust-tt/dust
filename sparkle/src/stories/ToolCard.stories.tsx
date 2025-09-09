import type { Meta } from "@storybook/react";
import React from "react";

import { ToolCard } from "@sparkle/components";
import { Hoverable } from "@sparkle/components";
import { BookOpenIcon, CommandLineIcon } from "@sparkle/icons/app";

const meta: Meta<typeof ToolCard> = {
  title: "Modules/ToolCard",
  component: ToolCard,
};

export default meta;

export const Examples = () => (
  <div className="s-flex s-gap-3">
    {/* Not added - default md size */}
    <div className="s-w-80">
      <ToolCard
        icon={BookOpenIcon}
        cardContainerClassName="s-h-36"
        label="Image Generation"
        description="Agent can generate images (GPT Image 1)."
        isSelected
        canAdd
        onClick={() => console.log("Add Image Generation")}
        toolInfo={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>

    {/* Added - xl size */}
    <div className="s-w-80">
      <ToolCard
        cardContainerClassName="s-h-36"
        icon={CommandLineIcon}
        label="Reasoning"
        description={
          <>
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.{" "}
            <Hoverable
              href="https://example.com/help"
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
            >
              the docs
            </Hoverable>
          </>
        }
        isSelected
        canAdd={false}
        toolInfo={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>
  </div>
);
