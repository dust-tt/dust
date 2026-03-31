import {
  AtomIcon,
  Avatar,
  BookOpenIcon,
  Button,
  Card,
  ChatBubbleLeftRightIcon,
  CodeSlashIcon,
  Cog6ToothIcon,
  ContactsRobotIcon,
  ContactsUserIcon,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HeartIcon,
  InboxIcon,
  LightbulbIcon,
  LogoutIcon,
  MagnifyingGlassIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  PencilSquareIcon,
  PlusIcon,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SidebarLayout,
  type SidebarLayoutRef,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  SlackLogo,
  SpaceClosedIcon,
  SpaceOpenIcon,
  StarStrokeIcon,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

// Store conversations by ID for lookup (for dynamically generated conversations)
const conversationCache = new Map<string, Conversation>();

import { AgentBuilderView } from "../components/AgentBuilderView";
import { ConversationView } from "../components/ConversationView";
import { CreateRoomDialog } from "../components/CreateRoomDialog";
import { GroupConversationView } from "../components/GroupConversationView";
import { InboxView } from "../components/InboxView";
import { InputBar } from "../components/InputBar";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import { PersonAgentView } from "../components/PersonAgentView";
import { ProfilePanel } from "../components/Profile";
import {
  type Agent,
  type Conversation,
  createConversationsWithMessages,
  createSpace,
  getConversationsBySpaceId,
  getMembersBySpaceId,
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  mockAgents,
  mockConversations,
  mockUsers,
  type Space,
  type User,
} from "../data";
import TemplateSelection, { type Template } from "./TemplateSelection";

type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

function sidebarItemHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

/** Fake pending DMs: 0–3. Activity key orders “most recent” first (deterministic). */
function getAgentSidebarMeta(agent: Agent) {
  const pending = sidebarItemHash(`sessions-agent-pending:${agent.id}`) % 4;
  const activityKey = sidebarItemHash(`sessions-agent-activity:${agent.id}`);
  return {
    pending,
    activityKey,
    hasActivity: pending > 0,
  };
}

/** Fake pending DMs: 0–8. Activity key orders “most recent” first (deterministic). */
function getPersonSidebarMeta(person: User) {
  const pending = sidebarItemHash(`sessions-person-pending:${person.id}`) % 9;
  const activityKey = sidebarItemHash(`sessions-person-activity:${person.id}`);
  return {
    pending,
    activityKey,
    hasActivity: pending > 0,
  };
}

function DustMain() {
  const [_activeTab, _setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [agentSearchText, setAgentSearchText] = useState("");
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [documentSearchText, setDocumentSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [previousSpaceId, setPreviousSpaceId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<
    "inbox" | "space" | "conversation" | "agent" | "person" | "templates" | null
  >("inbox");
  const [cameFromInbox, setCameFromInbox] = useState<boolean>(false);
  const [cameFromPersonAgent, setCameFromPersonAgent] =
    useState<boolean>(false);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >([]);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<
    string | null
  >(null);
  const [selectedCollaboratorType, setSelectedCollaboratorType] = useState<
    "agent" | "person" | null
  >(null);
  const [selectedTemplateForBuilder, setSelectedTemplateForBuilder] =
    useState<Template | null>(null);
  const [isAgentsDropdownOpen, setIsAgentsDropdownOpen] = useState(false);
  const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
  const [isInviteUsersScreenOpen, setIsInviteUsersScreenOpen] = useState(false);
  const [lastCreatedSpaceId, setLastCreatedSpaceId] = useState<string | null>(
    null
  );
  const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null);
  const [spaceMembers, setSpaceMembers] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spaceEditors, setSpaceEditors] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spacePublicSettings, setSpacePublicSettings] = useState<
    Map<string, boolean>
  >(new Map());

  // Track sidebar collapsed state for toggle button icon
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);

    const agentListSize = 20;
    const randomAgents = getRandomAgents(agentListSize);
    const peopleCount = Math.floor(Math.random() * 6) + 4;
    const randomPeople = getRandomUsers(peopleCount);

    // Create mixed collaborator list
    const mixedCollaborators: Collaborator[] = [
      ...randomAgents.map((agent) => ({ type: "agent" as const, data: agent })),
      ...randomPeople.map((person) => ({
        type: "person" as const,
        data: person,
      })),
    ];

    setCollaborators(mixedCollaborators);

    // Generate random number of spaces between 3 and 9
    const spaceCount = Math.floor(Math.random() * (9 - 3 + 1)) + 3;
    const randomSpaces = getRandomSpaces(spaceCount);
    setSpaces(randomSpaces);

    // Create conversations with messages
    const convsWithMessages = createConversationsWithMessages(randomUser.id);
    setConversationsWithMessages(convsWithMessages);
  }, []);

  useEffect(() => {
    if (selectedSpaceId && !spaceMembers.has(selectedSpaceId)) {
      const generatedMembers = getMembersBySpaceId(selectedSpaceId);
      setSpaceMembers((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedSpaceId, generatedMembers);
        return newMap;
      });
    }
  }, [selectedSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lastCreatedSpaceId && spaces.find((s) => s.id === lastCreatedSpaceId)) {
      setSelectedView(null);
      setSelectedSpaceId(lastCreatedSpaceId);
      setSelectedConversationId(null);
      setLastCreatedSpaceId(null);
    }
  }, [spaces, lastCreatedSpaceId]);

  // Combine mock conversations with conversations that have messages
  const allConversations = useMemo(() => {
    return [...conversationsWithMessages, ...mockConversations];
  }, [conversationsWithMessages]);

  // Calculate unread count for Inbox (same logic as InboxView)
  const unreadCount = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return allConversations.filter((conv) => {
      // Must have a spaceId
      if (!conv.spaceId) return false;
      // For demo: consider conversations updated in the last 2 days as "unread"
      return conv.updatedAt >= twoDaysAgo;
    }).length;
  }, [allConversations]);

  const filteredAgents = useMemo(() => {
    if (!agentSearchText.trim()) {
      return mockAgents;
    }
    const lowerSearch = agentSearchText.toLowerCase();
    return mockAgents.filter((agent) =>
      agent.name.toLowerCase().includes(lowerSearch)
    );
  }, [agentSearchText]);

  const filteredPeople = useMemo(() => {
    if (!peopleSearchText.trim()) {
      return mockUsers;
    }
    const lowerSearch = peopleSearchText.toLowerCase();
    return mockUsers.filter(
      (person) =>
        person.fullName.toLowerCase().includes(lowerSearch) ||
        person.email.toLowerCase().includes(lowerSearch)
    );
  }, [peopleSearchText]);

  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) => {
      const nameA = a.type === "agent" ? a.data.name : a.data.fullName;
      const nameB = b.type === "agent" ? b.data.name : b.data.fullName;
      return nameA.localeCompare(nameB);
    });
  }, [collaborators]);

  const filteredCollaborators = useMemo(() => {
    if (!searchText.trim()) {
      return sortedCollaborators;
    }
    const lowerSearch = searchText.toLowerCase();
    return sortedCollaborators.filter((collaborator) => {
      if (collaborator.type === "agent") {
        const agent = collaborator.data;
        return (
          agent.name.toLowerCase().includes(lowerSearch) ||
          agent.description.toLowerCase().includes(lowerSearch)
        );
      } else {
        const person = collaborator.data;
        return (
          person.fullName.toLowerCase().includes(lowerSearch) ||
          person.email.toLowerCase().includes(lowerSearch)
        );
      }
    });
  }, [searchText, sortedCollaborators]);

  const getSpaceActivity = (space: Space) => {
    const charCode = space.id.charCodeAt(space.id.length - 1);
    const count = charCode % 3 === 0 ? (charCode % 9) + 1 : undefined;
    const hasActivity = count ? true : charCode % 2 !== 0;
    return { count, hasActivity };
  };

  const filteredAgentCollaborators = useMemo(() => {
    const agents = filteredCollaborators.filter((c) => c.type === "agent");
    return [...agents].sort((a, b) => {
      const ma = getAgentSidebarMeta(a.data);
      const mb = getAgentSidebarMeta(b.data);
      if (mb.activityKey !== ma.activityKey) {
        return mb.activityKey - ma.activityKey;
      }
      if (mb.pending !== ma.pending) {
        return mb.pending - ma.pending;
      }
      return a.data.name.localeCompare(b.data.name);
    });
  }, [filteredCollaborators]);

  const filteredPeopleCollaborators = useMemo(() => {
    const people = filteredCollaborators.filter((c) => c.type === "person");
    return [...people].sort((a, b) => {
      const ma = getPersonSidebarMeta(a.data);
      const mb = getPersonSidebarMeta(b.data);
      if (mb.activityKey !== ma.activityKey) {
        return mb.activityKey - ma.activityKey;
      }
      if (mb.pending !== ma.pending) {
        return mb.pending - ma.pending;
      }
      return a.data.fullName.localeCompare(b.data.fullName);
    });
  }, [filteredCollaborators]);

  const sortedSpaces = useMemo(() => {
    return [...spaces].sort((a, b) => {
      const actA = getSpaceActivity(a);
      const actB = getSpaceActivity(b);

      const countA = actA.count ?? 0;
      const countB = actB.count ?? 0;
      if (countA !== countB) {
        return countB - countA;
      }

      if (actA.hasActivity !== actB.hasActivity) {
        return actA.hasActivity ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [spaces]);

  const filteredSpaces = useMemo(() => {
    if (!searchText.trim()) {
      return sortedSpaces;
    }
    const lowerSearch = searchText.toLowerCase();
    return sortedSpaces.filter(
      (space) =>
        space.name.toLowerCase().includes(lowerSearch) ||
        space.description.toLowerCase().includes(lowerSearch)
    );
  }, [searchText, sortedSpaces]);

  // Find selected space
  const selectedSpace = useMemo(() => {
    if (!selectedSpaceId) return null;
    return spaces.find((s) => s.id === selectedSpaceId) || null;
  }, [selectedSpaceId, spaces]);

  // Get conversations for selected space
  const spaceConversations = useMemo(() => {
    if (!selectedSpaceId) return [];
    return getConversationsBySpaceId(selectedSpaceId);
  }, [selectedSpaceId]);

  // Get conversations between user and selected collaborator (needed for lookup)
  const collaboratorConversationsForLookup = useMemo(() => {
    if (!selectedCollaboratorId || !selectedCollaboratorType || !user) {
      return [];
    }
    const filtered = allConversations.filter((conv) => {
      if (!conv.userParticipants.includes(user.id)) {
        return false;
      }
      if (selectedCollaboratorType === "agent") {
        return conv.agentParticipants.includes(selectedCollaboratorId);
      }
      if (selectedCollaboratorType === "person") {
        return conv.userParticipants.includes(selectedCollaboratorId);
      }
      return false;
    });

    // If no conversations found, generate some to ensure the collaborator has history
    if (filtered.length === 0) {
      const now = new Date();
      const generated: Conversation[] = [];
      const conversationTitles = [
        "Quick question",
        "Follow-up discussion",
        "Project update",
        "Weekly sync",
        "Planning session",
      ];

      const count = Math.floor(Math.random() * 6) + 3;
      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(Math.random() * 35);
        const hoursAgo = Math.floor(Math.random() * 24);
        const minutesAgo = Math.floor(Math.random() * 60);

        const updatedAt = new Date(now);
        updatedAt.setDate(updatedAt.getDate() - daysAgo);
        updatedAt.setHours(updatedAt.getHours() - hoursAgo);
        updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

        const createdAt = new Date(updatedAt);
        createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 5));

        const title =
          conversationTitles[
            Math.floor(Math.random() * conversationTitles.length)
          ];

        const userParticipants =
          selectedCollaboratorType === "person"
            ? [user.id, selectedCollaboratorId]
            : [user.id];
        const agentParticipants =
          selectedCollaboratorType === "agent" ? [selectedCollaboratorId] : [];

        generated.push({
          id: `generated-conv-${selectedCollaboratorId}-${i}`,
          title,
          createdAt,
          updatedAt,
          userParticipants,
          agentParticipants,
          description: `Conversation about ${title.toLowerCase()}`,
        });
      }

      return generated;
    }

    return filtered;
  }, [
    selectedCollaboratorId,
    selectedCollaboratorType,
    user,
    allConversations,
  ]);

  // Generate expanded conversations for collaborator (same logic as PersonAgentView)
  // Use a simple seeded random function to ensure consistency
  const collaboratorExpandedConversations = useMemo(() => {
    if (
      !selectedCollaboratorId ||
      collaboratorConversationsForLookup.length === 0
    ) {
      return [];
    }
    const conversations = collaboratorConversationsForLookup;
    const now = new Date();
    const generated: Conversation[] = [];
    const targetCount = Math.max(20, conversations.length * 4);

    // Use a seed based on collaborator ID for consistent generation
    let seed = selectedCollaboratorId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seededRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Shuffle conversations array using seeded random
    const shuffled = [...conversations].sort(() => seededRandom() - 0.5);

    // Generate conversations using seeded random
    for (let i = 0; i < targetCount; i++) {
      const randomIndex = Math.floor(seededRandom() * shuffled.length);
      const baseConversation = shuffled[randomIndex];

      const daysAgo = Math.floor(seededRandom() * 35);
      const hoursAgo = Math.floor(seededRandom() * 24);
      const minutesAgo = Math.floor(seededRandom() * 60);

      const updatedAt = new Date(now);
      updatedAt.setDate(updatedAt.getDate() - daysAgo);
      updatedAt.setHours(updatedAt.getHours() - hoursAgo);
      updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

      const createdAt = new Date(updatedAt);
      createdAt.setDate(createdAt.getDate() - Math.floor(seededRandom() * 5));

      generated.push({
        ...baseConversation,
        id: `${baseConversation.id}-${i}`,
        updatedAt,
        createdAt,
        title: baseConversation.title,
      });
    }

    return generated;
  }, [selectedCollaboratorId, collaboratorConversationsForLookup]);

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    // First check allConversations
    const found = allConversations.find((c) => c.id === selectedConversationId);
    if (found) return found;
    // If not found, check collaboratorConversations (includes generated ones)
    const foundInCollaborator = collaboratorConversationsForLookup.find(
      (c) => c.id === selectedConversationId
    );
    if (foundInCollaborator) return foundInCollaborator;
    // If not found, check expanded collaborator conversations (from PersonAgentView)
    const foundInExpanded = collaboratorExpandedConversations.find(
      (c) => c.id === selectedConversationId
    );
    if (foundInExpanded) return foundInExpanded;
    // If not found, check spaceConversations (for conversations from spaces)
    const foundInSpace = spaceConversations.find(
      (c) => c.id === selectedConversationId
    );
    if (foundInSpace) return foundInSpace;
    // Finally, check the conversation cache (for dynamically generated conversations)
    const foundInCache = conversationCache.get(selectedConversationId);
    if (foundInCache) return foundInCache;
    return null;
  }, [
    selectedConversationId,
    allConversations,
    collaboratorConversationsForLookup,
    collaboratorExpandedConversations,
    spaceConversations,
  ]);

  // Get conversations between user and selected collaborator
  // Use the shared lookup to avoid duplication
  const collaboratorConversations = collaboratorConversationsForLookup;

  // Get selected collaborator data
  const selectedCollaborator = useMemo(() => {
    if (!selectedCollaboratorId || !selectedCollaboratorType) return null;
    return (
      collaborators.find(
        (c) =>
          c.type === selectedCollaboratorType &&
          (c.type === "agent"
            ? (c.data as Agent).id === selectedCollaboratorId
            : (c.data as User).id === selectedCollaboratorId)
      ) || null
    );
  }, [selectedCollaboratorId, selectedCollaboratorType, collaborators]);

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Sidebar content
  const sidebarContent = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      {/* Top Bar */}
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-pl-1 s-pr-2 dark:s-border-border-night">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Card
              size="xs"
              onClick={(e: MouseEvent) => e.preventDefault()}
              className="s-p-1"
              containerClassName="s-flex-1 s-min-w-0"
            >
              <div className="s-flex s-min-w-0 s-items-center s-gap-2 s-pr-1">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="sm"
                  isRounded={true}
                />
                <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
                  <span className="s-heading-sm s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
                    {user.fullName}
                  </span>
                  <span className="-s-mt-0.5 s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                    ACME
                  </span>
                </div>
              </div>
            </Card>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Profile"
              icon={UserIcon}
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setShowProfileView(true);
                setSelectedConversationId(null);
                setSelectedSpaceId(null);
                setSelectedCollaboratorId(null);
                setSelectedCollaboratorType(null);
              }}
            />
            <DropdownMenuItem
              label="Administration"
              icon={Cog6ToothIcon}
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={HeartIcon} label="Help & Support" />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel label="Learn about Dust" />
                  <DropdownMenuItem
                    label="Quickstart Guide"
                    icon={LightbulbIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Guides & Documentation"
                    icon={BookOpenIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Join the Slack Community"
                    icon={SlackLogo}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuLabel label="Ask questions" />
                  <DropdownMenuItem
                    label="Ask @help"
                    description="Ask anything about Dust"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to invite new users?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to use agents in Slack workflow?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to manage billing?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              label="Signout"
              icon={LogoutIcon}
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
        />
      </div>
      <ScrollArea className="s-flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        {/* Search Bar */}
        <div className="s-flex s-gap-1 s-p-2 s-px-2 s-items-center">
          <SearchInput
            name="conversation-search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search"
            className="s-flex-1"
          />
          <DropdownMenu
            open={isAgentsDropdownOpen}
            onOpenChange={setIsAgentsDropdownOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                icon={MoreIcon}
                aria-label="More options"
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel label="Agents" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  icon={PlusIcon}
                  label="Build an agent"
                />
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    icon={PencilSquareIcon}
                    label="From scratch"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    icon={LightbulbIcon}
                    label="Browse templates"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsAgentsDropdownOpen(false);
                      setShowProfileView(false);
                      setSelectedView("templates");
                      setSelectedConversationId(null);
                      setSelectedSpaceId(null);
                      setPreviousSpaceId(null);
                      setCameFromInbox(false);
                      setCameFromPersonAgent(false);
                    }}
                  />
                  <DropdownMenuItem
                    label="Open YAML"
                    icon={CodeSlashIcon}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                label="Edit agent"
                icon={PencilSquareIcon}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <DropdownMenuItem
                label="Manage agents"
                icon={ContactsUserIcon}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Collapsible Sections */}
        <NavigationList className="s-px-2">
          {!searchText.trim() ? (
            <NavigationListItem
              label="Inbox"
              icon={InboxIcon}
              selected={selectedView === "inbox"}
              count={unreadCount > 0 ? unreadCount : undefined}
              onClick={() => {
                setShowProfileView(false);
                setSelectedView("inbox");
                setSelectedSpaceId(null);
                setSelectedConversationId(null);
                setPreviousSpaceId(null);
                setCameFromInbox(false);
              }}
            />
          ) : (
            <div className="s-flex s-w-full s-justify-end s-gap-1.5">
              <Button
                size="xs"
                icon={MagnifyingGlassIcon}
                variant="highlight"
                label="Documents"
              />
              <Button
                size="xs"
                icon={AtomIcon}
                label="Deep Dive"
                variant="highlight"
              />
            </div>
          )}
          {(filteredSpaces.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="Projects"
              type="collapse"
              defaultOpen={true}
              visibleItems={4}
              action={
                <>
                  <Button
                    size="xmini"
                    icon={PlusIcon}
                    variant="ghost"
                    aria-label="Create project"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsCreateRoomDialogOpen(true);
                    }}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xmini"
                        icon={MoreIcon}
                        variant="ghost"
                        aria-label="Projects options"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        label="Browse"
                        icon={PencilSquareIcon}
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenuItem
                        icon={PlusIcon}
                        label="Create"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsCreateRoomDialogOpen(true);
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            >
              {filteredSpaces.map((space) => {
                const isRestricted =
                  space.id.charCodeAt(space.id.length - 1) % 2 === 0;
                const { count, hasActivity } = getSpaceActivity(space);
                return (
                  <NavigationListItem
                    key={space.id}
                    label={space.name}
                    icon={isRestricted ? SpaceOpenIcon : SpaceClosedIcon}
                    selected={space.id === selectedSpaceId}
                    count={count}
                    hasActivity={hasActivity}
                    moreMenu={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <NavigationListItemAction />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="Edit"
                            icon={PencilSquareIcon}
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Explore"
                            icon={MagnifyingGlassIcon}
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                    onClick={() => {
                      setShowProfileView(false);
                      setSelectedView(null);
                      setSelectedSpaceId(space.id);
                      setSelectedConversationId(null);
                      setPreviousSpaceId(null);
                      setCameFromInbox(false);
                      setCameFromPersonAgent(false);
                      setSelectedCollaboratorId(null);
                      setSelectedCollaboratorType(null);
                    }}
                  />
                );
              })}
            </NavigationListCollapsibleSection>
          )}

          {(filteredAgentCollaborators.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="Agents"
              type="collapse"
              defaultOpen={true}
              visibleItems={4}
              action={
                <>
                  <Button
                    size="xmini"
                    icon={PlusIcon}
                    variant="ghost"
                    tooltip="Create an Agent"
                    aria-label="Agents options"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xmini"
                        icon={MoreIcon}
                        variant="ghost"
                        aria-label="Agents options"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Agents</DropdownMenuLabel>
                      <DropdownMenuItem
                        label="Create agent"
                        icon={PlusIcon}
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenuItem
                        icon={ContactsRobotIcon}
                        label="Manage"
                        onClick={(e: MouseEvent) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger
                          icon={PencilSquareIcon}
                          label="Edit"
                        />
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuSearchbar
                              value={agentSearchText}
                              onChange={setAgentSearchText}
                              name="agent-search"
                            />
                            {filteredAgents.length > 0 ? (
                              [...filteredAgents]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((agent) => (
                                  <DropdownMenuItem
                                    key={agent.id}
                                    label={agent.name}
                                    icon={
                                      <Avatar
                                        size="xxs"
                                        name={agent.name}
                                        emoji={agent.emoji}
                                        backgroundColor={agent.backgroundColor}
                                      />
                                    }
                                    onClick={(e: MouseEvent) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                  />
                                ))
                            ) : (
                              <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground">
                                No agents found
                              </div>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            >
              {filteredAgentCollaborators.map((collaborator) => {
                const agent = collaborator.data;
                const agentMeta = getAgentSidebarMeta(agent);
                return (
                  <NavigationListItem
                    key={`agent-${agent.id}`}
                    label={agent.name}
                    selected={
                      selectedCollaboratorId === agent.id &&
                      selectedCollaboratorType === "agent"
                    }
                    count={
                      agentMeta.pending > 0 ? agentMeta.pending : undefined
                    }
                    hasActivity={agentMeta.hasActivity}
                    avatar={
                      <Avatar
                        size="xxs"
                        name={agent.name}
                        emoji={agent.emoji}
                        backgroundColor={agent.backgroundColor}
                        isRounded={false}
                      />
                    }
                    moreMenu={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <NavigationListItemAction />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="Edit"
                            icon={PencilSquareIcon}
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Remove from favorites"
                            icon={StarStrokeIcon}
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Delete"
                            icon={TrashIcon}
                            variant="warning"
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                    onClick={() => {
                      setShowProfileView(false);
                      setSelectedCollaboratorId(agent.id);
                      setSelectedCollaboratorType("agent");
                      setSelectedView("agent");
                      setSelectedConversationId(null);
                      setSelectedSpaceId(null);
                      setPreviousSpaceId(null);
                    }}
                  />
                );
              })}
            </NavigationListCollapsibleSection>
          )}

          {(filteredPeopleCollaborators.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="People"
              type="collapse"
              defaultOpen={true}
              visibleItems={4}
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="xmini"
                      icon={MoreIcon}
                      variant="ghost"
                      aria-label="People options"
                      onClick={(e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>People</DropdownMenuLabel>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        icon={ContactsUserIcon}
                        label="Browse"
                      />
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          <DropdownMenuSearchbar
                            value={peopleSearchText}
                            onChange={setPeopleSearchText}
                            name="people-search"
                          />
                          {filteredPeople.length > 0 ? (
                            [...filteredPeople]
                              .sort((a, b) =>
                                a.fullName.localeCompare(b.fullName)
                              )
                              .map((person) => (
                                <DropdownMenuItem
                                  key={person.id}
                                  label={person.fullName}
                                  icon={
                                    <Avatar
                                      size="xxs"
                                      name={person.fullName}
                                      visual={person.portrait}
                                      isRounded={true}
                                    />
                                  }
                                  onClick={(e: MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                />
                              ))
                          ) : (
                            <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground">
                              No people found
                            </div>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              {filteredPeopleCollaborators.map((collaborator) => {
                const person = collaborator.data;
                const personMeta = getPersonSidebarMeta(person);
                return (
                  <NavigationListItem
                    key={`person-${person.id}`}
                    label={person.fullName}
                    selected={
                      selectedCollaboratorId === person.id &&
                      selectedCollaboratorType === "person"
                    }
                    count={
                      personMeta.pending > 0 ? personMeta.pending : undefined
                    }
                    hasActivity={personMeta.hasActivity}
                    avatar={
                      <Avatar
                        size="xxs"
                        name={person.fullName}
                        visual={person.portrait}
                        isRounded={true}
                      />
                    }
                    moreMenu={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <NavigationListItemAction />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="View profile"
                            icon={UserIcon}
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Remove from favorites"
                            icon={TrashIcon}
                            variant="warning"
                            onClick={(e: MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                    onClick={() => {
                      setShowProfileView(false);
                      setSelectedCollaboratorId(person.id);
                      setSelectedCollaboratorType("person");
                      setSelectedView("person");
                      setSelectedConversationId(null);
                      setSelectedSpaceId(null);
                      setPreviousSpaceId(null);
                    }}
                  />
                );
              })}
            </NavigationListCollapsibleSection>
          )}
        </NavigationList>
      </ScrollArea>
    </div>
  );

  // Handle back button from conversation view
  const handleConversationBack = () => {
    setShowProfileView(false);
    if (previousSpaceId) {
      setSelectedSpaceId(previousSpaceId);
      setSelectedConversationId(null);
      setSelectedView(null);
      setCameFromInbox(false);
      setCameFromPersonAgent(false);
      // Optionally clear previousSpaceId, or keep it for future navigation
      // setPreviousSpaceId(null);
    } else if (cameFromPersonAgent) {
      // Return to PersonAgentView if we came from there
      setSelectedView(
        selectedCollaboratorType === "agent" ? "agent" : "person"
      );
      setSelectedConversationId(null);
      setCameFromPersonAgent(false);
    } else if (cameFromInbox) {
      // Return to inbox if we came from there
      setSelectedView("inbox");
      setSelectedConversationId(null);
      setCameFromInbox(false);
    }
  };

  function handleNewConversation() {
    setShowProfileView(false);
    setSelectedConversationId("new-conversation");
    setSelectedView(null);
    setSelectedSpaceId(null);
    setPreviousSpaceId(null);
    setSelectedCollaboratorId(null);
    setSelectedCollaboratorType(null);
    setCameFromInbox(false);
    setCameFromPersonAgent(false);
  }

  const handleRoomNameNext = (name: string, isPublic: boolean) => {
    const newSpace = createSpace(name, undefined, isPublic);
    setSpaces((prev) => [...prev, newSpace]);
    setSpacePublicSettings((prev) => {
      const newMap = new Map(prev);
      newMap.set(newSpace.id, isPublic);
      return newMap;
    });
    setLastCreatedSpaceId(newSpace.id);
    setIsCreateRoomDialogOpen(false);
  };

  const handleInviteMembers = (spaceId: string) => {
    setInviteSpaceId(spaceId);
    setIsInviteUsersScreenOpen(true);
  };

  const handleInviteUsersComplete = (
    selectedUserIds: string[],
    editorUserIds: string[]
  ) => {
    if (inviteSpaceId) {
      setSpaceMembers((prev) => {
        const newMap = new Map(prev);
        newMap.set(inviteSpaceId, selectedUserIds);
        return newMap;
      });
      setSpaceEditors((prev) => {
        const newMap = new Map(prev);
        newMap.set(inviteSpaceId, editorUserIds);
        return newMap;
      });
    }
    setIsInviteUsersScreenOpen(false);
    setInviteSpaceId(null);
  };

  const handleUpdateSpaceName = (spaceId: string, newName: string) => {
    setSpaces((prev) =>
      prev.map((space) =>
        space.id === spaceId ? { ...space, name: newName } : space
      )
    );
  };

  const handleUpdateSpacePublic = (spaceId: string, isPublic: boolean) => {
    setSpacePublicSettings((prev) => {
      const newMap = new Map(prev);
      newMap.set(spaceId, isPublic);
      return newMap;
    });
    setSpaces((prev) =>
      prev.map((space) =>
        space.id === spaceId ? { ...space, isPublic } : space
      )
    );
  };

  // Main content
  const mainContent =
    // Priority 0: Show profile when opened from user menu
    showProfileView && user ? (
      <ProfilePanel user={user} />
    ) : // Priority 1: Show conversation view if a conversation is selected (not "new-conversation")
    selectedConversationId &&
      selectedConversationId !== "new-conversation" &&
      selectedConversation &&
      user ? (
      <ConversationView
        conversation={selectedConversation}
        locutor={user}
        users={mockUsers}
        agents={mockAgents}
        conversationsWithMessages={conversationsWithMessages}
        showBackButton={
          !!previousSpaceId || cameFromInbox || cameFromPersonAgent
        }
        onBack={handleConversationBack}
        projectTitle={previousSpaceId ? selectedSpace?.name : undefined}
      />
    ) : // Priority 2: Show inbox view if inbox is selected
    selectedView === "inbox" && user ? (
      <InboxView
        spaces={spaces}
        conversations={allConversations}
        users={mockUsers}
        agents={mockAgents}
        currentUserId={user.id}
        onConversationClick={(conversation) => {
          setShowProfileView(false);
          setPreviousSpaceId(null);
          setSelectedView("conversation");
          setSelectedConversationId(conversation.id);
          setCameFromInbox(true);
        }}
        onSpaceClick={(space) => {
          setShowProfileView(false);
          setSelectedSpaceId(space.id);
          setSelectedView(null);
          setSelectedConversationId(null);
          setCameFromInbox(false);
        }}
        onAgentClick={(agent) => {
          setShowProfileView(false);
          setSelectedCollaboratorId(agent.id);
          setSelectedCollaboratorType("agent");
          setSelectedView("agent");
          setSelectedConversationId(null);
          setSelectedSpaceId(null);
          setPreviousSpaceId(null);
          setCameFromInbox(false);
          setCameFromPersonAgent(false);
        }}
        onPersonClick={(person) => {
          setShowProfileView(false);
          setSelectedCollaboratorId(person.id);
          setSelectedCollaboratorType("person");
          setSelectedView("person");
          setSelectedConversationId(null);
          setSelectedSpaceId(null);
          setPreviousSpaceId(null);
          setCameFromInbox(false);
          setCameFromPersonAgent(false);
        }}
      />
    ) : // Priority 3: Show template selection when Browse templates is clicked
    selectedView === "templates" ? (
      <div className="s-h-full s-overflow-auto">
        <TemplateSelection
          onTemplateClick={(t) => setSelectedTemplateForBuilder(t)}
        />
      </div>
    ) : // Priority 4: Show person/agent view if a collaborator is selected
    selectedCollaborator &&
      selectedCollaboratorId &&
      selectedCollaboratorType &&
      user ? (
      <PersonAgentView
        collaborator={selectedCollaborator}
        user={user}
        conversations={collaboratorConversations}
        users={mockUsers}
        agents={mockAgents}
        onConversationClick={(conversation) => {
          conversationCache.set(conversation.id, conversation);
          setShowProfileView(false);
          setPreviousSpaceId(null);
          setSelectedView("conversation");
          setSelectedConversationId(conversation.id);
          setCameFromInbox(false);
          setCameFromPersonAgent(true);
          // Keep selectedCollaboratorId and selectedCollaboratorType set
          // so the navigation item stays selected
        }}
      />
    ) : // Priority 5: Show space view if a space is selected
    selectedSpace && selectedSpaceId ? (
      <GroupConversationView
        space={selectedSpace}
        conversations={spaceConversations}
        users={mockUsers}
        agents={mockAgents}
        showToolsAndAboutTabs={true}
        spaceMemberIds={
          spaceMembers.has(selectedSpaceId)
            ? spaceMembers.get(selectedSpaceId)!
            : getMembersBySpaceId(selectedSpaceId)
        }
        editorUserIds={
          spaceEditors.has(selectedSpaceId)
            ? spaceEditors.get(selectedSpaceId)!
            : []
        }
        onConversationClick={(conversation) => {
          setShowProfileView(false);
          setPreviousSpaceId(selectedSpaceId);
          setSelectedView("conversation");
          setSelectedConversationId(conversation.id);
        }}
        onInviteMembers={() => handleInviteMembers(selectedSpaceId)}
        onUpdateSpaceName={handleUpdateSpaceName}
        onUpdateSpacePublic={handleUpdateSpacePublic}
        spacePublicSettings={spacePublicSettings}
      />
    ) : (
      // Priority 6: Show welcome/new conversation view
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-px-4 s-py-8">
          <div className="s-heading-2xl s-text-foreground">
            Welcome, Edouard!{" "}
          </div>
          <InputBar placeholder="Ask a question" />
          <div className="s-flex s-w-full s-flex-col s-gap-2">
            <div className="s-heading-lg s-text-foreground">
              Universal search
            </div>
            <SearchInput
              name="document-search"
              value={documentSearchText}
              onChange={setDocumentSearchText}
              placeholder="Find company documents, Agents, People…"
              className="s-w-full"
            />
          </div>
          <div className="s-heading-lg s-text-foreground">Chat with…</div>
        </div>
      </div>
    );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={sidebarContent}
        content={mainContent}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsSidebarCollapsed}
      />
      <CreateRoomDialog
        isOpen={isCreateRoomDialogOpen}
        onClose={() => setIsCreateRoomDialogOpen(false)}
        onNext={handleRoomNameNext}
      />
      <Dialog
        open={selectedTemplateForBuilder !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTemplateForBuilder(null);
          }
        }}
      >
        <DialogContent
          size="full"
          className="s-flex s-h-full s-max-h-full s-rounded-none s-p-0 s-overflow-hidden"
        >
          {selectedTemplateForBuilder && (
            <AgentBuilderView
              template={{
                handle: selectedTemplateForBuilder.handle,
                emoji: selectedTemplateForBuilder.emoji,
                backgroundColor: selectedTemplateForBuilder.backgroundColor,
              }}
              onClose={() => setSelectedTemplateForBuilder(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <InviteUsersScreen
        isOpen={isInviteUsersScreenOpen}
        spaceId={inviteSpaceId}
        onClose={() => {
          setIsInviteUsersScreenOpen(false);
          setInviteSpaceId(null);
        }}
        onInvite={handleInviteUsersComplete}
        actionLabel="Save"
        initialSelectedUserIds={
          inviteSpaceId && spaceMembers.has(inviteSpaceId)
            ? spaceMembers.get(inviteSpaceId)
            : []
        }
        initialEditorUserIds={
          inviteSpaceId && spaceEditors.has(inviteSpaceId)
            ? spaceEditors.get(inviteSpaceId)
            : []
        }
        hasMultipleSelect={true}
      />
    </div>
  );
}

export default DustMain;
