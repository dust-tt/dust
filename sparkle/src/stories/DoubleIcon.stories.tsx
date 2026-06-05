import type { Meta } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";

import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";
import { File02, Folder } from "@sparkle/icons/v2-stroke";
import { MessageDotsCircle } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Primitives/DoubleIcon",
  component: DoubleIcon,
} satisfies Meta<typeof DoubleIcon>;

export default meta;

export const IconPositions = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="xl" mainIcon={Folder} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="xl" mainIcon={File02} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="xl"
        mainIcon={MessageDotsCircle}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="lg" mainIcon={Folder} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="lg" mainIcon={File02} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="lg"
        mainIcon={MessageDotsCircle}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="md" mainIcon={Folder} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="md" mainIcon={File02} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="md"
        mainIcon={MessageDotsCircle}
        secondaryIcon={SlackLogo}
      />
    </div>
    <div className="s-flex s-items-center s-gap-8">
      <DoubleIcon size="sm" mainIcon={Folder} secondaryIcon={DriveLogo} />{" "}
      <DoubleIcon size="sm" mainIcon={File02} secondaryIcon={NotionLogo} />{" "}
      <DoubleIcon
        size="sm"
        mainIcon={MessageDotsCircle}
        secondaryIcon={SlackLogo}
      />
    </div>
  </div>
);
