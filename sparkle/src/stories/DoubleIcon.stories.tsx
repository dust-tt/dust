import type { Meta } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";

import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";
import { File02, Folder } from "@sparkle/icons/v2-stroke";
import { MessageDotsCircle } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Data Display/DoubleIcon",
  component: DoubleIcon,
  parameters: {
    docs: {
      description: {
        component: `Overlays a small **secondaryIcon** badge on the corner of a **mainIcon**, supporting a range of **sizes** (\`sm\`, \`md\`, \`lg\`, \`xl\`). Typically used to combine a content-type glyph with a source/provider logo.

**When to use**
- To show a piece of content alongside its origin (e.g. a document with its connector logo).

**Guidelines**
- Keep the **mainIcon** as the subject and the **secondaryIcon** as a small qualifier such as a provider logo.
- For a single glyph use **Icon**; for an entity image use **Avatar**.`,
      },
    },
  },
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
