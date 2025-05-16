import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";

export function BuilderLayout({
  leftPanel,
  rightPanel,
}: {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full w-full overflow-y-auto px-6">{leftPanel}</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="h-full w-full overflow-y-auto px-6">{rightPanel}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
