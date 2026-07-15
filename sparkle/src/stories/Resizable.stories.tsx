import type { Meta } from "@storybook/react";
import React from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { Button } from "../components/Button";
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
- Set \`animateLayoutChanges\` on the group and \`preserveContentLayout\` on a panel when programmatic collapse or expand should not reflow content through intermediate widths.
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

export const AnimatedCollapsible = () => {
  const panelRef = React.useRef<ImperativePanelHandle>(null);
  const [isOpen, setIsOpen] = React.useState(true);

  const togglePanel = () => {
    if (panelRef.current?.isCollapsed()) {
      panelRef.current.expand();
    } else {
      panelRef.current?.collapse();
    }
  };

  return (
    <div className="flex flex-col gap-4 bg-muted-background p-12">
      <Button
        label={isOpen ? "Collapse panel" : "Expand panel"}
        onClick={togglePanel}
        size="sm"
        variant="outline"
      />
      <ResizablePanelGroup
        animateLayoutChanges
        direction="horizontal"
        className="h-64 w-[800px] overflow-hidden rounded-lg border bg-white"
      >
        <ResizablePanel defaultSize={65}>
          <div className="flex h-full items-center justify-center p-6">
            Main content
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle={isOpen} disabled={!isOpen} />
        <ResizablePanel
          ref={panelRef}
          defaultSize={35}
          minSize={20}
          collapsedSize={0}
          collapsible
          preserveContentLayout
          onCollapse={() => setIsOpen(false)}
          onExpand={() => setIsOpen(true)}
          className="overflow-hidden"
        >
          <div className="flex h-full flex-col gap-2 bg-muted-background p-6">
            <span className="font-semibold">Stable panel content</span>
            <span>
              This copy keeps its target layout while the panel animates.
            </span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

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
