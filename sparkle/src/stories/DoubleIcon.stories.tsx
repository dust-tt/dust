import type { Meta } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";
import { SimpleDoubleIcon } from "@sparkle/components/DoubleIcon";
import {
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleThoughtIcon,
  CheckCircleIcon,
  DocumentIcon,
  FolderIcon,
  HeartIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  UserIcon,
} from "@sparkle/icons/app";
import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";

const meta = {
  title: "Primitives/DoubleIcon",
  component: DoubleIcon,
} satisfies Meta<typeof DoubleIcon>;

export default meta;

export const IconPositions = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <SimpleDoubleIcon mainIcon={FolderIcon} secondaryIcon={DriveLogo} />{" "}
    <SimpleDoubleIcon mainIcon={DocumentIcon} secondaryIcon={NotionLogo} />{" "}
    <SimpleDoubleIcon
      mainIcon={ChatBubbleThoughtIcon}
      secondaryIcon={SlackLogo}
    />
    <div className="s-flex s-items-center s-gap-16">
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: ChatBubbleBottomCenterTextIcon,
            size: "md",
            className: "s-text-primary-500",
          }}
          secondaryIconProps={{
            visual: CheckCircleIcon,
            size: "xs",
            className: "s-text-success-500",
          }}
          position="bottom-right"
        />
        <span className="s-text-xs s-text-muted-foreground">bottom-right</span>
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: ChatBubbleBottomCenterTextIcon,
            size: "md",
            className: "s-text-primary-500",
          }}
          secondaryIconProps={{
            visual: CheckCircleIcon,
            size: "xs",
            className: "s-text-success-500",
          }}
          position="top-right"
        />
        <span className="s-text-xs s-text-muted-foreground">top-right</span>
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: ChatBubbleBottomCenterTextIcon,
            size: "md",
            className: "s-text-primary-500",
          }}
          secondaryIconProps={{
            visual: CheckCircleIcon,
            size: "xs",
            className: "s-text-success-500",
          }}
          position="bottom-left"
        />
        <span className="s-text-xs s-text-muted-foreground">bottom-left</span>
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: ChatBubbleBottomCenterTextIcon,
            size: "md",
            className: "s-text-primary-500",
          }}
          secondaryIconProps={{
            visual: CheckCircleIcon,
            size: "xs",
            className: "s-text-success-500",
          }}
          position="top-left"
        />
        <span className="s-text-xs s-text-muted-foreground">top-left</span>
      </div>
    </div>
    <div className="s-flex s-items-center s-gap-16">
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: DocumentIcon,
            size: "md",
            className: "s-text-blue-500",
          }}
          secondaryIconProps={{
            visual: PlusIcon,
            size: "xs",
            className: "s-text-highlight-500",
          }}
          position="bottom-right"
        />
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: UserIcon,
            size: "md",
            className: "s-text-purple-500",
          }}
          secondaryIconProps={{
            visual: StarIcon,
            size: "xs",
            className: "s-text-golden-500",
          }}
          position="top-right"
        />
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: SlackLogo,
            size: "md",
            className: "s-text-green-500",
          }}
          secondaryIconProps={{
            visual: FolderIcon,
            size: "sm",
            className: "s-text-red-500",
          }}
          position="bottom-right"
        />
      </div>

      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <DoubleIcon
          mainIconProps={{
            visual: HeartIcon,
            size: "md",
            className: "s-text-red-500",
          }}
          secondaryIconProps={{
            visual: SparklesIcon,
            size: "xs",
            className: "s-text-golden-500",
          }}
          position="top-left"
        />
      </div>
    </div>
  </div>
);
