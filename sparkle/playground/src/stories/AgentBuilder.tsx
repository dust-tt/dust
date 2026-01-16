import "@dust-tt/sparkle/styles/allotment.css";

import {
  Avatar,
  Bar,
  Button,
  Checkbox,
  Chip,
  ConversationContainer,
  ConversationMessage,
  Icon,
  ToolsIcon,
  BookOpenIcon,
  DropdownMenu,
  DropdownMenuContent,
  SpacesIcon,
  SpaceOpenIcon,
  SpaceClosedIcon as SpaceCloseIcon,
  UserGroupIcon,
  BoltIcon,
  EyeIcon,
  EyeSlashIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  Input,
  ListGroup,
  ListItemSection,
  ListItem,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  ArrowCircleIcon,
  TabsList,
  TabsTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import { useMemo, useState, type MouseEvent } from "react";

import { customColors } from "@sparkle/lib/colors";

import { getRandomAgents, getRandomConversations, mockSpaces } from "../data";
import { InputBar } from "../components/InputBar";

export default function AgentBuilder() {
  const agent = useMemo(() => getRandomAgents(1)[0], []);
  const historyItems = useMemo(() => getRandomConversations(5), []);
  const tagItems = useMemo(() => mockSpaces.slice(0, 6), []);
  const selectableSpaces = useMemo(() => mockSpaces.slice(0, 12), []);
  const [isSpacesSheetOpen, setIsSpacesSheetOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<string>>(() => {
    const defaultSpace = mockSpaces[0];
    return defaultSpace ? new Set([defaultSpace.id]) : new Set();
  });
  const isRestrictedSpace = (spaceId: string) =>
    spaceId.charCodeAt(spaceId.length - 1) % 2 === 0;

  const selectedSpaces = useMemo(() => {
    return selectableSpaces.filter((space) => selectedSpaceIds.has(space.id));
  }, [selectableSpaces, selectedSpaceIds]);
  const openSpaces = useMemo(
    () => selectableSpaces.filter((space) => !isRestrictedSpace(space.id)),
    [selectableSpaces]
  );
  const restrictedSpaces = useMemo(
    () => selectableSpaces.filter((space) => isRestrictedSpace(space.id)),
    [selectableSpaces]
  );
  const copilotConversationItems = useMemo(
    () => [
      {
        id: "intro-agent",
        type: "agent" as const,
        name: "Copilot",
        timestamp: "Just now",
        content:
          "I can help you shape this agent. Share the role, audience, and any tools it should use.",
      },
      {
        id: "intro-user",
        type: "user" as const,
        name: "You",
        timestamp: "Just now",
        content:
          "I need an agent that drafts onboarding emails and keeps tone friendly but concise.",
      },
      {
        id: "agent-clarify",
        type: "agent" as const,
        name: "Copilot",
        timestamp: "Just now",
        content:
          "Got it. Should it personalize by role and include links to docs? Also, any brand voice guidelines?",
      },
    ],
    []
  );

  const toggleSpace = (spaceId: string) => {
    setSelectedSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const removeSpace = (spaceId: string) => {
    setSelectedSpaceIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
  };

  const SectionHeader = ({
    title,
    description,
    action,
  }: {
    title: string;
    description: string;
    action?: React.ReactNode;
  }) => {
    return (
      <div className="s-flex s-w-full s-items-end s-gap-2">
        <div className="s-flex s-flex-1 s-flex-col">
          <div className="s-heading-lg s-text-foreground">{title}</div>
          <div className="s-text-sm s-text-muted-foreground">{description}</div>
        </div>
        {action}
      </div>
    );
  };

  return (
    <div className="s-h-screen s-w-full s-bg-background">
      <style>{`
        :root {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[100]}, ${customColors.blue[400]}, ${customColors.gray[100]});
          --separator-border: transparent;
          --sash-size: 8px;
          --sash-hover-size: 2px;
        }
        .s-dark {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[900]}, ${customColors.blue[600]}, ${customColors.gray[900]});
          --separator-border: transparent;
        }
        .allotment-module_splitView__L-yRc.allotment-module_separatorBorder__x-rDS
          > .allotment-module_splitViewContainer__rQnVa
          > .allotment-module_splitViewView__MGZ6O:not(:first-child)::before {
          width: 1px;
          transition: width 200ms, background-color 200ms;
        }
      `}</style>
      <Allotment
        vertical={false}
        proportionalLayout={true}
        defaultSizes={[60, 40]}
        className="s-h-full s-w-full"
      >
        <Allotment.Pane
          minSize={360}
          preferredSize={60}
          className="s-flex s-h-full s-flex-col s-overflow-hidden s-border-r s-border-border"
        >
          <div className="s-flex s-h-full s-flex-col">
            <Bar
              position="top"
              variant="default"
              size="sm"
              title={agent?.name || "Agent"}
              leftActions={
                <Avatar
                  size="sm"
                  name={agent?.name || "Agent"}
                  emoji={agent?.emoji}
                  backgroundColor={agent?.backgroundColor}
                  isRounded={false}
                />
              }
              rightActions={<Bar.ButtonBar variant="close" />}
            />
            <div className="s-flex s-w-full s-flex-1 s-flex-col s-overflow-auto s-px-6">
              <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-8 s-py-6">
                <div className="s-flex s-flex-1 s-flex-col s-gap-3">
                  <SectionHeader
                    title="Instructions"
                    description="Command or guideline you provide to your agent to direct its responses."
                    action={
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              label="Advanced"
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem label="No advanced options" />
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={ArrowCircleIcon}
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {historyItems.map((item) => (
                              <DropdownMenuItem
                                key={item.id}
                                label={item.title}
                              />
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    }
                  />
                  <TextArea
                    resize="vertical"
                    style={{ minHeight: "500px" }}
                    placeholder="Write instructions for your agent..."
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-2">
                  <SectionHeader
                    title="Spaces"
                    description="Set what knowledge and capabilities the agent can access."
                    action={
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          label="Select"
                          icon={SpacesIcon}
                          onClick={() => setIsSpacesSheetOpen(true)}
                        />
                      </>
                    }
                  />
                  {selectedSpaces.length > 0 ? (
                    <div className="s-flex s-flex-wrap s-gap-2">
                      {[...selectedSpaces]
                        .sort(
                          (a, b) =>
                            Number(isRestrictedSpace(a.id)) -
                            Number(isRestrictedSpace(b.id))
                        )
                        .map((space) => {
                          const isRestricted = isRestrictedSpace(space.id);
                          return (
                            <Chip
                              key={space.id}
                              icon={
                                isRestricted ? SpaceCloseIcon : SpaceOpenIcon
                              }
                              size="xs"
                              color={isRestricted ? "rose" : "golden"}
                              label={space.name}
                              onRemove={() => removeSpace(space.id)}
                            />
                          );
                        })}
                    </div>
                  ) : (
                    <div className="s-copy-sm s-text-muted-foreground">
                      No spaces selected.
                    </div>
                  )}
                </div>

                <div className="s-flex s-flex-col s-gap-2">
                  <SectionHeader
                    title="Knowledge and capabilities"
                    description="Add knowledge, tools and skills to enhance your agent's
                    abilities."
                    action={
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          label="Capabilities"
                          icon={ToolsIcon}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          label="knowledge"
                          icon={BookOpenIcon}
                        />
                      </>
                    }
                  />

                  <EmptyCTA
                    action={
                      <div className="s-flex s-gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          label="Capabilities"
                          icon={ToolsIcon}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          label="knowledge"
                          icon={BookOpenIcon}
                        />
                      </div>
                    }
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-2">
                  <SectionHeader
                    title="Triggers"
                    description="Add knowledge, tools and skills to enhance your agent's
                    abilities."
                    action={
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          label="Triggers"
                          icon={BoltIcon}
                        />
                      </>
                    }
                  />

                  <EmptyCTA
                    action={
                      <div className="s-flex s-gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          label="Triggers"
                          icon={BoltIcon}
                        />
                      </div>
                    }
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-3">
                  <div className="s-heading-xl s-text-foreground">Settings</div>
                  <div className="s-flex s-items-center s-gap-3">
                    <div className="s-flex s-flex-1 s-flex-col s-gap-2">
                      <div className="s-heading-sm s-text-foreground">
                        Handle
                      </div>
                      <Input
                        placeholder="Agent name"
                        className="s-flex-1"
                        defaultValue={agent?.name || ""}
                      />
                    </div>
                    <Avatar
                      size="lg"
                      name={agent?.name || "Agent"}
                      emoji={agent?.emoji}
                      backgroundColor={agent?.backgroundColor}
                      isRounded={false}
                    />
                  </div>
                  <div className="s-flex s-flex-col s-gap-2">
                    <div className="s-heading-sm s-text-foreground">
                      Description
                    </div>
                    <Input placeholder="Description" />
                  </div>
                  <div className="s-flex s-items-center s-border-y s-border-border s-py-2">
                    <div className="s-mr-8 s-flex s-items-center s-gap-2">
                      <div className="s-heading-sm s-text-foreground">
                        Access
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            label="Unpublished"
                            is
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="Unpublished"
                            icon={EyeSlashIcon}
                          />
                          <DropdownMenuItem label="Published" icon={EyeIcon} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="s-flex s-items-center s-gap-2">
                      <div className="s-heading-sm s-text-foreground">
                        Edition
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        label="Editors"
                        icon={UserGroupIcon}
                      />
                    </div>
                  </div>
                  <div className="s-flex s-items-center s-gap-2">
                    <div className="s-heading-sm s-text-foreground">Tags</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          label="Select tags"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {tagItems.map((tag) => (
                          <DropdownMenuItem key={tag.id} label={tag.name} />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={280}
          preferredSize={40}
          className="s-flex s-h-full s-flex-col s-overflow-hidden"
        >
          <Tabs
            defaultValue="copilot"
            className="s-flex s-min-h-0 s-flex-1 s-flex-col s-pt-3"
          >
            <TabsList className="s-px-6">
              <TabsTrigger value="copilot" label="Copilot" />
              <TabsTrigger value="testing" label="Testing" />
              <TabsTrigger value="insights" label="Insights" />
              <TabsTrigger value="feedback" label="Feedback" />
            </TabsList>
            <TabsContent
              value="copilot"
              className="s-flex s-min-h-0 s-flex-1 s-flex-col"
            >
              <div className="s-flex s-min-h-0 s-flex-1 s-overflow-y-auto s-px-6 s-py-6">
                <ConversationContainer>
                  {copilotConversationItems.map((item) => (
                    <ConversationMessage
                      key={item.id}
                      type={item.type}
                      name={item.name}
                      timestamp={item.timestamp}
                    >
                      {item.content}
                    </ConversationMessage>
                  ))}
                </ConversationContainer>
              </div>
              <div className="s-border-t s-border-border s-px-6 s-py-4">
                <div className="s-flex s-justify-center">
                  <InputBar placeholder="Ask Copilot to help build your agent" />
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="testing"
              className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
            >
              <div className="s-copy-sm s-text-muted-foreground">
                Testing panel content.
              </div>
            </TabsContent>
            <TabsContent
              value="insights"
              className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
            >
              <div className="s-copy-sm s-text-muted-foreground">
                Insights panel content.
              </div>
            </TabsContent>
            <TabsContent
              value="feedback"
              className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
            >
              <div className="s-copy-sm s-text-muted-foreground">
                Feedback panel content.
              </div>
            </TabsContent>
          </Tabs>
        </Allotment.Pane>
      </Allotment>
      <Sheet open={isSpacesSheetOpen} onOpenChange={setIsSpacesSheetOpen}>
        <SheetContent size="md" side="right">
          <SheetHeader>
            <SheetTitle>Select spaces</SheetTitle>
            <SheetDescription>
              Choose the spaces you want the agent to have access to.
            </SheetDescription>
          </SheetHeader>
          <SheetContainer isListSelector>
            <div className="s-flex s-flex-col">
              <ListItemSection size="sm">Open</ListItemSection>
              <ListGroup>
                {openSpaces.map((space) => {
                  const isSelected = selectedSpaceIds.has(space.id);
                  return (
                    <ListItem
                      key={space.id}
                      interactive={true}
                      itemsAlignment="center"
                      onClick={() => toggleSpace(space.id)}
                      className={
                        isSelected
                          ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                          : ""
                      }
                    >
                      <Icon visual={SpaceOpenIcon} size="sm" />
                      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                        <span className="s-heading-sm s-truncate s-text-foreground">
                          {space.name}
                        </span>
                        <span className="s-truncate s-text-xs s-text-muted-foreground">
                          {space.description}
                        </span>
                      </div>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(
                          checked: boolean | "indeterminate"
                        ) => {
                          if (checked !== "indeterminate") {
                            toggleSpace(space.id);
                          }
                        }}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                        }}
                      />
                    </ListItem>
                  );
                })}
              </ListGroup>
              <ListItemSection size="sm">Restricted</ListItemSection>
              <ListGroup>
                {restrictedSpaces.map((space) => {
                  const isSelected = selectedSpaceIds.has(space.id);
                  return (
                    <ListItem
                      key={space.id}
                      interactive={true}
                      itemsAlignment="center"
                      onClick={() => toggleSpace(space.id)}
                      className={
                        isSelected
                          ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                          : ""
                      }
                    >
                      <Icon visual={SpaceCloseIcon} size="sm" />
                      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                        <span className="s-truncate s-text-sm s-font-medium s-text-foreground">
                          {space.name}
                        </span>
                        <span className="s-truncate s-text-xs s-text-muted-foreground">
                          {space.description}
                        </span>
                      </div>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(
                          checked: boolean | "indeterminate"
                        ) => {
                          if (checked !== "indeterminate") {
                            toggleSpace(space.id);
                          }
                        }}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                        }}
                      />
                    </ListItem>
                  );
                })}
              </ListGroup>
            </div>
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: () => setIsSpacesSheetOpen(false),
            }}
            rightButtonProps={{
              label: "Save",
              variant: "highlight",
              onClick: () => setIsSpacesSheetOpen(false),
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
