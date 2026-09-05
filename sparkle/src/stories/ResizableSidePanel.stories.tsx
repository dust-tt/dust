import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, ResizableSidePanel } from "../index_with_tw_base";

const meta = {
  title: "Layout/ResizableSidePanel",
  component: ResizableSidePanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Docks a resizable, collapsible panel to the right of the main content — outside whatever container the content itself uses, the way a navigation sidebar sits outside it.

**When to use**
- For a side surface that should span the full height of the app and keep its own width, such as a conversation opened alongside a page.

**Guidelines**
- Drag the divider to resize; the panel animates when it opens and closes.
- Keep the panel mounted and drive **isOpen**, so its content keeps state while collapsed.
- Pass page content as **children** and the panel body as **panel** — this component is pure layout and owns neither.`,
      },
    },
  },
} satisfies Meta<typeof ResizableSidePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const MainContent = () => (
  <div className="h-full overflow-y-auto p-8">
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Page content</h2>
      <p className="text-muted-foreground">
        This column keeps its own centered container. The panel docks beside it
        rather than inside it.
      </p>
      <div className="h-40 rounded-lg border border-border bg-muted-background" />
      <div className="h-40 rounded-lg border border-border bg-muted-background" />
    </div>
  </div>
);

const PanelBody = () => (
  <div className="flex h-full w-full flex-col overflow-hidden">
    <div className="flex items-center border-b border-border px-4 py-3">
      <span className="text-sm font-semibold text-foreground">
        Ask @analyst
      </span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col justify-between">
      <div className="p-4 text-sm text-muted-foreground">
        Panel content goes here.
      </div>
      <div className="p-2">
        <div className="h-12 rounded-2xl border border-border bg-muted-background" />
      </div>
    </div>
  </div>
);

/**
 * The panel docked open beside the page. Drag the divider to resize it.
 *
 * @summary Panel open, divider draggable.
 */
export const Open: Story = {
  args: {
    isOpen: true,
    panel: <PanelBody />,
    children: <MainContent />,
  },
  render: (args) => (
    <div className="h-[560px] w-full border border-border">
      <ResizableSidePanel {...args} />
    </div>
  ),
};

/**
 * Below the md breakpoint a docked column would be unusably narrow, so the
 * panel covers the content instead of splitting the row. Use Storybook's
 * viewport switcher (or narrow the window) to see it take over.
 *
 * @summary Full-screen takeover on small viewports.
 */
export const SmallViewport: Story = {
  args: {
    isOpen: true,
    panel: <PanelBody />,
    children: <MainContent />,
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: (args) => (
    <div className="h-[560px] w-full border border-border">
      <ResizableSidePanel {...args} />
    </div>
  ),
};
