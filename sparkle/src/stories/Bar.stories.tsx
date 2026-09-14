import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  Bar,
  BarFooter,
  Button,
  Icon,
  Page,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../index_with_tw_base";
import { Robot } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Navigation/Bar",
  component: Bar,
  parameters: {
    docs: {
      description: {
        component: `A header or footer action bar that anchors a page, panel, or modal with a **title**, optional **description**, and \`leftActions\`/\`rightActions\` slots. Set **position** to \`top\` or \`bottom\`, and **variant** to \`full\` (spans the viewport) or \`default\` (scoped to its parent container, e.g. a resizable panel). **Bar.ButtonBar** provides ready-made action layouts via its own \`variant\` — \`close\`, \`back\`, \`validate\`, or \`conversation\`. **BarFooter** is the dedicated footer counterpart.

**When to use**
- To frame a page or panel with a persistent title and primary actions (save, close, navigate back).
- To pin save/cancel controls to the bottom of a scrolling form or builder.

**Guidelines**
- Use \`variant="default"\` inside panels and sidebars so the bar stays scoped to its container instead of spanning the full width.
- Reach for **Bar.ButtonBar** rather than hand-assembling buttons, so action layouts stay consistent.
- For a floating, transient action surface over content, use a **HoveringBar** instead.`,
      },
    },
  },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Neutral scrollable filler used by the layout stories.
const ScrollingContent = () => (
  <div className="flex flex-col gap-4">
    <div className="h-64 rounded-xl bg-primary-100" />
    <div className="h-64 rounded-xl bg-primary-100" />
    <div className="h-64 rounded-xl bg-primary-100" />
  </div>
);

/**
 * The simplest header: a top bar carrying only the page title.
 *
 * @summary Top bar with a title.
 */
export const Header: Story = {
  args: {
    position: "top",
    title: "Knowledge Base",
  },
};

/**
 * The `description` slot accepts arbitrary content under the title — here a
 * "based on" line mixing text and an icon.
 *
 * @summary Header with a rich description line.
 */
export const HeaderWithDescription: Story = {
  args: {
    position: "top",
    title: "My Custom Skill",
    description: (
      <div className="flex items-center gap-1 text-sm">
        <p className="text-muted-foreground">Based on</p>
        <Icon visual={Robot} size="xs" />
        <p className="text-foreground">Research Assistant</p>
      </div>
    ),
  },
};

/**
 * `Bar.ButtonBar` with `variant="close"` gives a header the standard close
 * affordance for modals and full-screen builders.
 *
 * @summary Header with the ready-made close action.
 */
export const HeaderWithClose: Story = {
  args: {
    position: "top",
    title: "Agent Builder",
    rightActions: <Bar.ButtonBar variant="close" onClose={fn()} />,
  },
};

/**
 * A bottom bar with content in the `rightActions` slot — the base for pinned
 * footer actions.
 *
 * @summary Bottom bar with right-aligned actions.
 */
export const Footer: Story = {
  args: {
    position: "bottom",
    rightActions: <span>Right Actions</span>,
  },
};

/**
 * A save bar: **BarFooter** pinned under scrolling content, combining a
 * secondary close action on the left with the `validate` **ButtonBar** on the
 * right. The typical bottom edge of a form or builder.
 *
 * @summary Pinned save/cancel bar under scrolling content.
 */
export const SaveBar: Story = {
  render: () => (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <Page.Header title="Page Title" />
        <ScrollingContent />
      </div>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
        leftActions={<Button variant="outline" label="Close" onClick={fn()} />}
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            saveButtonProps={{
              size: "sm",
              label: "Save",
              variant: "primary",
              onClick: fn(),
            }}
          />
        }
      />
    </div>
  ),
};

/**
 * `variant="default"` scopes each bar to its parent container instead of the
 * viewport — shown here with header and footer bars inside two resizable
 * panels. Resize the panels to see the bars follow their container.
 *
 * @summary Container-scoped bars inside resizable panels.
 */
export const PanelScopedBars: Story = {
  render: () => (
    <div className="h-full w-full">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="flex h-full flex-col bg-background shadow-sm">
            <Bar
              position="top"
              variant="default"
              title="Agent Builder"
              rightActions={<Bar.ButtonBar variant="close" onClose={fn()} />}
            />
            <div className="flex-1 overflow-y-auto p-4">
              <Page.Header title="Left Panel" />
              <ScrollingContent />
            </div>
            <Bar
              position="bottom"
              variant="default"
              rightActions={
                <Bar.ButtonBar
                  variant="validate"
                  cancelButtonProps={{
                    size: "sm",
                    label: "Cancel",
                    variant: "ghost",
                    onClick: fn(),
                  }}
                  saveButtonProps={{
                    size: "sm",
                    label: "Save",
                    variant: "primary",
                    onClick: fn(),
                  }}
                />
              }
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="flex h-full flex-col bg-background shadow-sm">
            <Bar
              position="top"
              variant="default"
              title="Preview Panel"
              rightActions={<Bar.ButtonBar variant="close" onClose={fn()} />}
            />
            <div className="flex-1 overflow-y-auto p-4">
              <Page.Header title="Right Panel" />
              <ScrollingContent />
            </div>
            <Bar
              position="bottom"
              variant="default"
              rightActions={
                <Bar.ButtonBar
                  variant="validate"
                  saveButtonProps={{
                    size: "sm",
                    label: "Save",
                    variant: "primary",
                    onClick: fn(),
                  }}
                />
              }
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
};
