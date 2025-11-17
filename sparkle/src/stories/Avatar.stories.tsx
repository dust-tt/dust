import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { AVATAR_SIZES } from "@sparkle/components/Avatar";
import {
  ActionBeerIcon,
  ActionFlagIcon,
  ActionImageIcon,
  ActionMagnifyingGlassIcon,
  ActionScanIcon,
  ActionShirtIcon,
  ActionTableIcon,
  ActionUmbrellaIcon,
} from "@sparkle/icons/actions";
import SvgHome from "@sparkle/icons/actions/Home";
import { StarStrokeIcon } from "@sparkle/icons/app";

import {
  Avatar,
  DriveLogo,
  NotionLogo,
  SlackLogo,
} from "../index_with_tw_base";

const ICONS = {
  none: null,
  ActionBeerIcon: ActionBeerIcon,
  StarStrokeIcon: StarStrokeIcon,
} as const;

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    size: {
      options: AVATAR_SIZES,
      control: { type: "select" },
      description: "Size of the avatar",
    },
    name: {
      control: "text",
      description:
        "Name to display (shows first letter or full name for special characters)",
    },
    visual: {
      control: "text",
      description: "URL to an image or emoji URL",
    },
    emoji: {
      control: "text",
      description: "Emoji to display in the avatar",
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Icon component to display",
    },
    backgroundColor: {
      control: "text",
      description: "Tailwind background color class (e.g., 's-bg-blue-200')",
    },
    iconColor: {
      control: "text",
      description:
        "Tailwind text color class for icon (e.g., 's-text-gray-50')",
    },
    clickable: {
      control: "boolean",
      description: "Whether the avatar has hover effects",
    },
    busy: {
      control: "boolean",
      description: "Whether to show breathing animation",
    },
    disabled: {
      control: "boolean",
      description: "Whether the avatar is disabled (reduced opacity)",
    },
    isRounded: {
      control: "boolean",
      description: "Whether to use fully rounded (circle) style",
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: "md",
    name: "John Doe",
    clickable: false,
    busy: false,
    disabled: false,
    isRounded: false,
  },
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
  gap: "48px 16px",
};

export const AvatarExample: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4 s-text-foreground dark:s-text-foreground-night">
      <div>With nothing</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" />
        <Avatar size="sm" />
        <Avatar size="md" />
        <Avatar size="lg" />
        <Avatar size="xl" />
        <Avatar size="2xl" />
      </div>
      <div>With name</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" name="Isabelle Doe" />
        <Avatar size="sm" name="Rafael Doe" />
        <Avatar size="md" name="Aria Doe" />
        <Avatar size="lg" name="Omar Doe" />
        <Avatar size="xl" name="Omar Doe" />
        <Avatar size="2xl" name="Omar Doe" />
      </div>
      <div>With emoji url</div>
      <div className="s-flex s-gap-4">
        <Avatar
          size="xs"
          visual="https://dust.tt/static/emojis/bg-cyan-100/lotus/1fab7"
        />
      </div>
      <div>With emoji</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" emoji="❤️" backgroundColor="s-bg-red-100" />
        <Avatar size="sm" emoji="💀" backgroundColor="s-bg-gray-800" />
        <Avatar size="md" emoji="😂" backgroundColor="s-bg-info-200" />
        <Avatar size="lg" emoji="🧑‍🚀" backgroundColor="s-bg-gray-200" />
        <Avatar size="xl" emoji="👕" backgroundColor="s-bg-blue-200" />
        <Avatar size="2xl" emoji="👕" backgroundColor="s-bg-blue-200" />
      </div>
      <div className="s-flex s-gap-4">
        <Avatar size="sm" name="Eleanor Wright" />
        <Avatar size="sm" name="Mason Johnson" />
        <Avatar size="sm" name="Oliver Bennett" />
        <Avatar size="sm" name="Sophia Garcia" />
        <Avatar size="sm" name="Lucas Adams" />
        <Avatar size="sm" name="Ava Torres" />
        <Avatar size="sm" name="Liam White" />
        <Avatar size="sm" name="Emma Jenkins" />
        <Avatar size="sm" name="Noah Martinez" />
        <Avatar size="sm" name="Isabella Thompson" />
        <Avatar size="sm" name="Ethan Roberts" />
        <Avatar size="sm" name="Charlotte Turner" />
        <Avatar size="sm" name="Benjamin Foster" />
        <Avatar size="sm" name="Mia Evans" />
        <Avatar size="sm" name="Alexander Perry" />
        <Avatar size="sm" name="Harper Sanchez" />
        <Avatar size="sm" name="William Murphy" />
        <Avatar size="sm" name="Lily Phillips" />
        <Avatar size="sm" name="James Coleman" />
        <Avatar size="sm" name="Aria Mitchell" />
      </div>
      <div>With image</div>
      <div className="s-flex s-gap-4">
        <Avatar
          size="xs"
          name="Isabelle Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
        <Avatar
          size="sm"
          name="Rafael Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
        <Avatar
          size="md"
          name="Aria Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
        <Avatar
          size="lg"
          name="Omar Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
      </div>
      <div>Visual as empty string should be treated as null</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" name="Soupinou Meow" visual={""} />
      </div>
      <div>With icon</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" icon={SvgHome} />
        <Avatar size="xs" icon={DriveLogo} />
        <Avatar size="sm" icon={ActionBeerIcon} />
        <Avatar size="sm" icon={NotionLogo} backgroundColor="s-bg-blue-50" />
        <Avatar size="md" icon={ActionUmbrellaIcon} />
        <Avatar size="lg" icon={ActionFlagIcon} />
        <Avatar size="lg" icon={SlackLogo} hexBgColor="#421D51" />
        <Avatar size="xl" icon={ActionShirtIcon} />
        <Avatar size="2xl" icon={StarStrokeIcon} />
      </div>
      <div className="heading-2xl">Tools example</div>
      <div>Remote MCP Servers</div>
      <div className="s-flex s-gap-4">
        <Avatar size="md" icon={SvgHome} />
        <Avatar size="md" icon={ActionBeerIcon} />
        <Avatar size="md" icon={ActionUmbrellaIcon} />
        <Avatar size="md" icon={ActionFlagIcon} />
        <Avatar size="md" icon={ActionShirtIcon} />
        <Avatar size="md" icon={StarStrokeIcon} />
      </div>
      <div>Internal Tools Servers</div>
      <div className="s-flex s-gap-4">
        <Avatar
          size="md"
          icon={ActionTableIcon}
          backgroundColor="s-bg-gray-700"
          iconColor="s-text-gray-50"
        />
        <Avatar
          size="md"
          icon={ActionMagnifyingGlassIcon}
          backgroundColor="s-bg-gray-700"
          iconColor="s-text-gray-50"
        />
        <Avatar
          size="md"
          icon={ActionImageIcon}
          backgroundColor="s-bg-gray-700"
          iconColor="s-text-gray-50"
        />
        <Avatar
          size="md"
          icon={ActionScanIcon}
          backgroundColor="s-bg-gray-700"
          iconColor="s-text-gray-50"
        />
      </div>
      <div>Platforms integrations</div>
      <div className="s-flex s-gap-4">
        <Avatar size="md" icon={DriveLogo} backgroundColor="s-bg-gray-900" />
        <Avatar size="md" icon={NotionLogo} backgroundColor="s-bg-white" />
        <Avatar size="md" icon={SlackLogo} hexBgColor="#421D51" />
      </div>
    </div>
  ),
};

export const AvatarStackExample: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-6">
      <div className="s-flex s-flex-row s-gap-2">
        <Avatar.Stack
          size="xs"
          nbVisibleItems={3}
          isRounded
          avatars={[
            {
              name: "Isabelle Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
            },
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            {
              name: "Aria Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
            },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
          ]}
        />

        <Avatar.Stack
          size="xs"
          nbVisibleItems={6}
          avatars={[
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            { name: "Mason Johnson" },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
            { name: "Eleanor Wright" },
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            { name: "Mason Johnson" },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
            { name: "Eleanor Wright" },
          ]}
        />

        <Avatar.Stack
          size="xs"
          nbVisibleItems={1}
          avatars={[
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
          ]}
        />
      </div>

      <div className="s-flex s-flex-row s-gap-2">
        <Avatar.Stack
          size="sm"
          nbVisibleItems={4}
          isRounded
          avatars={[
            {
              name: "Isabelle Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
            },
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            {
              name: "Aria Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
            },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
          ]}
        />

        <Avatar.Stack
          size="sm"
          nbVisibleItems={3}
          avatars={[
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            { name: "Mason Johnson" },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
            { name: "Eleanor Wright" },
          ]}
        />

        <Avatar.Stack
          nbVisibleItems={1}
          avatars={[
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
          ]}
        />
      </div>

      <div className="s-flex s-flex-row s-gap-4">
        <Avatar.Stack
          nbVisibleItems={4}
          size="md"
          avatars={[
            {
              name: "Isabelle Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
            },
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            {
              name: "Aria Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
            },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
          ]}
        />
        <Avatar.Stack
          size="md"
          nbVisibleItems={3}
          avatars={[
            {
              name: "Isabelle Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
            },
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
            {
              name: "Aria Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
            },
            {
              name: "Omar Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
            },
          ]}
        />
        <Avatar.Stack
          size="md"
          avatars={[
            {
              name: "Rafael Doe",
              visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
            },
          ]}
        />
      </div>
    </div>
  ),
};

export const AvatarGridExample: Story = {
  render: () => (
    <div style={gridStyle}>
      <Avatar size="auto" />
      <Avatar size="auto" />
      <Avatar size="auto" />
      <Avatar size="auto" />
      <Avatar size="auto" />
      <Avatar size="auto" name="Isabelle Doe" />
      <Avatar size="auto" name="Rafael Doe" />
      <Avatar size="auto" name="Aria Doe" />
      <Avatar size="auto" name="Omar Doe" />
      <Avatar size="auto" name="Omar Doe" />
      <Avatar size="auto" name="Eleanor Wright" />
      <Avatar size="auto" name="Mason Johnson" />
      <Avatar size="auto" name="Oliver Bennett" />
      <Avatar size="auto" name="Sophia Garcia" />
      <Avatar size="auto" name="Lucas Adams" />
      <Avatar size="auto" name="Ava Torres" />
      <Avatar size="auto" name="Liam White" />
      <Avatar size="auto" name="Emma Jenkins" />
      <Avatar size="auto" name="Noah Martinez" />
      <Avatar size="auto" name="Isabella Thompson" />
      <Avatar size="auto" name="Ethan Roberts" />
      <Avatar size="auto" name="Charlotte Turner" />
      <Avatar size="auto" name="Benjamin Foster" />
      <Avatar size="auto" name="Mia Evans" />
      <Avatar size="auto" name="Alexander Perry" />
      <Avatar size="auto" name="Harper Sanchez" />
      <Avatar size="auto" name="William Murphy" />
      <Avatar size="auto" name="Lily Phillips" />
      <Avatar size="auto" name="James Coleman" />
      <Avatar size="auto" name="Aria Mitchell" />
      <Avatar
        size="auto"
        name="Isabelle Doe"
        visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
      />
      <Avatar
        size="auto"
        name="Rafael Doe"
        visual="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
      />
      <Avatar
        size="auto"
        name="Aria Doe"
        visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
      />
      <Avatar
        size="auto"
        name="Omar Doe"
        visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
      />
    </div>
  ),
};

export const AvatarBusyExample: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div>With nothing</div>
      <div className="s-flex s-gap-4">
        <Avatar busy size="xs" />
        <Avatar busy size="sm" />
        <Avatar busy size="md" />
        <Avatar busy size="lg" />
        <Avatar busy size="xl" />
      </div>
      <div>With name</div>
      <div className="s-flex s-gap-4">
        <Avatar busy size="xs" name="Isabelle Doe" />
        <Avatar busy size="sm" name="Rafael Doe" />
        <Avatar busy size="md" name="Aria Doe" />
        <Avatar busy size="lg" name="Omar Doe" />
        <Avatar busy size="xl" name="Eleanor Doe" />
      </div>
      <div className="s-flex s-gap-4">
        <Avatar busy size="sm" name="Eleanor Wright" />
        <Avatar busy size="sm" name="Mason Johnson" />
        <Avatar busy size="sm" name="Oliver Bennett" />
        <Avatar busy size="sm" name="Sophia Garcia" />
        <Avatar busy size="sm" name="Lucas Adams" />
        <Avatar busy size="sm" name="Ava Torres" />
        <Avatar busy size="sm" name="Liam White" />
        <Avatar busy size="sm" name="Emma Jenkins" />
        <Avatar busy size="sm" name="Noah Martinez" />
        <Avatar busy size="sm" name="Isabella Thompson" />
        <Avatar busy size="sm" name="Ethan Roberts" />
        <Avatar busy size="sm" name="Charlotte Turner" />
        <Avatar busy size="sm" name="Benjamin Foster" />
        <Avatar busy size="sm" name="Mia Evans" />
        <Avatar busy size="sm" name="Alexander Perry" />
        <Avatar busy size="sm" name="Harper Sanchez" />
        <Avatar busy size="sm" name="William Murphy" />
        <Avatar busy size="sm" name="Lily Phillips" />
        <Avatar busy size="sm" name="James Coleman" />
        <Avatar busy size="sm" name="Aria Mitchell" />
      </div>
      <div>With image</div>
      <div className="s-flex s-gap-4">
        <Avatar
          busy
          size="xs"
          name="Isabelle Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
        <Avatar
          busy
          size="sm"
          name="Rafael Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
        />
        <Avatar
          busy
          size="md"
          name="Aria Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
        />
        <Avatar
          busy
          size="lg"
          name="Omar Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
        />
      </div>
    </div>
  ),
};

export const AvatarClickableExample: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div>With nothing</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" clickable />
        <Avatar size="sm" clickable />
        <Avatar size="md" clickable />
        <Avatar size="lg" clickable />
      </div>
      <div>With name</div>
      <div className="s-flex s-gap-4">
        <Avatar size="xs" name="Isabelle Doe" clickable />
        <Avatar size="sm" name="Rafael Doe" clickable />
        <Avatar size="md" name="Aria Doe" clickable />
        <Avatar size="lg" name="Omar Doe" clickable />
      </div>
      <div className="s-flex s-gap-4">
        <Avatar size="sm" name="Eleanor Wright" clickable />
        <Avatar size="sm" name="Mason Johnson" clickable />
        <Avatar size="sm" name="Oliver Bennett" clickable />
        <Avatar size="sm" name="Sophia Garcia" clickable />
        <Avatar size="sm" name="Lucas Adams" clickable />
        <Avatar size="sm" name="Ava Torres" clickable />
        <Avatar size="sm" name="Liam White" clickable />
        <Avatar size="sm" name="Emma Jenkins" clickable />
        <Avatar size="sm" name="Noah Martinez" clickable />
        <Avatar size="sm" name="Isabella Thompson" clickable />
        <Avatar size="sm" name="Ethan Roberts" clickable />
        <Avatar size="sm" name="Charlotte Turner" clickable />
        <Avatar size="sm" name="Benjamin Foster" clickable />
        <Avatar size="sm" name="Mia Evans" clickable />
        <Avatar size="sm" name="Alexander Perry" clickable />
        <Avatar size="sm" name="Harper Sanchez" clickable />
        <Avatar size="sm" name="William Murphy" clickable />
        <Avatar size="sm" name="Lily Phillips" clickable />
        <Avatar size="sm" name="James Coleman" clickable />
        <Avatar size="sm" name="Aria Mitchell" clickable />
      </div>
      <div>With image</div>
      <div className="s-flex s-gap-4">
        <Avatar
          size="xs"
          name="Isabelle Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
          clickable
        />
        <Avatar
          size="sm"
          name="Rafael Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
          clickable
        />
        <Avatar
          size="md"
          name="Aria Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
          clickable
        />
        <Avatar
          size="lg"
          name="Omar Doe"
          visual="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
          clickable
        />
      </div>
    </div>
  ),
};

export const AvatarWithImage: Story = {
  args: {
    size: "md",
    visual: "http://edouardwautier.com/img/me.jpg",
  },
};
export const AvatarWithName: Story = {
  args: {
    name: "John Doe",
    size: "md",
  },
};
export const AvatarEmpty: Story = {
  args: {
    size: "md",
  },
};
