import type { Meta } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";
import { ChatBubbleThoughtIcon } from "@sparkle/icons/app";
import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";
import { File02V2, FolderV2 } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Primitives/DoubleIcon",
  component: DoubleIcon,
} satisfies Meta<typeof DoubleIcon>;

export default meta;

export const IconPositions = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="xl" mainIcon={FolderV2} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="xl" mainIcon={File02V2} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="xl"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="lg" mainIcon={FolderV2} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="lg" mainIcon={File02V2} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="lg"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="md" mainIcon={FolderV2} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="md" mainIcon={File02V2} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="md"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="sm" mainIcon={FolderV2} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="sm" mainIcon={File02V2} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="sm"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
  </div>
);
