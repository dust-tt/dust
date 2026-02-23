import "@dust-tt/sparkle/styles/allotment.css";

import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  Button,
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
  MoreIcon,
  PlayIcon,
  SpaceOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import { useMemo } from "react";

import { mockSpaces } from "../data";

export function FrameView() {
  const randomProjectName = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * mockSpaces.length);
    return mockSpaces[randomIndex]?.name ?? "Project";
  }, []);

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
              <div className="s-flex s-h-full s-flex-1 s-items-end">
                <Tabs defaultValue="play">
                  <TabsList border={false}>
                    <TabsTrigger value="play" icon={PlayIcon} />
                    <TabsTrigger value="command" icon={CommandLineIcon} />
                  </TabsList>
                </Tabs>
              </div>
              <div className="s-flex-1" />
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
                      label={`Project: ${randomProjectName}`}
                    />
                    <DropdownMenuItem
                      label="Save to project"
                      icon={SpaceOpenIcon}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button icon={XMarkIcon} variant="ghost" />
              </div>
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
