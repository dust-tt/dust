import type { Meta } from "@storybook/react";
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

export const TooltipLongLabel = () => (
  <div className="flex flex-col bg-muted-background p-12">
    <div className="flex h-[600px] w-[800px] flex-col gap-16 p-12">
      <ResizableDemo />
    </div>
    <div className="flex h-[600px] w-[800px] flex-col gap-16 p-12">
      <ResizableHeaderDemo />
    </div>
    <div className="flex h-[600px] w-[800px] flex-col gap-16 p-12">
      <ResizableGrabDemo />
    </div>
  </div>
);
export function ResizableDemo() {
  return (
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
  );
}

export function ResizableHeaderDemo() {
  return (
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
  );
}

export function ResizableGrabDemo() {
  return (
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
  );
}
