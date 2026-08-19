import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  Button,
  Citation,
  CitationClose,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationImage,
  CitationIndex,
  CitationTitle,
  FaviconIcon,
  LinkExternal01,
  Icon,
  NotionLogo,
  Popover,
  SlackLogo,
  Table,
} from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/Citation",
  tags: ["a11y-issues"],
  component: Citation,
  parameters: {
    docs: {
      description: {
        component: `A clickable source reference shown alongside agent answers. **Citation** is a composable surface filled with **CitationIcons** (source logo / favicon via **FaviconIcon**, plus an optional **CitationIndex** for numbered references), **CitationTitle**, and **CitationDescription**; use **CitationImage** for image sources and a **CitationClose** \`action\` to make it dismissable. Wrap citations in **CitationGrid** for a responsive grid or its \`list\` \`variant\`.

**When to use**
- To attribute an agent's answer to a document, web page, Slack thread, or table.
- As numbered inline references (via **CitationIndex**) that expand in a **Popover**.

**Guidelines**
- Always include **CitationIcons** so the source type is recognizable; add a **FaviconIcon** for web sources.
- Lay out multiple citations with **CitationGrid** rather than ad-hoc flex; use the \`list\` variant for interactive-content references.
- For a paginated, fixed-size set of link citations, use **PaginatedCitationsGrid**; for plain file attachments, use **AttachmentChip**.`,
      },
    },
  },
} satisfies Meta<typeof Citation>;

export default meta;

/**
 * A responsive grid of attachments from different source types: a Slack
 * thread (with a tooltip echoing its description), a table file, web pages
 * identified by their favicon, and an image attachment.
 * @summary Attachments grid across source types.
 */
export const AttachmentsGrid: StoryObj = {
  render: () => (
    <CitationGrid>
      <Citation
        onClick={fn()}
        className="w-48"
        tooltip="@ed at 16:32 — Here is the latest version of the launch plan"
      >
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationDescription>
          @ed at 16:32 — Here is the latest version of the launch plan
        </CitationDescription>
      </Citation>
      <Citation onClick={fn()} className="w-48">
        <CitationIcons>
          <Icon visual={Table} size="sm" />
        </CitationIcons>
        <CitationTitle>extract_finance.csv</CitationTitle>
      </Citation>
      <Citation onClick={fn()} className="w-48">
        <CitationIcons>
          <FaviconIcon websiteUrl="https://www.linkedin.com" size="sm" />
        </CitationIcons>
        <CitationTitle>LinkedIn, Edouard Wautier</CitationTitle>
      </Citation>
      <Citation onClick={fn()} className="w-48">
        <CitationIcons>
          <FaviconIcon websiteUrl="https://github.com" size="sm" />
        </CitationIcons>
        <CitationTitle>GitHub repository</CitationTitle>
      </Citation>
      <Citation className="w-48">
        <CitationImage
          imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
          title="screenshot.png"
          downloadUrl="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        />
      </Citation>
    </CitationGrid>
  ),
};

/**
 * Attachments the user can remove: pass a **CitationClose** in the `action`
 * slot (or `onClose` on **CitationImage**). Used for pending attachments in
 * the conversation input.
 * @summary Dismissable attachments with a close action.
 */
export const DismissableAttachments: StoryObj = {
  render: () => (
    <CitationGrid>
      <Citation
        onClick={fn()}
        className="w-48"
        action={<CitationClose onClick={fn()} />}
      >
        <CitationIcons>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread</CitationTitle>
        <CitationDescription>
          @ed at 16:32 — Here is the latest version of the launch plan
        </CitationDescription>
      </Citation>
      <Citation
        onClick={fn()}
        className="w-48"
        action={<CitationClose onClick={fn()} />}
      >
        <CitationIcons>
          <Icon visual={Table} size="sm" />
        </CitationIcons>
        <CitationTitle>extract_finance.csv</CitationTitle>
      </Citation>
      <Citation className="w-48">
        <CitationImage
          imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
          title="screenshot.png"
          onClose={fn()}
        />
      </Citation>
    </CitationGrid>
  ),
};

/**
 * A numbered inline reference as rendered in markdown answers: a
 * **CitationIndex** acts as the **Popover** trigger, and the popover repeats
 * the index next to the source icon, title, and an external-link button.
 * @summary Numbered CitationIndex expanding in a Popover.
 */
export const NumberedCitationInPopover: StoryObj = {
  render: () => (
    <Popover
      trigger={<CitationIndex>1</CitationIndex>}
      content={
        <>
          <CitationIcons>
            <CitationIndex>1</CitationIndex>
            <Icon visual={SlackLogo} size="sm" />
          </CitationIcons>
          <CitationTitle>Slack thread: #help-onboarding</CitationTitle>
          <Button
            variant="ghost"
            icon={LinkExternal01}
            className="absolute right-2 top-2"
          />
        </>
      }
    />
  ),
};

/**
 * Numbered source citations laid out with the default responsive
 * **CitationGrid**, matching the references block under an agent answer.
 * @summary Numbered references in the responsive grid.
 */
export const NumberedReferencesGrid: StoryObj = {
  render: () => (
    <CitationGrid>
      <Citation onClick={fn()}>
        <CitationIcons>
          <CitationIndex>1</CitationIndex>
          <Icon visual={SlackLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Slack thread: #help-onboarding</CitationTitle>
      </Citation>
      <Citation onClick={fn()}>
        <CitationIcons>
          <CitationIndex>2</CitationIndex>
          <Icon visual={NotionLogo} size="sm" />
        </CitationIcons>
        <CitationTitle>Notion: Team handbook</CitationTitle>
      </Citation>
      <Citation onClick={fn()}>
        <CitationIcons>
          <CitationIndex>3</CitationIndex>
          <FaviconIcon websiteUrl="https://stackoverflow.com" size="sm" />
        </CitationIcons>
        <CitationTitle>Stack Overflow answer</CitationTitle>
      </Citation>
      <Citation onClick={fn()}>
        <CitationIcons>
          <CitationIndex>4</CitationIndex>
          <FaviconIcon websiteUrl="https://www.wikipedia.org" size="sm" />
        </CitationIcons>
        <CitationTitle>Wikipedia article</CitationTitle>
      </Citation>
    </CitationGrid>
  ),
};

/**
 * The `list` variant of **CitationGrid** stacks citations vertically — used
 * for interactive-content references (visualizations, generated files)
 * rather than document sources.
 * @summary Vertical list variant for interactive content.
 */
export const InteractiveContentList: StoryObj = {
  render: () => (
    <CitationGrid variant="list">
      <Citation onClick={fn()}>
        <CitationTitle>Analytics Dashboard</CitationTitle>
        <CitationDescription>Visualization</CitationDescription>
      </Citation>
      <Citation onClick={fn()}>
        <CitationTitle>Customer Data Analysis</CitationTitle>
        <CitationDescription>Interactive Content</CitationDescription>
      </Citation>
      <Citation onClick={fn()}>
        <CitationTitle>Sales Report Generator</CitationTitle>
        <CitationDescription>Visualization</CitationDescription>
      </Citation>
    </CitationGrid>
  ),
};

/**
 * An image attachment still uploading: `isLoading` on **CitationImage**
 * overlays a spinner until the image source is ready.
 * @summary Image citation in its loading state.
 */
export const ImageLoadingState: StoryObj = {
  render: () => (
    <Citation className="w-48">
      <CitationImage
        imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        title="screenshot.png"
        isLoading={true}
      />
    </Citation>
  ),
};
