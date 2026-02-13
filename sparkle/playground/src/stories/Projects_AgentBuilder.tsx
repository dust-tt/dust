import "@dust-tt/sparkle/styles/allotment.css";

import {
  HistoryIcon,
  Avatar,
  Bar,
  BarChartIcon,
  BoldIcon,
  BoltIcon,
  BookOpenIcon,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Checkbox,
  CheckIcon,
  Chip,
  CodeBlockIcon,
  TagBlockIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EyeIcon,
  EyeSlashIcon,
  HeadingIcon,
  Icon,
  Input,
  ItalicIcon,
  LinkIcon,
  ListCheckIcon,
  ListGroup,
  ListItem,
  ListItemSection,
  ListOrdered2Icon,
  QuoteTextIcon,
  Separator,
  ServerIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  LockIcon,
  SpaceClosedIcon as SpaceCloseIcon,
  SpaceOpenIcon,
  SpacesIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TagIcon,
  TestTubeIcon,
  ToolsIcon,
  UserGroupIcon,
  XMarkIcon,
  SparklesIcon,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { customColors } from "../../../src/lib/colors";

import { InputBar } from "../components/InputBar";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import {
  RichTextArea,
  type RichTextAreaHandle,
} from "../components/RichTextArea";
import {
  getRandomAgents,
  mockInstructionCases,
  mockSpaces,
  mockUsers,
} from "../data";

type MetadataRowProps = {
  label: string;
  action: React.ReactNode;
  description?: React.ReactNode;
  descriptionClassName?: string;
};

const getRandomSubset = <T,>(items: T[], count: number) => {
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, items.length));
};

const insightsTimeRangeOptions = [
  "Last 7 days",
  "Last 14 days",
  "Last 30 days",
  "Last 90 days",
];

const insightsVersionOptions = [
  "v1, Jan 20, 2026, 2:34 PM",
  "v2, Jan 18, 2026, 9:12 AM",
  "v3, Jan 15, 2026, 4:08 PM",
  "v4, Jan 12, 2026, 11:43 AM",
  "v5, Jan 9, 2026, 3:27 PM",
  "v6, Jan 6, 2026, 8:55 AM",
];

const pickProjectsWithVisibility = <T,>(
  openItems: T[],
  restrictedItems: T[],
  totalCount: number
) => {
  const totalAvailable = openItems.length + restrictedItems.length;
  const total = Math.min(totalCount, totalAvailable);

  if (!openItems.length || !restrictedItems.length || total < 2) {
    return getRandomSubset([...openItems, ...restrictedItems], total);
  }

  const maxOpen = Math.min(openItems.length, total - 1);
  const openCount = Math.floor(Math.random() * maxOpen) + 1;
  const restrictedCount = Math.min(restrictedItems.length, total - openCount);

  if (restrictedCount === 0) {
    const adjustedOpen = Math.max(1, total - 1);
    return [
      ...getRandomSubset(openItems, Math.min(openItems.length, adjustedOpen)),
      ...getRandomSubset(restrictedItems, 1),
    ];
  }

  return [
    ...getRandomSubset(openItems, openCount),
    ...getRandomSubset(restrictedItems, restrictedCount),
  ];
};

function MetadataRow({
  label,
  action,
  description,
  descriptionClassName,
}: MetadataRowProps) {
  const descriptionClasses = [
    "s-text-sm s-text-muted-foreground",
    descriptionClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="s-flex s-items-center s-gap-2 s-border-t s-border-border s-py-2">
      <div className="s-w-[80px] s-text-sm s-text-muted-foreground">
        {label}
      </div>
      {action}
      {description ? (
        <div className={descriptionClasses}>{description}</div>
      ) : null}
    </div>
  );
}

export default function AgentBuilder() {
  const isRestrictedSpace = (spaceId: string) =>
    spaceId.charCodeAt(spaceId.length - 1) % 2 === 0;

  const agent = useMemo(() => getRandomAgents(1)[0], []);
  const [agentName, setAgentName] = useState(agent?.name || "");
  const [agentDescription, setAgentDescription] = useState(
    agent?.description || ""
  );
  const nameSuggestions = useMemo(() => {
    const count = Math.floor(Math.random() * 3) + 2;
    return getRandomAgents(count).map((suggestedAgent) => suggestedAgent.name);
  }, []);
  const descriptionSuggestions = useMemo(() => {
    const count = Math.floor(Math.random() * 3) + 2;
    return getRandomAgents(count).map(
      (suggestedAgent) => suggestedAgent.description
    );
  }, []);
  const versionHistoryItems = useMemo(() => {
    const dates = [
      "Jan 20, 2026 at 2:34 PM",
      "Jan 19, 2026 at 11:15 AM",
      "Jan 17, 2026 at 4:52 PM",
      "Jan 15, 2026 at 9:08 AM",
      "Jan 12, 2026 at 3:21 PM",
    ];
    return dates.map((date, index) => ({
      id: `version-${index}`,
      date,
      author: mockUsers[index].fullName,
    }));
  }, []);
  const initialEditorIds = useMemo(() => {
    const count = Math.floor(Math.random() * 5) + 1;
    return mockUsers.slice(0, count).map((user) => user.id);
  }, []);
  const tagItems = useMemo(() => mockSpaces.slice(0, 6), []);
  const selectableSpaces = useMemo(() => {
    const openCount = Math.floor(Math.random() * 7) + 2;
    const restrictedCount = Math.floor(Math.random() * 3) + 1;
    const openCandidates = mockSpaces.filter(
      (space) => !isRestrictedSpace(space.id)
    );
    const restrictedCandidates = mockSpaces.filter((space) =>
      isRestrictedSpace(space.id)
    );
    const openSpaces = getRandomSubset(openCandidates, openCount);
    const restrictedSpaces = getRandomSubset(
      restrictedCandidates,
      restrictedCount
    );
    return [...openSpaces, ...restrictedSpaces];
  }, []);
  const [isSpacesSheetOpen, setIsSpacesSheetOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<{
    id: string;
    date: string;
    author: string;
  } | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set()
  );
  const [insightsSwitch, setInsightsSwitch] = useState<
    "time-range" | "version"
  >("time-range");
  const [insightsTimeRange, setInsightsTimeRange] = useState(
    insightsTimeRangeOptions[0]
  );
  const [insightsVersion, setInsightsVersion] = useState(
    insightsVersionOptions[0]
  );
  const [tagSearch, setTagSearch] = useState("");
  const [spacesProjectsSearch, setSpacesProjectsSearch] = useState("");
  const [selectedEditorIds, setSelectedEditorIds] = useState<Set<string>>(
    () => new Set(initialEditorIds)
  );
  const [isInviteEditorsOpen, setIsInviteEditorsOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [rightPanelRatio, setRightPanelRatio] = useState(0.4);
  const [activeRightPanelTab, setActiveRightPanelTab] = useState("testing");
  const [accessStatus, setAccessStatus] = useState<"published" | "unpublished">(
    "unpublished"
  );
  const richTextAreaRef = useRef<RichTextAreaHandle | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [hasSuggestionsState, setHasSuggestionsState] = useState(false);
  const [isInstructionDirty, setIsInstructionDirty] = useState(false);
  const hasInstructionChangeRef = useRef(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<string>>(() => {
    const defaultSpace = selectableSpaces[0];
    return defaultSpace ? new Set([defaultSpace.id]) : new Set();
  });
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const [draftSpaceIds, setDraftSpaceIds] = useState<Set<string>>(
    () => new Set(selectedSpaceIds)
  );
  const [draftProjectIds, setDraftProjectIds] = useState<Set<string>>(
    () => new Set(selectedProjectIds)
  );
  const [instructionReference, setInstructionReference] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const publishedMetadata = useMemo(() => {
    const daysAgo = Math.floor(Math.random() * 21) + 1;
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const users = Math.floor(Math.random() * 900) + 100;

    return {
      dateLabel: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      usersLabel: new Intl.NumberFormat("en-US").format(users),
    };
  }, []);
  const editorNames = useMemo(() => {
    return mockUsers
      .filter((user) => selectedEditorIds.has(user.id))
      .map((user) => user.fullName || `${user.firstName} ${user.lastName}`);
  }, [selectedEditorIds]);
  const isJoinedProject = (spaceId: string) => {
    const match = spaceId.match(/\d+$/);
    if (!match) {
      return false;
    }
    return Number(match[0]) % 2 === 0;
  };

  const selectedSpaces = useMemo(() => {
    return selectableSpaces.filter((space) => selectedSpaceIds.has(space.id));
  }, [selectableSpaces, selectedSpaceIds]);
  const selectedProjects = useMemo(
    () => mockSpaces.filter((space) => selectedProjectIds.has(space.id)),
    [selectedProjectIds]
  );
  const selectedTagNames = useMemo(() => {
    return tagItems
      .filter((tag) => selectedTagIds.has(tag.id))
      .map((tag) => tag.name);
  }, [tagItems, selectedTagIds]);
  const normalizedTagSearch = tagSearch.trim().toLowerCase();
  const normalizedSpacesProjectsSearch = spacesProjectsSearch
    .trim()
    .toLowerCase();
  const matchesSpacesProjectsSearch = (name: string, description: string) => {
    if (!normalizedSpacesProjectsSearch) {
      return true;
    }
    const normalizedName = name.toLowerCase();
    const normalizedDescription = description.toLowerCase();
    return (
      normalizedName.includes(normalizedSpacesProjectsSearch) ||
      normalizedDescription.includes(normalizedSpacesProjectsSearch)
    );
  };
  const filteredTagItems = useMemo(
    () =>
      tagItems.filter((tag) =>
        tag.name.toLowerCase().includes(normalizedTagSearch)
      ),
    [tagItems, normalizedTagSearch]
  );
  const recommendedTagItems = useMemo(
    () => filteredTagItems.slice(0, 2),
    [filteredTagItems]
  );
  const recommendedTagIds = useMemo(
    () => new Set(recommendedTagItems.map((tag) => tag.id)),
    [recommendedTagItems]
  );
  const remainingTagItems = useMemo(
    () => filteredTagItems.filter((tag) => !recommendedTagIds.has(tag.id)),
    [filteredTagItems, recommendedTagIds]
  );
  const selectableSpaceIds = useMemo(
    () => new Set(selectableSpaces.map((space) => space.id)),
    [selectableSpaces]
  );
  const openSpaces = useMemo(
    () => selectableSpaces.filter((space) => !isRestrictedSpace(space.id)),
    [selectableSpaces]
  );
  const restrictedSpaces = useMemo(
    () => selectableSpaces.filter((space) => isRestrictedSpace(space.id)),
    [selectableSpaces]
  );
  const filteredOpenSpaces = useMemo(
    () =>
      openSpaces.filter((space) =>
        matchesSpacesProjectsSearch(space.name, space.description)
      ),
    [openSpaces, normalizedSpacesProjectsSearch]
  );
  const filteredRestrictedSpaces = useMemo(
    () =>
      restrictedSpaces.filter((space) =>
        matchesSpacesProjectsSearch(space.name, space.description)
      ),
    [restrictedSpaces, normalizedSpacesProjectsSearch]
  );
  const projectSpaces = useMemo(
    () => mockSpaces.filter((space) => !selectableSpaceIds.has(space.id)),
    [selectableSpaceIds]
  );
  const myProjects = useMemo(() => {
    const count = Math.floor(Math.random() * 12) + 12;
    const joined = projectSpaces.filter((space) => isJoinedProject(space.id));
    const openJoined = joined.filter((space) => !isRestrictedSpace(space.id));
    const restrictedJoined = joined.filter((space) =>
      isRestrictedSpace(space.id)
    );
    return pickProjectsWithVisibility(openJoined, restrictedJoined, count);
  }, [projectSpaces]);
  const allProjects = useMemo(() => {
    const count = Math.floor(Math.random() * 27) + 8;
    const notJoined = projectSpaces.filter(
      (space) => !isJoinedProject(space.id)
    );
    const openNotJoined = notJoined.filter(
      (space) => !isRestrictedSpace(space.id)
    );
    const restrictedNotJoined = notJoined.filter((space) =>
      isRestrictedSpace(space.id)
    );
    return pickProjectsWithVisibility(
      openNotJoined,
      restrictedNotJoined,
      count
    );
  }, [projectSpaces]);
  const filteredMyProjects = useMemo(
    () =>
      myProjects.filter((space) =>
        matchesSpacesProjectsSearch(space.name, space.description)
      ),
    [myProjects, normalizedSpacesProjectsSearch]
  );
  const filteredAllProjects = useMemo(
    () =>
      allProjects.filter((space) =>
        matchesSpacesProjectsSearch(space.name, space.description)
      ),
    [allProjects, normalizedSpacesProjectsSearch]
  );
  const selectedEditorIdList = useMemo(
    () => Array.from(selectedEditorIds),
    [selectedEditorIds]
  );

  const allotmentRef = useRef<React.ComponentRef<typeof Allotment>>(null);
  const wasRightPanelOpen = useRef(isRightPanelOpen);

  const handleInstructionTextChange = useCallback(() => {
    if (!hasInstructionChangeRef.current) {
      hasInstructionChangeRef.current = true;
      return;
    }
    setIsInstructionDirty(true);
  }, []);

  const clearInstructionDirty = useCallback(() => {
    setIsInstructionDirty(false);
  }, []);

  useEffect(() => {
    if (wasRightPanelOpen.current === isRightPanelOpen) {
      return;
    }
    wasRightPanelOpen.current = isRightPanelOpen;
    if (!isRightPanelOpen || !allotmentRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      const rightPercent = Math.min(Math.max(rightPanelRatio * 100, 20), 60);
      allotmentRef.current?.resize([100 - rightPercent, rightPercent]);
    });
  }, [isRightPanelOpen, rightPanelRatio]);

  useEffect(() => {
    if (!isSpacesSheetOpen) {
      return;
    }
    setDraftSpaceIds(new Set(selectedSpaceIds));
    setDraftProjectIds(new Set(selectedProjectIds));
  }, [isSpacesSheetOpen, selectedSpaceIds, selectedProjectIds]);

  // Generate diff content for version history preview
  const versionDiffContent = useMemo(() => {
    const baseInstruction =
      mockInstructionCases[
        Math.floor(Math.random() * mockInstructionCases.length)
      ];
    const lines = baseInstruction.split("\n");

    // Diff styles: success for additions, warning for removals
    const additionStyle =
      "s-rounded s-bg-success-100 dark:s-bg-success-100-night s-px-0.5 s-text-success-600 dark:s-text-success-600-night";
    const removalStyle =
      "s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-px-0.5 s-text-warning-600 dark:s-text-warning-600-night s-line-through";

    // Apply some fake diff changes
    const modifiedLines = lines.map((line, index) => {
      // Skip empty lines
      if (!line.trim()) return line;

      // Add some additions (green/success)
      if (index === 3) {
        return `${line} <span data-diff-add class="${additionStyle}">Include response time targets.</span>`;
      }

      // Add some removals (strikethrough/warning)
      if (index === 7 && line.length > 20) {
        const midPoint = Math.floor(line.length / 2);
        const removedPart = line.substring(midPoint - 10, midPoint + 10);
        return (
          line.substring(0, midPoint - 10) +
          `<span data-diff-remove class="${removalStyle}">${removedPart}</span>` +
          line.substring(midPoint + 10)
        );
      }

      // Add a replaced section
      if (index === 12) {
        return `<span data-diff-remove class="${removalStyle}">Old requirement removed.</span> <span data-diff-add class="${additionStyle}">New requirement: prioritize clarity.</span>`;
      }

      return line;
    });

    return `<p>${modifiedLines.join("<br>")}</p>`;
  }, []);

  const toggleDraftSpace = (spaceId: string) => {
    setDraftSpaceIds((prev) => {
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
    setDraftSpaceIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
  };

  const toggleDraftProject = (spaceId: string) => {
    setDraftProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const removeProject = (spaceId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
    setDraftProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
  };

  const handleAskCopilot = (payload: {
    selectedText: string;
    start: number;
    end: number;
  }) => {
    setIsRightPanelOpen(true);
    setActiveRightPanelTab("testing");
    setInstructionReference({
      start: payload.start,
      end: payload.end,
    });
    // The selected text can be used to pre-fill the copilot input or as context
    console.log("Ask Copilot with selected text:", payload.selectedText);
  };

  const checkForSuggestions = () => {
    setHasSuggestionsState(richTextAreaRef.current?.hasSuggestions() ?? false);
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
          <div className="s-heading-base s-text-foreground">{title}</div>
          <div className="s-text-base s-text-muted-foreground">
            {description}
          </div>
        </div>
        {action}
      </div>
    );
  };
  const rightPanelTabs = [
    { value: "testing", label: "Preview", icon: TestTubeIcon },
    { value: "insights", label: "Insights", icon: BarChartIcon },
  ];

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
      <div className="s-flex s-h-full s-w-full">
        <Allotment
          ref={allotmentRef}
          vertical={false}
          proportionalLayout={true}
          defaultSizes={[60, 40]}
          onChange={(sizes) => {
            const rightSize = sizes[1];
            if (typeof rightSize !== "number" || rightSize <= 0) {
              return;
            }
            const total = sizes.reduce(
              (sum, size) => sum + (typeof size === "number" ? size : 0),
              0
            );
            if (total <= 0) {
              return;
            }
            setRightPanelRatio(rightSize / total);
          }}
          className="s-h-full s-w-full s-flex-1"
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
                rightActions={
                  <div className="s-flex s-items-center s-gap-2">
                    {isInstructionDirty ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          label="Cancel"
                          onClick={clearInstructionDirty}
                        />
                        <Button
                          size="sm"
                          variant="highlight"
                          label="Save"
                          onClick={clearInstructionDirty}
                        />
                      </>
                    ) : (
                      <Bar.ButtonBar variant="close" />
                    )}
                  </div>
                }
              />
              <div
                ref={setScrollContainer}
                className="s-flex s-w-full s-flex-1 s-flex-col s-overflow-auto s-px-6"
              >
                <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-12 s-py-6">
                  <div className="s-flex s-flex-1 s-flex-col s-gap-3">
                    <SectionHeader
                      title="Instructions"
                      description="Command or guideline you provide to your agent to direct its responses."
                      action={
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
                      }
                    />
                    <RichTextArea
                      ref={richTextAreaRef}
                      placeholder="Write instructions for your agent..."
                      onAskCopilot={handleAskCopilot}
                      onSuggestionsChange={setHasSuggestionsState}
                      onTextChange={handleInstructionTextChange}
                      scrollContainer={scrollContainer}
                      className="s-min-h-[400px]"
                      topBar={
                        <div className="s-flex s-flex-1 s-flex-wrap s-items-center s-gap-2 s-px-3 s-py-2">
                          <Button
                            icon={HeadingIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Heading"
                          />
                          <Button
                            icon={BoldIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Bold"
                            tooltipShortcut="Cmd+B"
                          />
                          <Button
                            icon={ItalicIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Italic"
                            tooltipShortcut="Cmd+I"
                          />
                          <Separator orientation="vertical" />
                          <Button
                            icon={LinkIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Insert a link"
                          />
                          <Button
                            icon={ListCheckIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Bulleted list"
                          />
                          <Button
                            icon={ListOrdered2Icon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Ordered list"
                          />
                          <Separator orientation="vertical" />
                          <Button
                            icon={QuoteTextIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Quotation block"
                          />
                          <Button
                            icon={CodeBlockIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="Code Block"
                          />
                          <Separator orientation="vertical" />
                          <Button
                            icon={TagBlockIcon}
                            size="icon"
                            variant="ghost-secondary"
                            tooltip="XML tag"
                          />
                          <Separator orientation="vertical" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost-secondary"
                                icon={HistoryIcon}
                                isSelect
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel label="Version history" />
                              {versionHistoryItems.map((item) => (
                                <DropdownMenuItem
                                  key={item.id}
                                  label={item.date}
                                  description={item.author}
                                  onSelect={() => {
                                    window.setTimeout(() => {
                                      setSelectedVersion(item);
                                    }, 0);
                                  }}
                                />
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="s-flex-1" />
                          {hasSuggestionsState && (
                            <div className="s-ml-auto s-flex s-gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                icon={XMarkIcon}
                                label="Reject all"
                                tooltip="Reject all suggestions"
                                onClick={() => {
                                  richTextAreaRef.current?.rejectAllSuggestions();
                                  checkForSuggestions();
                                }}
                              />
                              <Button
                                size="xs"
                                icon={CheckIcon}
                                variant="highlight-secondary"
                                label="Accept all"
                                tooltip="Accept all suggestions"
                                onClick={() => {
                                  richTextAreaRef.current?.acceptAllSuggestions();
                                  checkForSuggestions();
                                }}
                              />
                            </div>
                          )}
                        </div>
                      }
                    />
                  </div>
                  <div className="s-flex s-flex-col s-gap-2">
                    <SectionHeader
                      title="Spaces"
                      description="Set what knowledge and capabilities the agent can access."
                    />
                    <div className="s-flex s-flex-wrap s-gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        label="Manage"
                        icon={SpacesIcon}
                        onClick={() => setIsSpacesSheetOpen(true)}
                      />
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
                              size="sm"
                              color={isRestricted ? "rose" : "primary"}
                              label={space.name}
                              onRemove={() => removeSpace(space.id)}
                            />
                          );
                        })}
                      {selectedProjects.map((project) => {
                        const isRestricted = isRestrictedSpace(project.id);
                        return (
                          <Chip
                            key={project.id}
                            icon={isRestricted ? SpaceCloseIcon : SpaceOpenIcon}
                            size="sm"
                            color={isRestricted ? "rose" : "primary"}
                            label={project.name}
                            onRemove={() => removeProject(project.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="s-flex s-flex-col s-gap-2">
                    <SectionHeader
                      title="Knowledge and capabilities"
                      description="Add knowledge, tools and skills to enhance your agent's
                    abilities."
                      action={<></>}
                    />
                    <div className="s-flex s-flex-wrap s-gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        label="Capabilities"
                        icon={ToolsIcon}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        label="Knowledge"
                        icon={BookOpenIcon}
                      />
                    </div>
                  </div>
                  <div className="s-flex s-flex-col s-gap-2">
                    <SectionHeader
                      title="Triggers"
                      description="Add knowledge, tools and skills to enhance your agent's
                    abilities."
                    />

                    <div className="s-flex s-flex-wrap s-gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        label="Triggers"
                        icon={BoltIcon}
                      />
                    </div>
                  </div>
                  <div className="s-flex s-flex-col">
                    <div className="s-flex s-w-full s-min-w-0 s-flex-1 s-items-end s-gap-2">
                      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-2">
                        <div className="s-heading-base s-text-foreground">
                          Settings
                        </div>
                        <div className="s-flex s-flex-1 s-items-center s-gap-2 s-py-2">
                          <div className="s-w-[80px] s-text-sm s-text-muted-foreground">
                            Handle
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant={"ghost"}
                                icon={SparklesIcon}
                                tooltip="Suggest"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel label="Suggestion" />
                              {nameSuggestions.map((suggestion) => (
                                <DropdownMenuItem
                                  key={suggestion}
                                  label={suggestion}
                                  onSelect={() => setAgentName(suggestion)}
                                />
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Input
                            placeholder="Agent name"
                            containerClassName="s-flex-1"
                            value={agentName}
                            onChange={(event) =>
                              setAgentName(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <Avatar
                        size="lg"
                        name={agent?.name || "Agent"}
                        emoji={agent?.emoji}
                        backgroundColor={agent?.backgroundColor}
                        isRounded={false}
                        className="s-mb-2"
                      />
                    </div>
                    <div className="s-flex s-items-center s-gap-2 s-border-t s-border-border s-py-2">
                      <div className="s-w-[80px] s-text-sm s-text-muted-foreground">
                        Description
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant={"ghost"}
                            icon={SparklesIcon}
                            tooltip="Suggest"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel label="Suggestion" />
                          {descriptionSuggestions.map((suggestion) => (
                            <DropdownMenuItem
                              key={suggestion}
                              label={suggestion}
                              onSelect={() => setAgentDescription(suggestion)}
                            />
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Input
                        containerClassName="s-flex-1"
                        placeholder="Short description"
                        value={agentDescription}
                        onChange={(event) =>
                          setAgentDescription(event.target.value)
                        }
                      />
                    </div>
                    <MetadataRow
                      label="Access"
                      action={
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              label={
                                accessStatus === "published"
                                  ? "Published"
                                  : "Unpublished"
                              }
                              icon={
                                accessStatus === "published"
                                  ? EyeIcon
                                  : EyeSlashIcon
                              }
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              label="Unpublished"
                              icon={EyeSlashIcon}
                              onSelect={() => setAccessStatus("unpublished")}
                            />
                            <DropdownMenuItem
                              label="Published"
                              icon={EyeIcon}
                              onSelect={() => setAccessStatus("published")}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                      description={
                        accessStatus === "published" ? (
                          <>
                            Since {publishedMetadata.dateLabel}
                            {", "}
                            {publishedMetadata.usersLabel} users last 30 days
                          </>
                        ) : null
                      }
                    />
                    <MetadataRow
                      label="Edition"
                      action={
                        <Button
                          size="sm"
                          variant="ghost"
                          label="Manage"
                          icon={UserGroupIcon}
                          onClick={() => setIsInviteEditorsOpen(true)}
                        />
                      }
                      description={editorNames.join(", ")}
                      descriptionClassName="s-flex-1 s-min-w-0 s-truncate"
                    />
                    <MetadataRow
                      label="Tags"
                      action={
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              label="Manage"
                              icon={TagIcon}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuSearchbar
                              placeholder="Search tags"
                              name="tag-search"
                              value={tagSearch}
                              onChange={(value) => setTagSearch(value)}
                              autoFocus
                            />
                            <DropdownMenuLabel label="Recommended" />
                            {recommendedTagItems.map((tag) => (
                              <DropdownMenuCheckboxItem
                                key={tag.id}
                                label={tag.name}
                                checked={selectedTagIds.has(tag.id)}
                                onCheckedChange={() => {
                                  setSelectedTagIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(tag.id)) {
                                      next.delete(tag.id);
                                    } else {
                                      next.add(tag.id);
                                    }
                                    return next;
                                  });
                                }}
                              />
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel label="All tags" />
                            {remainingTagItems.map((tag) => (
                              <DropdownMenuCheckboxItem
                                key={tag.id}
                                label={tag.name}
                                checked={selectedTagIds.has(tag.id)}
                                onCheckedChange={() => {
                                  setSelectedTagIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(tag.id)) {
                                      next.delete(tag.id);
                                    } else {
                                      next.add(tag.id);
                                    }
                                    return next;
                                  });
                                }}
                              />
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                      description={selectedTagNames.join(", ")}
                      descriptionClassName="s-flex-1 s-min-w-0 s-truncate"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Allotment.Pane>

          {isRightPanelOpen && (
            <Allotment.Pane
              minSize={280}
              preferredSize={40}
              className="s-flex s-h-full s-flex-col s-overflow-hidden"
            >
              <Tabs
                value={activeRightPanelTab}
                onValueChange={setActiveRightPanelTab}
                className="s-flex s-min-h-0 s-flex-1 s-flex-col s-pt-3"
              >
                <TabsList className="s-pl-2 s-pr-6">
                  <Button
                    icon={SidebarRightCloseIcon}
                    variant="ghost-secondary"
                    size="sm"
                    onClick={() => setIsRightPanelOpen(false)}
                  />
                  {rightPanelTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      tooltip={tab.label}
                      label={tab.label}
                      icon={tab.icon}
                    />
                  ))}
                </TabsList>
                <TabsContent
                  value="testing"
                  className="s-flex s-min-h-0 s-flex-1 s-flex-col"
                >
                  <div className="s-flex s-flex-1 s-items-end s-justify-center s-p-4">
                    <div className="s-flex s-w-full s-flex-col s-items-end s-gap-3">
                      <InputBar
                        placeholder="Test your agent"
                        instructionReference={instructionReference}
                        className="s-shadow-lg"
                        onInstructionInserted={() =>
                          setInstructionReference(null)
                        }
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent
                  value="insights"
                  className="s-flex s-flex-1 s-flex-col s-overflow-y-auto"
                >
                  <div className="s-flex s-flex-col s-gap-4 s-p-4">
                    <div className="s-flex s-flex-wrap s-items-center s-gap-2">
                      <h3 className="s-heading-lg s-flex-1">Inisghts</h3>
                      <ButtonsSwitchList
                        size="xs"
                        defaultValue={insightsSwitch}
                        onValueChange={(value) => {
                          setInsightsSwitch(
                            value === "version" ? "version" : "time-range"
                          );
                        }}
                      >
                        <ButtonsSwitch
                          value="time-range"
                          label="By Timerange"
                        />
                        <ButtonsSwitch value="version" label="By version" />
                      </ButtonsSwitchList>
                    </div>
                    <Tabs
                      defaultValue="agent-analytics"
                      className="s-flex s-flex-col s-gap-2"
                    >
                      <TabsList>
                        <TabsTrigger
                          value="agent-analytics"
                          label="Analytics"
                        />
                        <TabsTrigger value="user-feedback" label="Feedback" />
                        <div className="s-flex-1" />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="xs"
                              variant="outline"
                              isSelect
                              label={
                                insightsSwitch === "time-range"
                                  ? insightsTimeRange
                                  : insightsVersion
                              }
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel
                              label={
                                insightsSwitch === "time-range"
                                  ? "Time range"
                                  : "Version"
                              }
                            />
                            {(insightsSwitch === "time-range"
                              ? insightsTimeRangeOptions
                              : insightsVersionOptions
                            ).map((item) => (
                              <DropdownMenuItem
                                key={item}
                                label={item}
                                onSelect={() => {
                                  if (insightsSwitch === "time-range") {
                                    setInsightsTimeRange(item);
                                  } else {
                                    setInsightsVersion(item);
                                  }
                                }}
                              />
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TabsList>
                    </Tabs>
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
          )}
        </Allotment>
        {!isRightPanelOpen && (
          <div className="s-flex s-h-full s-w-14 s-flex-col s-items-center s-gap-2 s-py-3">
            <Button
              icon={SidebarRightOpenIcon}
              size="sm"
              variant="ghost-secondary"
              onClick={() => setIsRightPanelOpen(true)}
            />
            {rightPanelTabs.map((tab) => (
              <Button
                key={tab.value}
                icon={tab.icon}
                size="sm"
                variant="ghost-secondary"
                onClick={() => {
                  setActiveRightPanelTab(tab.value);
                  setIsRightPanelOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>
      <Sheet open={isSpacesSheetOpen} onOpenChange={setIsSpacesSheetOpen}>
        <SheetContent size="md" side="right">
          <SheetHeader>
            <SheetTitle>Select spaces</SheetTitle>
            <SheetDescription>
              Choose the spaces you want the agent to have access to.
            </SheetDescription>
            <Input
              placeholder="Search spaces and projects"
              value={spacesProjectsSearch}
              onChange={(event) => setSpacesProjectsSearch(event.target.value)}
              className="s-mt-4"
            />
          </SheetHeader>
          <SheetContainer isListSelector>
            <div className="s-flex s-flex-col s-gap-4">
              <div className="s-flex s-flex-col">
                <ListItemSection size="sm">Spaces</ListItemSection>
                <ListGroup>
                  {[...filteredOpenSpaces, ...filteredRestrictedSpaces].map(
                    (space) => {
                      const isSelected = draftSpaceIds.has(space.id);
                      return (
                        <ListItem
                          key={space.id}
                          itemsAlignment="center"
                          onClick={() => toggleDraftSpace(space.id)}
                          className={
                            isSelected
                              ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                              : ""
                          }
                        >
                          <Icon
                            visual={
                              isRestrictedSpace(space.id)
                                ? LockIcon
                                : ServerIcon
                            }
                            size="sm"
                          />
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
                                toggleDraftSpace(space.id);
                              }
                            }}
                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                            }}
                          />
                        </ListItem>
                      );
                    }
                  )}
                </ListGroup>
                <ListItemSection size="sm">My projects</ListItemSection>
                <ListGroup>
                  {filteredMyProjects.map((space) => {
                    const isSelected = draftProjectIds.has(space.id);
                    return (
                      <ListItem
                        key={space.id}
                        itemsAlignment="center"
                        onClick={() => toggleDraftProject(space.id)}
                        className={
                          isSelected
                            ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                            : ""
                        }
                      >
                        <Icon
                          visual={
                            isRestrictedSpace(space.id)
                              ? SpaceCloseIcon
                              : SpaceOpenIcon
                          }
                          size="sm"
                        />
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
                              toggleDraftProject(space.id);
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
                <ListItemSection size="sm">All projects</ListItemSection>
                <ListGroup>
                  {filteredAllProjects.map((space) => {
                    const isSelected = draftProjectIds.has(space.id);
                    return (
                      <ListItem
                        key={space.id}
                        itemsAlignment="center"
                        onClick={() => toggleDraftProject(space.id)}
                        className={
                          isSelected
                            ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                            : ""
                        }
                      >
                        <Icon
                          visual={
                            isRestrictedSpace(space.id)
                              ? SpaceCloseIcon
                              : SpaceOpenIcon
                          }
                          size="sm"
                        />
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
                              toggleDraftProject(space.id);
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
              onClick: () => {
                setSelectedSpaceIds(new Set(draftSpaceIds));
                setSelectedProjectIds(new Set(draftProjectIds));
                setIsSpacesSheetOpen(false);
              },
            }}
          />
        </SheetContent>
      </Sheet>

      <InviteUsersScreen
        isOpen={isInviteEditorsOpen}
        spaceId={null}
        title="Select editors"
        actionLabel="Save"
        initialSelectedUserIds={selectedEditorIdList}
        initialEditorUserIds={selectedEditorIdList}
        hasMultipleSelect={true}
        onClose={() => setIsInviteEditorsOpen(false)}
        onInvite={(_selectedUserIds, editorUserIds) => {
          setSelectedEditorIds(new Set(editorUserIds));
          setIsInviteEditorsOpen(false);
        }}
      />

      <Sheet
        open={selectedVersion !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVersion(null);
          }
        }}
      >
        <SheetContent
          size="xl"
          side="right"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (document.activeElement as HTMLElement)?.blur();
          }}
        >
          <SheetHeader>
            <SheetTitle>{selectedVersion?.date ?? "Version"}</SheetTitle>
            <SheetDescription>
              By:{" "}
              <span className="s-heading-ws">
                {selectedVersion?.author ?? "Unknown"}
              </span>
            </SheetDescription>
          </SheetHeader>
          <SheetContainer>
            <div className="s-tiems-end s-flex s-flex-1 s-flex-col s-gap-3 s-overflow-auto">
              <div className="s-flex s-w-full s-justify-end">
                <Button
                  label="Restore this version"
                  icon={HistoryIcon}
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVersion(null)}
                />
              </div>

              <RichTextArea
                readOnly
                defaultValue={versionDiffContent}
                className="s-min-h-[400px]"
              />
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
