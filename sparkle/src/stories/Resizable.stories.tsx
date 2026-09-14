import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../components/Resizable";

const meta = {
  title: "Layout/Resizable",
  parameters: {
    docs: {
      description: {
        component: `User-resizable split layouts built on react-resizable-panels. Wrap panels in a **ResizablePanelGroup** with a **direction** (\`horizontal\` / \`vertical\`), size each region with **ResizablePanel** (\`defaultSize\`), and insert a draggable **ResizableHandle** between them. Groups can be nested to create grids of resizable regions.

**When to use**
- For split views the user should rebalance, such as a sidebar plus main area or a list/detail pane.

**Guidelines**
- Give each **ResizablePanel** a \`defaultSize\` (percentages within a group) so the initial split is predictable.
- Nest a **ResizablePanelGroup** inside a panel to combine horizontal and vertical splits.`,
      },
    },
  },
} satisfies Meta;

export default meta;

/**
 * A horizontal two-panel split whose right panel nests a vertical
 * **ResizablePanelGroup**, showing how groups compose into grids of
 * resizable regions.
 * @summary Horizontal split with a nested vertical group.
 */
export const HorizontalSplit: StoryObj = {
  render: () => (
    <ResizablePanelGroup
      direction="horizontal"
      className="max-w-md rounded-lg border bg-white md:min-w-[450px]"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-[200px] items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={25}>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Two</span>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={75}>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Three</span>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

/**
 * A vertical split (`direction="vertical"`) giving a resizable header region
 * above the main content, sized 25 / 75 by default.
 * @summary Vertical split with a header panel.
 */
export const VerticalSplitWithHeader: StoryObj = {
  render: () => (
    <ResizablePanelGroup
      direction="vertical"
      className="min-h-[200px] max-w-md rounded-lg border bg-white md:min-w-[450px]"
    >
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Header</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={75}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

/**
 * Passing **withHandle** to **ResizableHandle** renders a visible grip on the
 * divider, making the resize affordance discoverable — useful for
 * sidebar-style splits.
 * @summary Handle with a visible grip indicator.
 */
export const HandleWithGrip: StoryObj = {
  render: () => (
    <ResizablePanelGroup
      direction="horizontal"
      className="min-h-[200px] max-w-md rounded-lg border bg-white md:min-w-[450px]"
    >
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center">
          <span className="font-semibold">Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
