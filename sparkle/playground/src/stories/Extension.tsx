import {
  ArrowUpIcon,
  AssistantCard,
  AttachmentIcon,
  Avatar,
  BarHeader,
  Button,
  ButtonGroup,
  CameraIcon,
  CardGrid,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  cn,
  ConversationMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  GlobeAltIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Icon,
  LightModeIcon,
  LinkIcon,
  LogoutIcon,
  MenuIcon,
  MicIcon,
  MoreIcon,
  NavigationList,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListLabel,
  Notification,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  SearchInput,
  SpaceOpenIcon,
  ToolsIcon,
  TrashIcon,
  UserGroupIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type Agent,
  type Conversation,
  type Message,
  mockAgents,
  mockConversations,
  mockSpaces,
  mockUsers,
  type Space,
  type User,
} from "../data";

const GREETINGS = [
  "Hi, [Name]",
  "Hey [Name]! 👋",
  "Good to see you, [Name]! 😊",
  "What's up, [Name]? 🙌",
  "How's it going, [Name]? 🚀",
  "Welcome, [Name]! 🎉",
];

function getRandomGreetingForName(firstName: string) {
  const randomIndex = Math.floor(Math.random() * GREETINGS.length);
  return GREETINGS[randomIndex].replace("[Name]", firstName);
}

type EnrichedConversation = Conversation & { messages: Message[] };

const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 720;

const mockProjects: Space[] = [
  { id: "project-1", name: "Company Space", description: "Company-wide space" },
  { id: "project-2", name: "Product Space", description: "Product team space" },
  {
    id: "project-3",
    name: "Design Space",
    description: "Everything related to design at Dust",
  },
  {
    id: "project-4",
    name: "Collaboration Project",
    description: "Cross-team collaboration",
  },
];

const mockWorkspaces = [
  { id: "dust", name: "Dust" },
  { id: "dust-test", name: "dust-test" },
  { id: "dust_demo", name: "dust_demo" },
  { id: "pinotalexandre", name: "pinotalexandre" },
];

function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function generateRandomMessages(
  conversationId: string,
  currentUser: User
): Message[] {
  const messages: Message[] = [];
  const exchangeCount = Math.floor(Math.random() * 4) + 2; // 2-5 exchanges (human + agent pairs)
  const now = new Date();

  // Pick one agent for this conversation
  const agent = mockAgents[Math.floor(Math.random() * mockAgents.length)];

  const sampleAgentMessages = [
    "I've created a professional skills blog cover with a modern, premium design.",
    "Based on the analysis, I recommend focusing on the three high-impact features.",
    "The current design of user messages in conversation can be improved: Can we put a max width on the user message component only?",
    "I can help you with that. Let me analyze the data first.",
    "Here's what I found based on your request.",
    "I've completed the task. Let me know if you need any adjustments.",
    "Looking at the data, here are my recommendations.",
  ];

  const sampleUserMessages = [
    "@helper Generate a frames",
    "@helper Read the webpage",
    "Can you help me with this task?",
    "What do you think about this approach?",
    "Thanks! Can you also check this?",
    "Perfect, one more thing...",
    "Could you explain that in more detail?",
  ];

  for (let i = 0; i < exchangeCount; i++) {
    const baseTime = now.getTime() - (exchangeCount - i) * 10 * 60000;
    
    // Human message first
    const userTimestamp = new Date(baseTime);
    const isFirstUserMessage = i === 0;
    
    messages.push({
      id: `${conversationId}-msg-${i * 2}`,
      content: sampleUserMessages[i % sampleUserMessages.length],
      timestamp: userTimestamp,
      ownerId: currentUser.id,
      ownerType: "user",
      type: "user",
    });
    
    // Then agent response
    const agentTimestamp = new Date(baseTime + 2 * 60000); // 2 minutes later
    const isFirstAgentMessage = i === 0;
    const isLastAgentMessage = i === exchangeCount - 1;
    
    messages.push({
      id: `${conversationId}-msg-${i * 2 + 1}`,
      content: sampleAgentMessages[i % sampleAgentMessages.length],
      timestamp: agentTimestamp,
      ownerId: agent.id,
      ownerType: "agent",
      type: "agent",
      hasFrame: isFirstAgentMessage,
      hasToolConfirmation: isLastAgentMessage,
      frameTitle: isFirstAgentMessage ? "SkillsBlogCover.tsx" : undefined,
      frameType: isFirstAgentMessage ? "Frames" : undefined,
      toolName: isLastAgentMessage ? "Read Web Page" : undefined,
      toolDomain: isLastAgentMessage ? "dust.tt" : undefined,
    });
  }

  return messages;
}

function groupConversationsByDate(conversations: EnrichedConversation[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups = {
    today: [] as EnrichedConversation[],
    yesterday: [] as EnrichedConversation[],
    lastWeek: [] as EnrichedConversation[],
  };

  conversations.forEach((conv) => {
    const updatedAt = conv.updatedAt;
    if (updatedAt >= today) {
      groups.today.push(conv);
    } else if (updatedAt >= yesterday) {
      groups.yesterday.push(conv);
    } else if (updatedAt >= lastWeek) {
      groups.lastWeek.push(conv);
    }
  });

  return groups;
}

declare module "../data" {
  interface Message {
    hasFrame?: boolean;
    hasToolConfirmation?: boolean;
    frameTitle?: string;
    frameType?: string;
    toolName?: string;
    toolDomain?: string;
  }
}

type ViewType = "home" | "conversation" | "project" | "projectConversation" | "newProjectConversation";

const viewDepth: Record<ViewType, number> = {
  home: 0,
  conversation: 1,
  project: 1,
  projectConversation: 2,
  newProjectConversation: 2,
};

// Family-inspired transition presets - smooth, snappy, delightful
// Custom ease curve that feels natural (fast start, soft landing)
const familyEase = [0.32, 0.72, 0, 1] as [number, number, number, number];

// Sidebar: smooth spring for natural feel
const sidebarTransition = { 
  type: "spring" as const, 
  stiffness: 300, 
  damping: 30,
  mass: 0.8
};

// Page transitions: quick fade with subtle movement
const pageTransition = {
  opacity: { duration: 0.2, ease: familyEase },
  x: { type: "spring" as const, stiffness: 300, damping: 30 }
};

// Overlay: simple fade
const overlayTransition = { duration: 0.25, ease: familyEase };

function ExtensionPanel() {
  const [currentUser] = useState<User>(() => mockUsers[0]);
  const [view, setView] = useState<ViewType>("home");
  const [transitionState, setTransitionState] = useState<"idle" | "push" | "pop">("idle");
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    mockWorkspaces[0].id
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [greeting, setGreeting] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [projectSearchText, setProjectSearchText] = useState("");
  
  const navigateTo = useCallback((newView: ViewType) => {
    if (newView === view || isAnimating) return;
    
    const isPush = viewDepth[newView] > viewDepth[view];
    setTransitionState(isPush ? "push" : "pop");
    setIsAnimating(true);
    setView(newView);
    
    // Reset after animation completes
    setTimeout(() => {
      setTransitionState("idle");
      setIsAnimating(false);
    }, 300);
  }, [view, isAnimating]);
  
  const sendNotification = useSendNotification();
  const showNotification = (message: string) => {
    sendNotification({
      title: message,
      type: "success",
    });
  };

  const [selectedProject, setSelectedProject] = useState<Space | null>(null);

  useEffect(() => {
    setGreeting(getRandomGreetingForName(currentUser.fullName.split(" ")[0]));
  }, [currentUser]);

  const [availableConversations] = useState<
    EnrichedConversation[]
  >(() => {
    return mockConversations.slice(0, 15).map((conv) => ({
      ...conv,
      messages: generateRandomMessages(conv.id, currentUser),
    }));
  });

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [panelWidth, setPanelWidth] = useState<number>(576);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const groupedConversations = useMemo(
    () => groupConversationsByDate(availableConversations),
    [availableConversations]
  );

  const projectConversations = useMemo(() => {
    if (!selectedProject) return [];
    
    const seed = selectedProject.id.charCodeAt(selectedProject.id.length - 1);
    const count = (seed % 5) + 4;
    const projectConvs: EnrichedConversation[] = [];
    const now = new Date();
    
    const projectTitles = [
      `${selectedProject.name.replace(" Space", "")} - Shiba Inu Dogs`,
      "Navigating the Quirks of Shiba Inu in the Workplace",
      "Shiba Inu Insights: Enhancing Team Dynamics",
      "The Shiba Inu Guide: Fostering a Positive Work Culture",
      "Weekly Sync - Project Update",
      "Design Review Session",
      "Feedback Discussion",
      "Planning Meeting",
    ];
    
    for (let i = 0; i < count; i++) {
      const daysAgo = i === 0 ? 0 : Math.floor((seed + i) % 7);
      const hoursAgo = (seed * i) % 12;
      
      const updatedAt = new Date(now);
      updatedAt.setDate(updatedAt.getDate() - daysAgo);
      updatedAt.setHours(updatedAt.getHours() - hoursAgo);
      
      const createdAt = new Date(updatedAt);
      createdAt.setDate(createdAt.getDate() - 1);
      
      const userIndex = (seed + i) % mockUsers.length;
      const title = projectTitles[i % projectTitles.length];
      
      projectConvs.push({
        id: `${selectedProject.id}-conv-${i}`,
        title,
        createdAt,
        updatedAt,
        userParticipants: [mockUsers[userIndex].id],
        agentParticipants: [mockAgents[i % mockAgents.length].id],
        messages: generateRandomMessages(`${selectedProject.id}-conv-${i}`, currentUser),
        description: `@deep-dive I'd like you to search and add information about ${title.toLowerCase()}...`,
        spaceId: selectedProject.id,
      });
    }
    
    return projectConvs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [selectedProject, currentUser]);

  const groupedProjectConversations = useMemo(
    () => groupConversationsByDate(projectConversations),
    [projectConversations]
  );

  const selectedConversation = useMemo(
    () => {
      // First check in available conversations
      const found = availableConversations.find((conv) => conv.id === selectedConversationId);
      if (found) return found;
      // Then check in project conversations
      return projectConversations.find((conv) => conv.id === selectedConversationId);
    },
    [availableConversations, selectedConversationId, projectConversations]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = Math.min(
      MAX_PANEL_WIDTH,
      Math.max(MIN_PANEL_WIDTH, dragRef.current.startWidth + delta)
    );
    setPanelWidth(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const handleBack = () => {
    if (view === "projectConversation" && selectedProject) {
      navigateTo("project");
      setSelectedConversationId(null);
    } else if (view === "project") {
      navigateTo("home");
      setSelectedProject(null);
    } else if (view === "conversation") {
      navigateTo("home");
      setSelectedConversationId(null);
    }
  };

  const handleConversationSelect = (conv: EnrichedConversation) => {
    setSelectedConversationId(conv.id);
    navigateTo("conversation");
    setSidebarOpen(false);
  };

  const handleProjectSelect = (project: Space) => {
    setSelectedProject(project);
    navigateTo("project");
    setSidebarOpen(false);
  };

  const handleProjectConversationSelect = (conv: EnrichedConversation) => {
    setSelectedConversationId(conv.id);
    navigateTo("projectConversation");
  };

  const ProfileDropdown = () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="s-cursor-pointer s-outline-none">
            <Avatar
            size="sm"
              name={currentUser.fullName}
              visual={currentUser.portrait}
              isRounded={true}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="s-w-56" align="end">
          <DropdownMenuLabel label="Workspace" />
          <DropdownMenuRadioGroup value={selectedWorkspaceId}>
            {mockWorkspaces.map((workspace) => (
              <DropdownMenuRadioItem
                key={workspace.id}
                onClick={() => setSelectedWorkspaceId(workspace.id)}
                label={workspace.name}
                value={workspace.id}
              />
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Preferences" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Theme" icon={LightModeIcon} />
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme}>
                <DropdownMenuRadioItem
                  value="light"
                  label="Light"
                  onClick={() => setTheme("light")}
                />
                <DropdownMenuRadioItem
                  value="dark"
                  label="Dark"
                  onClick={() => setTheme("dark")}
                />
                <DropdownMenuRadioItem
                  value="system"
                  label="System"
                  onClick={() => setTheme("system")}
                />
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem icon={LogoutIcon} label="Sign out" />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const AgentPickerDropdown = () => {
    const [agentSearchText, setAgentSearchText] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const filteredAgents = useMemo(() => {
      if (!agentSearchText.trim()) {
        return mockAgents;
      }
      const lowerSearch = agentSearchText.toLowerCase();
      return mockAgents.filter((agent) =>
        agent.name.toLowerCase().includes(lowerSearch)
      );
    }, [agentSearchText]);

    return (
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            setAgentSearchText("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button icon={RobotIcon} variant="ghost-secondary" size="mini" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="s-h-80 s-w-72"
          align="start"
          dropdownHeaders={
            <>
              <div className="s-px-2 s-py-2">
                <SearchInput
                  name="search-agents"
                  placeholder="Search agents"
                  value={agentSearchText}
                  onChange={setAgentSearchText}
                />
              </div>
              <DropdownMenuSeparator />
            </>
          }
        >
          {filteredAgents.length > 0 ? (
            filteredAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                icon={() => (
                  <Avatar
                    size="xs"
                    name={agent.name}
                    emoji={agent.emoji}
                    backgroundColor={agent.backgroundColor}
                  />
                )}
                label={`@${agent.name.toLowerCase()}`}
                description={agent.description}
                truncateText
                onClick={() => {
                  showNotification(`Selected @${agent.name.toLowerCase()}`);
                  setAgentSearchText("");
                  setIsOpen(false);
                }}
              />
            ))
          ) : (
            <div className="s-flex s-items-center s-justify-center s-py-4 s-text-sm s-text-muted-foreground">
              No agents found
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const ExtensionInputBar = ({ placeholder }: { placeholder?: string }) => {
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsFocused(false);
        }
      };
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, []);

  return (
      <div
        ref={containerRef}
        onClick={() => setIsFocused(true)}
        className={cn(
          "s-flex s-h-[120px] s-w-full s-flex-col s-items-start s-justify-between s-self-stretch s-p-4",
          "s-rounded-3xl s-border s-bg-primary-50 s-transition-all",
          isFocused
            ? "s-border-highlight-300 s-ring-2 s-ring-highlight-300/50"
            : "s-border-border"
        )}
      >
        <textarea
          ref={textareaRef}
          placeholder={placeholder || "Ask a question or get some @help"}
          onFocus={() => setIsFocused(true)}
          className="s-placeholder:s-text-muted-foreground s-w-full s-flex-1 s-resize-none s-border-0 s-bg-transparent s-px-1 s-pt-1 s-text-foreground s-outline-none focus:s-outline-none focus:s-ring-0"
          rows={1}
        />
        <div className="s-flex s-w-full s-items-center s-gap-3">
          <AgentPickerDropdown />
          <Button icon={ToolsIcon} variant="ghost-secondary" size="mini" />
          <div className="s-grow" />
          <Button icon={MicIcon} variant="ghost-secondary" size="mini" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button icon={PlusIcon} variant="ghost-secondary" size="mini" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="s-w-64">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger 
                  icon={AttachmentIcon} 
                  label="Attach knowledge"
                />
                <DropdownMenuSubContent>
                  <DropdownMenuItem icon={AttachmentIcon} label="From workspace" />
                  <DropdownMenuItem icon={AttachmentIcon} label="Upload file" />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem icon={GlobeAltIcon} label="Attach page content" />
              <DropdownMenuItem icon={CameraIcon} label="Take screenshot" />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button icon={ArrowUpIcon} variant="highlight" size="mini" />
        </div>
      </div>
    );
  };

  const FavoritesGrid = () => {
    const favorites = mockAgents.slice(0, 4);
    return (
      <div className="s-w-full">
        <Page.SectionHeader title="Favorites" />
        <CardGrid className="s-grid-cols-2">
          {favorites.map((agent) => (
            <AssistantCard
              key={agent.id}
              title={`@${agent.name.toLowerCase().replace(/\s+/g, "")}`}
              pictureUrl=""
              description={agent.description}
              subtitle="By: Editors"
              onClick={() => {}}
            />
          ))}
        </CardGrid>
      </div>
    );
  };

  const FrameButton = ({
    title,
    type,
  }: {
    title: string;
    type: string;
  }) => (
    <a
      href="https://dust.tt"
                  target="_blank"
      rel="noopener noreferrer"
      className="s-flex s-w-full s-flex-col s-gap-1 s-rounded-lg s-bg-muted-background s-p-3 s-transition-colors hover:s-bg-muted-background/80 dark:s-bg-muted-background-night"
    >
      <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
        {title}
      </span>
      <div className="s-flex s-items-center s-gap-1">
        <Icon visual={ExternalLinkIcon} size="xs" className="s-text-muted-foreground" />
        <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
          {type}
        </span>
      </div>
    </a>
  );

  const ToolConfirmation = ({
    toolName,
    domain,
  }: {
    toolName: string;
    domain: string;
  }) => {
    const [accepted, setAccepted] = useState(false);

    if (accepted) {
      return null;
    }

    return (
      <div className="s-mt-4 s-rounded-2xl s-border s-border-border s-bg-muted-background s-p-4 dark:s-border-border-night dark:s-bg-muted-background-night">
        <div className="s-flex s-flex-col s-gap-4">
          <div className="s-flex s-items-center s-gap-2">
            <Avatar icon={GlobeAltIcon} size="sm" />
            <span className="s-text-base s-font-medium s-text-foreground dark:s-text-foreground-night">
              Allow "{toolName}" on {domain}
            </span>
          </div>
          <div className="s-flex s-justify-between">
            <Button variant="outline" size="sm" label="Decline" />
            <Button
              variant="highlight" 
              size="sm" 
              label="Accept" 
              onClick={() => {
                setAccepted(true);
                showNotification(`Allowed "${toolName}" on ${domain}`);
              }}
                />
              </div>
        </div>
      </div>
    );
  };

  const AgentMessageButtons = () => {
    const [thumbState, setThumbState] = useState<"up" | "down" | null>(null);

    return (
      <div className="s-flex s-items-center s-gap-3">
        <ButtonGroup
          variant="outline"
          items={[
            {
              type: "button",
              props: {
                tooltip: "I found this helpful",
                variant: thumbState === "up" ? "primary" : "ghost-secondary",
                size: "xs",
                onClick: () => setThumbState(thumbState === "up" ? null : "up"),
                icon: HandThumbUpIcon,
              },
            },
            {
              type: "button",
              props: {
                tooltip: "Report an issue",
                variant: thumbState === "down" ? "primary" : "ghost-secondary",
                size: "xs",
                onClick: () => setThumbState(thumbState === "down" ? null : "down"),
                icon: HandThumbDownIcon,
              },
            },
          ]}
        />
        <ButtonGroup
          variant="outline"
          items={[
            {
              type: "button",
              props: {
                tooltip: "Copy to clipboard",
                variant: "ghost-secondary",
                size: "xs",
                icon: ClipboardIcon,
                onClick: () => showNotification("Copied to clipboard"),
              },
            },
            {
              type: "button",
              props: {
                tooltip: "More options",
                variant: "ghost-secondary",
                size: "xs",
                icon: MoreIcon,
              },
            },
          ]}
        />
      </div>
    );
  };

  const getParticipantAvatars = (conv: EnrichedConversation) => {
    const participants: Array<{ name: string; visual?: string; emoji?: string; backgroundColor?: string }> = [];
    
    conv.userParticipants.slice(0, 3).forEach((userId) => {
      const user = mockUsers.find((u) => u.id === userId);
      if (user) {
        participants.push({ name: user.fullName, visual: user.portrait });
      }
    });
    
    return participants;
  };

  const Sidebar = () => (
    <motion.div
      className="s-absolute s-inset-y-0 s-left-0 s-z-50 s-flex s-w-72 s-flex-col s-overflow-hidden s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night"
      initial={false}
      animate={{ x: sidebarOpen ? 0 : "-100%" }}
      transition={sidebarTransition}
    >
      <motion.div 
        className="s-flex s-h-full s-flex-col"
        initial={false}
        animate={{ 
          opacity: sidebarOpen ? 1 : 0,
          x: sidebarOpen ? 0 : -8
        }}
        transition={{ 
          opacity: { duration: 0.15, ease: familyEase, delay: sidebarOpen ? 0.05 : 0 },
          x: { duration: 0.2, ease: familyEase, delay: sidebarOpen ? 0.05 : 0 }
        }}
      >
        <div className="s-flex s-items-center s-gap-2 s-p-3">
          <SearchInput
            name="sidebar-search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search"
            className="s-flex-1"
          />
              <Button
            variant="primary"
            size="sm"
            icon={ChatBubbleLeftRightIcon}
            label="New"
            onClick={() => {
              setSelectedConversationId(null);
              setSelectedProject(null);
              navigateTo("home");
              setSidebarOpen(false);
            }}
          />
        </div>

        <ScrollArea className="s-flex-1">
          <NavigationList className="s-px-2">
            <NavigationListLabel label="Projects" variant="primary" />
            {mockProjects.map((project) => {
              const hasNotification =
                project.id === "project-3" && Math.random() > 0.5;
              return (
                <NavigationListItem
                  key={project.id}
                  label={project.name}
                  icon={SpaceOpenIcon}
                  selected={selectedProject?.id === project.id}
                  hasNotification={hasNotification}
                  onClick={() => handleProjectSelect(project)}
                />
              );
            })}

            {groupedConversations.today.length > 0 && (
              <>
                <NavigationListCompactLabel label="TODAY" />
                {groupedConversations.today.slice(0, 3).map((conv) => {
                  const hasUnread = Math.random() > 0.7;
                  return (
                    <NavigationListItem
                      key={conv.id}
                      label={conv.title}
                      selected={selectedConversationId === conv.id}
                      hasNotification={hasUnread}
                      onClick={() => handleConversationSelect(conv)}
                    />
                  );
                })}
              </>
            )}

            {groupedConversations.yesterday.length > 0 && (
              <>
                <NavigationListCompactLabel label="YESTERDAY" />
                {groupedConversations.yesterday.slice(0, 3).map((conv) => (
                  <NavigationListItem
                    key={conv.id}
                    label={conv.title}
                    selected={selectedConversationId === conv.id}
                    onClick={() => handleConversationSelect(conv)}
                  />
                ))}
              </>
            )}

            {groupedConversations.lastWeek.length > 0 && (
              <>
                <NavigationListCompactLabel label="LAST WEEK" />
                {groupedConversations.lastWeek.slice(0, 3).map((conv) => (
                  <NavigationListItem
                    key={conv.id}
                    label={conv.title}
                    selected={selectedConversationId === conv.id}
                    onClick={() => handleConversationSelect(conv)}
                  />
                ))}
              </>
            )}
          </NavigationList>
        </ScrollArea>
      </motion.div>
    </motion.div>
  );

  const HomeView = () => (
    <div className="s-flex s-h-full s-flex-col s-px-4">
      <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-pb-8">
        <h1 className="s-heading-2xl s-text-center s-text-foreground dark:s-text-foreground-night">
          {greeting || `Hi, ${currentUser.fullName.split(" ")[0]}`}
        </h1>
                </div>

      <div className="s-pb-4">
                <FavoritesGrid />
              </div>

      <div className="s-shrink-0 s-pb-4">
        <ExtensionInputBar />
            </div>
    </div>
  );

  const conversationScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedConversation && conversationScrollRef.current) {
      // Wait for page transition to complete, then scroll smoothly
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          if (conversationScrollRef.current) {
            conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
          }
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [selectedConversation]);

  const ConversationView = () => {
    if (!selectedConversation) return null;

    return (
          <div className="s-flex s-h-full s-flex-col">
        <ScrollArea className="s-flex-1 s-px-4" viewportRef={conversationScrollRef}>
          <div className="s-flex s-w-full s-flex-col s-gap-8 s-py-6">
                {selectedConversation.messages.map((message) => {
              const isUser = message.ownerType === "user";
              const owner = isUser
                ? mockUsers.find((u) => u.id === message.ownerId)
                : mockAgents.find((a) => a.id === message.ownerId);

              if (!owner) return null;

              const name = isUser
                ? (owner as User).fullName
                : (owner as Agent).name;
              const pictureUrl = isUser ? (owner as User).portrait : undefined;

              // Agent messages take full width, user messages are right-aligned with max-width
              const messageMaxWidth = isUser ? "s-max-w-[85%]" : "s-w-full";

                  return (
                    <div
                      key={message.id}
                  className={cn(
                    "s-flex s-w-full",
                    isUser ? "s-justify-end" : "s-justify-start"
                  )}
                    >
                  <div className={messageMaxWidth}>
                        <ConversationMessage
                      type={isUser ? "user" : "agent"}
                          name={name}
                      pictureUrl={pictureUrl}
                          timestamp={formatTimestamp(message.timestamp)}
                      buttons={!isUser ? [<AgentMessageButtons key="feedback" />] : undefined}
                    >
                      {message.hasFrame && message.frameTitle && (
                        <FrameButton
                          title={message.frameTitle}
                          type={message.frameType || ""}
                        />
                      )}
                      <div className="s-mt-1">{message.content}</div>
                      {message.hasToolConfirmation &&
                        message.toolName &&
                        message.toolDomain && (
                          <ToolConfirmation
                            toolName={message.toolName}
                            domain={message.toolDomain}
                          />
                        )}
                        </ConversationMessage>
                      </div>
                    </div>
                  );
                })}
              </div>
        </ScrollArea>

        <div className="s-shrink-0 s-p-4">
          <ExtensionInputBar />
            </div>
      </div>
    );
  };

  const ProjectView = () => {
    if (!selectedProject) return null;

    const memberCount = Math.floor(Math.random() * 100) + 20;

    return (
      <div className="s-flex s-h-full s-flex-col s-px-4">
        <div className="s-flex s-items-start s-justify-between s-py-4">
          <div className="s-flex s-flex-col s-gap-1">
            <div className="s-flex s-items-center s-gap-2">
              <Icon visual={SpaceOpenIcon} size="sm" />
              <span className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                {selectedProject.name.replace(" Space", "")}
              </span>
              <div className="s-flex s-items-center s-gap-1 s-text-muted-foreground">
                <Icon visual={UserGroupIcon} size="xs" />
                <span className="s-text-sm">{memberCount}</span>
              </div>
            </div>
            <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {selectedProject.description}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={ChatBubbleLeftRightIcon}
            label="New"
            onClick={() => {
              setSelectedConversationId(null);
              navigateTo("newProjectConversation");
            }}
          />
        </div>

        <div className="s-pb-4">
          <SearchInput
            name="project-search"
            value={projectSearchText}
            onChange={setProjectSearchText}
            placeholder="Search"
            className="s-w-full"
          />
        </div>

        <ScrollArea className="s-flex-1">
          <div className="s-flex s-flex-col s-gap-1">
            {[
              { label: "Today", convs: groupedProjectConversations.today },
              { label: "Yesterday", convs: groupedProjectConversations.yesterday },
              { label: "Last Week", convs: groupedProjectConversations.lastWeek },
            ].map(({ label, convs }) =>
              convs.length > 0 ? (
                <div key={label}>
                  <NavigationListCompactLabel label={label} />
                  {convs.map((conv, index) => {
                    const creator = mockUsers.find((u) =>
                      conv.userParticipants.includes(u.id)
                    );
                    // Use deterministic unread based on index
                    const hasUnread = index === 0 && label === "Today";
                    const newCount = hasUnread ? 3 : 0;

                    return (
                      <div
                        key={conv.id}
                        className="s-flex s-cursor-pointer s-items-center s-gap-3 s-border-b s-border-border/50 s-px-1 s-py-3 s-transition-colors last:s-border-b-0 hover:s-bg-muted-background/50 dark:s-border-border-night/50"
                        onClick={() => handleProjectConversationSelect(conv)}
                      >
                        {creator && (
                          <Avatar
                            size="sm"
                            name={creator.fullName}
                            visual={creator.portrait}
                            isRounded={true}
                          />
                        )}
                        <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-0.5">
                          <div className="s-flex s-items-center s-gap-2">
                            <span className="s-truncate s-font-medium s-text-foreground dark:s-text-foreground-night">
                              {creator?.fullName || "Unknown"} - {conv.title.split(" - ").slice(-1)[0]}
                            </span>
                            {hasUnread && (
                              <span className="s-h-2 s-w-2 s-flex-shrink-0 s-rounded-full s-bg-highlight-500" />
                            )}
            </div>
                          <span className="s-truncate s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                            {conv.description?.slice(0, 45)}...
                          </span>
          </div>
                        {newCount > 0 && (
                          <span className="s-flex-shrink-0 s-text-sm s-text-muted-foreground">
                            {newCount} new
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null
            )}
          </div>
        </ScrollArea>
      </div>
    );
  };

  const ProjectConversationView = () => {
    if (!selectedConversation || !selectedProject) return null;

    const participants = getParticipantAvatars(selectedConversation);

    return (
      <div className="s-flex s-h-full s-flex-col">
        <div className="s-flex s-items-center s-gap-2 s-border-b s-border-border s-px-2 s-py-2 dark:s-border-border-night">
          <Button
            icon={ChevronLeftIcon}
            variant="ghost"
            size="sm"
            onClick={handleBack}
          />
          <div className="s-flex s-flex-1 s-items-center s-gap-2 s-truncate">
            <span className="s-font-medium s-text-foreground dark:s-text-foreground-night">
              {selectedConversation.title.slice(0, 15)}
            </span>
            <Icon visual={SpaceOpenIcon} size="xs" className="s-text-muted-foreground" />
            <span className="s-text-sm s-text-muted-foreground">
              {selectedProject.name.replace(" Space", "")}
            </span>
          </div>
          <div className="s-flex -s-space-x-2">
            {participants.slice(0, 3).map((p, i) => (
              <Avatar
                key={i}
                size="xs"
                name={p.name}
                visual={p.visual}
                isRounded={true}
              />
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button icon={MoreIcon} variant="ghost" size="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Rename"
                icon={PencilSquareIcon}
              />
              <DropdownMenuItem
                label="Open in a browser tab"
                icon={ExternalLinkIcon}
                onClick={() => window.open("https://dust.tt", "_blank")}
              />
              <DropdownMenuItem
                label="Copy the link"
                icon={LinkIcon}
                onClick={() => {
                  navigator.clipboard.writeText("https://dust.tt/conversation/123");
                  showNotification("Link copied to clipboard");
                }}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                label="Delete"
                icon={TrashIcon}
                variant="warning"
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="s-flex s-flex-1 s-min-h-0 s-flex-col">
          <ConversationView />
        </div>
      </div>
    );
  };

  const NewProjectConversationView = () => {
    if (!selectedProject) return null;

    return (
      <div className="s-flex s-h-full s-flex-col">
        <div className="s-flex s-items-center s-gap-2 s-border-b s-border-border s-px-2 s-py-2 dark:s-border-border-night">
          <Button
            icon={ChevronLeftIcon}
            variant="ghost"
            size="sm"
            onClick={() => navigateTo("project")}
          />
          <span className="s-flex-1 s-truncate s-font-medium s-text-foreground dark:s-text-foreground-night">
            New conversation
          </span>
          <div className="s-flex s-items-center s-gap-1 s-rounded-full s-bg-muted-background s-px-2 s-py-1 dark:s-bg-muted-background-night">
            <Icon visual={SpaceOpenIcon} size="xs" />
            <span className="s-text-xs s-text-muted-foreground">
              {selectedProject.name.replace(" Space", "")}
            </span>
          </div>
        </div>

        <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-px-4">
          <div className="s-mb-8 s-text-center">
            <div className="s-heading-lg s-mb-2 s-text-foreground dark:s-text-foreground-night">
              Start a new conversation
            </div>
            <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              Ask a question to get started in {selectedProject.name.replace(" Space", "")}
            </p>
          </div>
        </div>

        <div className="s-shrink-0 s-p-4">
          <ExtensionInputBar placeholder={`Ask in ${selectedProject.name.replace(" Space", "")}...`} />
        </div>
      </div>
    );
  };

  const getHeaderTitle = () => {
    if (view === "project" && selectedProject) {
      return "Projects";
    }
    if (
      (view === "conversation" || view === "projectConversation") &&
      selectedConversation
    ) {
      return selectedConversation.title;
    }
    return " ";
  };

  const showBackButton =
    view === "conversation" || view === "project" || view === "projectConversation" || view === "newProjectConversation";

  return (
    <div className="s-flex s-h-screen s-w-full s-justify-end s-bg-muted-background s-p-2">
      <div
        className="s-relative s-flex s-h-full s-flex-col s-overflow-hidden s-rounded-2xl s-border s-border-border s-bg-background s-shadow-sm dark:s-border-border-night dark:s-bg-background-night"
        style={{ width: `${panelWidth}px` }}
      >
        <motion.div
          className={cn(
            "s-absolute s-inset-0 s-z-40 s-bg-black/20",
            sidebarOpen ? "s-pointer-events-auto" : "s-pointer-events-none"
          )}
          initial={false}
          animate={{ opacity: sidebarOpen ? 1 : 0 }}
          transition={overlayTransition}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar />

        <div className="s-flex s-flex-1 s-flex-col s-min-h-0">
          {view !== "projectConversation" && view !== "newProjectConversation" && (
            <BarHeader
              variant="default"
              size="sm"
              title={getHeaderTitle()}
              leftActions={
                view === "home" ? (
                  <Button
                    icon={MenuIcon}
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(true)}
                  />
                ) : showBackButton ? (
                  <Button
                    icon={ChevronLeftIcon}
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                  />
                ) : null
              }
              rightActions={
                view === "home" ? (
                  <ProfileDropdown />
                ) : view === "conversation" && selectedConversation ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        icon={MoreIcon}
                        variant="ghost"
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        label="Rename"
                        icon={PencilSquareIcon}
                      />
                      <DropdownMenuItem
                        label="Open in a browser tab"
                        icon={ExternalLinkIcon}
                        onClick={() => window.open("https://dust.tt", "_blank")}
                      />
                      <DropdownMenuItem
                        label="Copy the link"
                        icon={LinkIcon}
                        onClick={() => {
                          navigator.clipboard.writeText("https://dust.tt/conversation/123");
                          showNotification("Link copied to clipboard");
                        }}
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        label="Delete"
                        icon={TrashIcon}
                        variant="warning"
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          )}

          <div className="s-relative s-min-h-0 s-flex-1 s-overflow-hidden">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={view}
                className="s-absolute s-inset-0"
                initial={{ 
                  opacity: 0, 
                  scale: 0.98,
                  x: transitionState === "push" ? 30 : -30
                }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  x: 0 
                }}
                exit={{ 
                  opacity: 0,
                  scale: 0.98,
                  x: transitionState === "push" ? -30 : 30,
                  transition: {
                    opacity: { duration: 0.2, ease: familyEase },
                    scale: { duration: 0.25, ease: familyEase },
                    x: { duration: 0.25, ease: familyEase }
                  }
                }}
                transition={{
                  opacity: { duration: 0.25, ease: familyEase },
                  scale: { duration: 0.3, ease: familyEase },
                  x: { duration: 0.3, ease: familyEase }
                }}
              >
                {view === "home" && <HomeView />}
                {view === "conversation" && <ConversationView />}
                {view === "project" && <ProjectView />}
                {view === "projectConversation" && <ProjectConversationView />}
                {view === "newProjectConversation" && <NewProjectConversationView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div
          className="s-absolute s-inset-y-0 s-left-0 s-w-1.5 s-cursor-col-resize s-bg-transparent"
          onPointerDown={onPointerDown}
          role="presentation"
        />

      </div>
    </div>
  );
}

export default function ExtensionStory() {
  return (
    <Notification.Area>
      <ExtensionPanel />
    </Notification.Area>
  );
}
