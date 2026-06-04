import type { Meta } from "@storybook/react";
import React from "react";

import { ActionCard, Hoverable } from "@sparkle/components";
import { PlanetV2 } from "@sparkle/icons/v2-stroke";
import { BookOpen01V2, SearchMdV2, TerminalV2 } from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof ActionCard> = {
  title: "Modules/ActionCard",
  component: ActionCard,
};

export default meta;

export const Examples = () => (
  <div className="s-flex s-gap-3">
    {/* Not added - default md size */}
    <div className="s-w-80">
      <ActionCard
        icon={BookOpen01V2}
        cardContainerClassName="s-h-36"
        label="Image Generation"
        description="Agent can generate images (GPT Image 1)."
        isSelected
        canAdd
        onClick={() => console.log("Add Image Generation")}
        footer={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>

    {/* Added - xl size */}
    <div className="s-w-80">
      <ActionCard
        cardContainerClassName="s-h-36"
        icon={TerminalV2}
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
        footer={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>
  </div>
);

export const DiffStatus = () => (
  <div className="s-flex s-gap-3">
    <div className="s-w-80">
      <ActionCard
        icon={SearchMdV2}
        cardContainerClassName="s-h-36"
        label="Web Search"
        description="Search & browse the web for up-to-date information."
        canAdd={false}
        diffStatus="added"
      />
    </div>
    <div className="s-w-80">
      <ActionCard
        icon={PlanetV2}
        cardContainerClassName="s-h-36"
        label="Code Interpreter"
        description="Run code snippets in a sandboxed environment."
        canAdd={false}
        diffStatus="removed"
      />
    </div>
  </div>
);
