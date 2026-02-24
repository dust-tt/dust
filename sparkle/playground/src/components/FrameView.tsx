import "@dust-tt/sparkle/styles/allotment.css";

import {
  ArrowCircleIcon,
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  CommandLineIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FullscreenIcon,
  HistoryIcon,
  MoreIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SpaceOpenIcon,
  TextArea,
  XMarkIcon,
  useCopyToClipboard,
  useSendNotification,
  ArrowGoBackIcon,
  LinkIcon,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import { useMemo, useState } from "react";

import { mockSpaces } from "../data";

export function FrameView() {
  const randomProjectName = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * mockSpaces.length);
    return mockSpaces[randomIndex]?.name ?? "Project";
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
    <div className="s-h-screen s-w-full s-bg-background">
      <Allotment
        vertical={false}
        proportionalLayout={true}
        defaultSizes={[50, 50]}
        className="s-h-full s-w-full s-flex-1"
      >
        <Allotment.Pane
          minSize={320}
          preferredSize={50}
          className="s-h-full s-border-r s-border-border"
        >
          <div className="s-h-full s-w-full" />
        </Allotment.Pane>

        <Allotment.Pane minSize={320} preferredSize={50} className="s-h-full">
          <div className="s-flex s-h-full s-flex-col">
            <div className="s-flex s-h-14 s-w-full s-items-center s-gap-2 s-border-b s-border-border s-bg-background s-px-3">
              <Button
                icon={ArrowCircleIcon}
                variant="ghost"
                tooltip="Refresh"
              />
              <Button
                icon={FullscreenIcon}
                variant="ghost"
                tooltip="Full screen"
              />
              <Button
                icon={ArrowDownOnSquareIcon}
                variant="ghost"
                tooltip="Export"
              />
              <Button icon={LinkIcon} variant="ghost" tooltip="Share" />
              <div className="s-flex s-h-8 s-items-center s-gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={MoreIcon} variant="ghost" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem label="Revert" icon={ArrowGoBackIcon} />
                    <DropdownMenuItem
                      label="Code view"
                      icon={CommandLineIcon}
                      onClick={() => setIsCodeViewOpen(true)}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel
                      label={
                        isAddedToProject
                          ? `Saved to project ${randomProjectName}`
                          : `Project: ${randomProjectName}`
                      }
                    />
                    {!isAddedToProject && (
                      <DropdownMenuItem
                        label="Add to project"
                        icon={SpaceOpenIcon}
                        onClick={handleAddToProject}
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="s-flex-1" />
              <Button icon={XMarkIcon} variant="ghost" />
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
      <Sheet open={isCodeViewOpen} onOpenChange={setIsCodeViewOpen}>
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>Frame: Code view</SheetTitle>
          </SheetHeader>
          <div className="s-flex s-h-full s-flex-col s-gap-3 s-px-4">
            <div className="s-flex s-justify-end">
              <Button
                size="sm"
                variant="outline"
                icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
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
