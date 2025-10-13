import type { Meta } from "@storybook/react";
import React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../components/Resizable";

const meta = {
  title: "Layouts/Resizable",
} satisfies Meta;

export default meta;

export const TooltipLongLabel = () => (
  <div className="s-flex s-flex-col s-bg-muted-background s-p-12">
    <div className="s-flex s-h-[600px] s-w-[800px] s-flex-col s-gap-16 s-p-12">
      <ResizableDemo />
    </div>
    <div className="s-flex s-h-[600px] s-w-[800px] s-flex-col s-gap-16 s-p-12">
      <ResizableHeaderDemo />
    </div>
    <div className="s-flex s-h-[600px] s-w-[800px] s-flex-col s-gap-16 s-p-12">
      <ResizableGrabDemo />
    </div>
  </div>
);
export function ResizableDemo() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="s-max-w-md s-rounded-lg s-border s-bg-white md:s-min-w-[450px]"
    >
      <ResizablePanel defaultSize={50}>
        <div className="s-flex s-h-[200px] s-items-center s-justify-center s-p-6">
          <span className="s-font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={25}>
            <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
              <span className="s-font-semibold">Two</span>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={75}>
            <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
              <span className="s-font-semibold">Three</span>
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
      className="s-min-h-[200px] s-max-w-md s-rounded-lg s-border s-bg-white md:s-min-w-[450px]"
    >
      <ResizablePanel defaultSize={25}>
        <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
          <span className="s-font-semibold">Header</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={75}>
        <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
          <span className="s-font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function ResizableGrabDemo() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="s-min-h-[200px] s-max-w-md s-rounded-lg s-border s-bg-white md:s-min-w-[450px]"
    >
      <ResizablePanel defaultSize={25}>
        <div className="s-flex s-h-full s-items-center s-justify-center">
          <span className="s-font-semibold">Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        <div className="s-flex s-h-full s-items-center s-justify-center s-p-6">
          <span className="s-font-semibold">Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
