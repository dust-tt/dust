import "@dust-tt/sparkle/styles/allotment.css";

import {
  ArrowCircleIcon,
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  Button,
  ButtonGroup,
  CommandLineIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FullscreenIcon,
  HistoryIcon,
  MoreIcon,
  PlayIcon,
  SpaceOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  XMarkIcon,
  Separator,
  useSendNotification,
  ArrowGoBackIcon,
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
  const sendNotification = useSendNotification();

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
              <div className="s-flex s-h-full s-items-end">
                <Tabs defaultValue="play">
                  <TabsList border={false}>
                    <TabsTrigger value="play" icon={PlayIcon} />
                    <TabsTrigger value="command" icon={CommandLineIcon} />
                  </TabsList>
                </Tabs>
              </div>
              <div className="s-flex-1" />
              <Button
                icon={FullscreenIcon}
                variant="ghost"
                tooltip="Full screen"
              />
              <Button
                icon={ArrowGoBackIcon}
                variant="ghost"
                tooltip="Back to a previous version"
              />
              <Button icon={ArrowCircleIcon} variant="ghost" tooltip="Reload" />
              <div className="s-flex s-h-8 s-items-center s-gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={MoreIcon} variant="ghost" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        label="Export"
                        icon={ArrowDownOnSquareIcon}
                      />
                      <DropdownMenuSubContent>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger label="PDF" />
                          <DropdownMenuSubContent>
                            <DropdownMenuItem label="Portrait" />
                            <DropdownMenuItem label="Landscape" />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem label="PNG" />
                        <DropdownMenuItem label="Template" />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      label="Share"
                      icon={ArrowUpOnSquareIcon}
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
    </div>
  );
}
