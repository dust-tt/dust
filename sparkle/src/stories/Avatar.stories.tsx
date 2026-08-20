import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { AVATAR_SIZES } from "@sparkle/components/Avatar";
import { ActionBeerIcon } from "@sparkle/icons/actions";
import { Star01 } from "@sparkle/icons/v2-stroke";

import { Avatar } from "../index_with_tw_base";

const ICONS = {
  none: null,
  ActionBeerIcon: ActionBeerIcon,
  Star01: Star01,
} as const;

const meta = {
  title: "Data Display/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Represents a user, agent, or entity with an image, emoji, icon, or initials. Avatars support a range of **sizes**, busy and clickable states, and stacking via **AvatarSet**.

**When to use**
- To identify the author of a message, a workspace member, or an agent.

**Guidelines**
- Always provide a **name** so there is a sensible initials fallback when no image is available, and for accessibility.
- Keep avatar **size** consistent within a given context (a list, a header).
- For a group of people or entities, use **AvatarSet** rather than several loose avatars.`,
      },
    },
  },
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
      description: "Tailwind background color class (e.g., 'bg-blue-200')",
    },
    iconColor: {
      control: "text",
      description: "Tailwind text color class for icon (e.g., 'text-gray-50')",
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DROID_AVATARS = [
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
] as const;

const NAME_ONLY_AVATARS = [
  { name: "Eleanor Wright" },
  { name: "Mason Johnson" },
  { name: "Oliver Bennett" },
  { name: "Sophia Garcia" },
  { name: "Lucas Adams" },
  { name: "Ava Torres" },
  { name: "Liam White" },
  { name: "Emma Jenkins" },
  { name: "Noah Martinez" },
] as const;

// Every fixed size (excludes the container-driven "auto" size).
const FIXED_SIZES = AVATAR_SIZES.filter((size) => size !== "auto");

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Interactive single avatar — tweak any prop from the Controls panel.
 *
 * @summary Interactive playground.
 */
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

/**
 * When only a `name` is provided the avatar falls back to the initial on a
 * deterministic background color. Always pass a name so this fallback (and the
 * accessible label) works when no image is available.
 *
 * @summary Initials fallback from the name.
 */
export const WithInitials: Story = {
  args: {
    name: "John Doe",
    size: "md",
  },
};

/**
 * An emoji avatar, paired with a Tailwind `backgroundColor` class. Used for
 * user-picked identities like agents or channels.
 *
 * @summary Emoji visual with a custom background.
 */
export const WithEmoji: Story = {
  args: {
    emoji: "🧑‍🚀",
    backgroundColor: "bg-gray-200",
    size: "md",
  },
};

/**
 * An image avatar via the `visual` URL. Keep the `name` so initials render
 * while the image loads or if it fails.
 *
 * @summary Image visual with a name fallback.
 */
export const WithImage: Story = {
  args: {
    size: "md",
    name: "Aria Doe",
    visual: "https://dust.tt/static/droidavatar/Droid_Lime_2.jpg",
  },
};

/**
 * An icon avatar, used to represent tools, integrations, or system entities
 * rather than people. `backgroundColor` and `iconColor` tune the treatment.
 *
 * @summary Icon visual for non-person entities.
 */
export const WithIcon: Story = {
  args: {
    size: "md",
    icon: ActionBeerIcon,
    backgroundColor: "bg-gray-700",
    iconColor: "text-gray-50",
  },
};

/**
 * With no name, image, emoji, or icon, the avatar renders an empty
 * placeholder. An empty-string `visual` is treated the same as no visual.
 *
 * @summary Empty placeholder state.
 */
export const Empty: Story = {
  args: {
    size: "md",
  },
};

/**
 * `busy` adds a breathing animation to signal that the entity (typically an
 * agent) is currently working.
 *
 * @summary Breathing busy animation.
 */
export const Busy: Story = {
  args: {
    busy: true,
    size: "md",
    name: "Aria Doe",
    visual: "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
  },
};

/**
 * `clickable` adds hover feedback for avatars that act as buttons or links
 * (e.g. opening a member or agent profile).
 *
 * @summary Hover feedback for interactive avatars.
 */
export const Clickable: Story = {
  args: {
    clickable: true,
    size: "md",
    name: "Omar Doe",
    visual: "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
  },
};

/**
 * Visual reference: every fixed size across the main content types (empty,
 * initials, image). For design review — not a usage example.
 *
 * @summary Visual reference of all fixed sizes.
 */
export const SizesGallery: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-4 text-foreground">
      <div>Empty</div>
      <div className="flex items-end gap-4">
        {FIXED_SIZES.map((size) => (
          <Avatar key={size} size={size} />
        ))}
      </div>
      <div>With name (initials)</div>
      <div className="flex items-end gap-4">
        {FIXED_SIZES.map((size) => (
          <Avatar key={size} size={size} name="Isabelle Doe" />
        ))}
      </div>
      <div>With image</div>
      <div className="flex items-end gap-4">
        {FIXED_SIZES.map((size) => (
          <Avatar
            key={size}
            size={size}
            name="Aria Doe"
            visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
          />
        ))}
      </div>
    </div>
  ),
};

/**
 * Internal layout probe for `size="auto"`, where the avatar fills its grid
 * cell instead of using a fixed size. For design review — not a usage example.
 *
 * @summary Visual reference for the auto size in a grid.
 */
export const AutoSizeGrid: Story = {
  tags: ["!manifest"],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
        gap: "48px 16px",
      }}
    >
      <Avatar size="auto" />
      <Avatar size="auto" />
      {NAME_ONLY_AVATARS.map((avatar) => (
        <Avatar key={avatar.name} size="auto" name={avatar.name} />
      ))}
      {DROID_AVATARS.map((avatar) => (
        <Avatar
          key={avatar.name}
          size="auto"
          name={avatar.name}
          visual={avatar.visual}
        />
      ))}
    </div>
  ),
};

/**
 * `Avatar.Stack` overlaps a group of avatars, for showing the participants of
 * a conversation or space in a compact strip.
 *
 * @summary Basic overlapping avatar stack.
 */
export const StackDefault: Story = {
  render: () => (
    <Avatar.Stack size="sm" nbVisibleItems={4} avatars={[...DROID_AVATARS]} />
  ),
};

/**
 * When the group exceeds `nbVisibleItems`, the stack truncates and shows a
 * "+N" counter for the hidden members.
 *
 * @summary Stack truncation with a hidden-count badge.
 */
export const StackWithHiddenCount: Story = {
  render: () => (
    <Avatar.Stack
      size="sm"
      nbVisibleItems={3}
      avatars={[...DROID_AVATARS, ...NAME_ONLY_AVATARS]}
    />
  ),
};

/**
 * `orientation="vertical"` stacks the avatars top-to-bottom, for narrow
 * sidebars or vertical rails.
 *
 * @summary Vertical stack orientation.
 */
export const StackVertical: Story = {
  render: () => (
    <Avatar.Stack
      size="sm"
      nbVisibleItems={4}
      orientation="vertical"
      avatars={[...DROID_AVATARS]}
    />
  ),
};

/**
 * `onTop="first"` puts the first avatar on top of the overlap order (the
 * default is `"last"`), useful when the leading member matters most.
 *
 * @summary First avatar on top of the overlap order.
 */
export const StackOnTopFirst: Story = {
  render: () => (
    <Avatar.Stack
      size="sm"
      nbVisibleItems={4}
      onTop="first"
      avatars={[...DROID_AVATARS]}
    />
  ),
};
