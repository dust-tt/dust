import type { Meta } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";
import {
  ChatBubbleThoughtIcon,
  DocumentIcon,
  FolderIcon,
} from "@sparkle/icons/app";
import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";

const meta = {
  title: "Primitives/DoubleIcon",
  component: DoubleIcon,
} satisfies Meta<typeof DoubleIcon>;

export default meta;

export const IconPositions = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="xl" mainIcon={FolderIcon} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon
        size="xl"
        mainIcon={DocumentIcon}
        secondaryIcon={NotionLogo}
      />{" "}
      <DoubleIcon
        size="xl"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="lg" mainIcon={FolderIcon} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon
        size="lg"
        mainIcon={DocumentIcon}
        secondaryIcon={NotionLogo}
      />{" "}
      <DoubleIcon
        size="lg"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="md" mainIcon={FolderIcon} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon
        size="md"
        mainIcon={DocumentIcon}
        secondaryIcon={NotionLogo}
      />{" "}
      <DoubleIcon
        size="md"
        mainIcon={ChatBubbleThoughtIcon}
        secondaryIcon={SlackLogo}
      />
    </div>
  </div>
);
