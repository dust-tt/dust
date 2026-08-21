import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  AssistantCard,
  AssistantCardMore,
  CardGrid,
  CompactAssistantCard,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LargeAssistantCard,
} from "@sparkle/components";

const meta: Meta<typeof AssistantCard> = {
  title: "Product/Agent/AssistantCard",
  tags: ["a11y-issues"],
  component: AssistantCard,
  parameters: {
    docs: {
      description: {
        component: `A card that presents an agent for browsing or selection, showing its \`title\`, \`pictureUrl\` avatar, \`subtitle\` (authors), and \`description\`, with an optional \`action\` slot (commonly **AssistantCardMore** opening a **DropdownMenu**) and a \`variant\`. The family includes **CompactAssistantCard** (denser tile), **LargeAssistantCard** (wide list row), and the minimal **AssistantCard**; lay them out with **CardGrid**.

**When to use**
- To display agents in galleries, pickers, or lists where the user browses or selects one.

**Guidelines**
- Pick the size to match the layout: **CompactAssistantCard** and minimal **AssistantCard** for grids, **LargeAssistantCard** for two-column lists.
- Wire \`onClick\` for selection and reserve the \`action\` slot for secondary controls (edit, duplicate, remove) via **AssistantCardMore**.
- Arrange cards with **CardGrid** rather than ad-hoc grids; long titles and descriptions truncate automatically.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const actionsMenu = (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <AssistantCardMore />
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem label="Edit" />
      <DropdownMenuItem label="Duplicate" />
      <DropdownMenuItem label="Remove" />
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * The minimal AssistantCard as it appears in an agent gallery: avatar, title,
 * author subtitle, one-line description, and an **AssistantCardMore** action
 * opening a dropdown of secondary controls.
 * @summary Gallery card with an actions dropdown.
 */
export const WithActionsMenu: Story = {
  args: {
    title: "supportExpert",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Pink_4.jpg",
    subtitle: "By: Edouard Wautier",
    description:
      "Finds solutions from best-in-class tickets and internal procedures.",
    onClick: fn(),
    action: actionsMenu,
  },
};

/**
 * The `secondary` variant swaps the card surface for contexts where the
 * default background would not stand out (e.g. on a muted panel).
 * @summary Secondary surface variant.
 */
export const SecondaryVariant: Story = {
  args: {
    title: "docsWriter",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg",
    subtitle: "By: Dust",
    description: "Drafts and reviews product documentation from your specs.",
    onClick: fn(),
    action: actionsMenu,
    variant: "secondary",
  },
};

/**
 * Long titles, author lists, and descriptions truncate automatically instead
 * of stretching the card — the grid keeps a uniform rhythm regardless of
 * content length.
 * @summary Truncation of long titles and descriptions.
 */
export const LongContentTruncation: Story = {
  args: {
    title: "salesPipelineReviewAssistantEMEA",
    pictureUrl: "https://dust.tt/static/droidavatar/Droid_Green_2.jpg",
    subtitle: "By: Edouard Wautier, Pierrette Louant, Fabienne Lescure",
    description:
      "Reviews open opportunities across the EMEA pipeline every morning, flags deals with no activity in the last fourteen days, summarizes blockers from CRM notes and call transcripts, and drafts follow-up emails for account executives to review before their stand-up meeting.",
    onClick: fn(),
    action: actionsMenu,
  },
};

/**
 * **CompactAssistantCard** tiles in a **CardGrid** — the dense layout used
 * when browsing many agents at once.
 * @summary Compact tiles in a CardGrid.
 */
export const CompactGrid: Story = {
  render: () => (
    <CardGrid>
      <CompactAssistantCard
        title="analyst"
        description="Self-service analytics agent for SQL queries, spreadsheets, data warehouses, and visualizations."
        pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        onClick={fn()}
      />
      <CompactAssistantCard
        title="codingBuddy"
        description="Assistant for code beginners. Get help writing code and getting started."
        pictureUrl="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
        onClick={fn()}
      />
      <CompactAssistantCard
        title="supportExpert"
        description="Find solutions from best-in-class tickets and internal procedures."
        pictureUrl="https://dust.tt/static/droidavatar/Droid_Pink_4.jpg"
        onClick={fn()}
      />
    </CardGrid>
  ),
};

/**
 * **LargeAssistantCard** rows in a two-column list, with the author list in
 * `subtitle`. The second card's long description shows how the wide layout
 * handles multi-line content.
 * @summary Wide list rows with author subtitles.
 */
export const LargeListRows: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <LargeAssistantCard
        title="@gpt4"
        description="OpenAI's most powerful and recent model (128k context)."
        onClick={fn()}
        pictureUrl="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
        subtitle="Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
      />
      <LargeAssistantCard
        title="@hiringPartner"
        description="Screens inbound applications against the role scorecard, drafts structured interview debriefs, and keeps the hiring committee up to date with a weekly summary of pipeline health, offer status, and candidate feedback across all open roles."
        pictureUrl="https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"
        subtitle="Stanislas Polu"
        onClick={fn()}
      />
    </div>
  ),
};
