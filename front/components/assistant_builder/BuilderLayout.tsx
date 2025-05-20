import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";

interface BuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export function BuilderLayout({ leftPanel, rightPanel }: BuilderLayoutProps) {
  return (
    <div className="flex h-full w-full">
      <ResizablePanelGroup
        autoSaveId="assistant-builder-layout"
        direction="horizontal"
        className="h-full w-full"
      >
        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="h-full w-full overflow-y-auto px-6">{leftPanel}</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full w-full overflow-y-auto px-6">{rightPanel}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
