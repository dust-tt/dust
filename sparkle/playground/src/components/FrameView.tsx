import "@dust-tt/sparkle/styles/allotment.css";

import {
  Button,
  Clipboard,
  ClipboardCheck,
  DotsHorizontal,
  Download01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Link01,
  Maximize01,
  RefreshCw01,
  ReverseLeft,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SpaceClosed,
  Terminal,
  TextArea,
  XClose,
  useCopyToClipboard,
  useSendNotification,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import { useMemo, useState } from "react";

import { mockSpaces } from "../data";

export function FrameView() {
  const randomProjectName = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * mockSpaces.length);
    return mockSpaces[randomIndex]?.name ?? "Pod";
  }, []);
  const [isAddedToProject, setIsAddedToProject] = useState(false);
  const [isCodeViewOpen, setIsCodeViewOpen] = useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const sendNotification = useSendNotification();
  const frameCode = useMemo(
    () => `export default function FrameTemplate() {
  return (
    <main className="frame-root">
      <h1>Frame preview</h1>
      <p>Prototype content rendered in conversation panel.</p>
    </main>
  );
}`,
    []
  );
  const frameCodeRows = useMemo(
    () => Math.max(frameCode.split("\n").length, 1),
    [frameCode]
  );

  const handleAddToProject = () => {
    if (isAddedToProject) {
      return;
    }

    setIsAddedToProject(true);
    sendNotification({
      type: "success",
      title: `Frame added to project ${randomProjectName}`,
    });
  };

  const handleCopyCode = async () => {
    await copyToClipboard(frameCode);
  };

  return (
    <div className="h-screen w-full bg-background">
      <Allotment
        vertical={false}
        proportionalLayout={true}
        defaultSizes={[50, 50]}
        className="h-full w-full flex-1"
      >
        <Allotment.Pane
          minSize={320}
          preferredSize={50}
          className="h-full border-r border"
        >
          <div className="h-full w-full" />
        </Allotment.Pane>

        <Allotment.Pane minSize={320} preferredSize={50} className="h-full">
          <div className="flex h-full flex-col">
            <div className="flex h-14 w-full items-center gap-2 border-b border bg-background px-3">
              <Button icon={RefreshCw01} variant="ghost" tooltip="Refresh" />
              <Button icon={Maximize01} variant="ghost" tooltip="Full screen" />
              <Button icon={Download01} variant="ghost" tooltip="Export" />
              <Button icon={Link01} variant="ghost" tooltip="Share" />
              <div className="flex h-8 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={DotsHorizontal} variant="ghost" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem label="Revert" icon={ReverseLeft} />
                    <DropdownMenuItem
                      label="Code view"
                      icon={Terminal}
                      onClick={() => setIsCodeViewOpen(true)}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel
                      label={
                        isAddedToProject
                          ? `Saved to project ${randomProjectName}`
                          : `Pod: ${randomProjectName}`
                      }
                    />
                    {!isAddedToProject && (
                      <DropdownMenuItem
                        label="Add to project"
                        icon={SpaceClosed}
                        onClick={handleAddToProject}
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1" />
              <Button icon={XClose} variant="ghost" />
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
      <Sheet open={isCodeViewOpen} onOpenChange={setIsCodeViewOpen}>
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>Frame: Code view</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col gap-3 px-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                icon={isCopied ? ClipboardCheck : Clipboard}
                label={isCopied ? "Copied" : "Copy to clipboard"}
                onClick={handleCopyCode}
              />
            </div>
            <TextArea value={frameCode} rows={frameCodeRows} readOnly />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
