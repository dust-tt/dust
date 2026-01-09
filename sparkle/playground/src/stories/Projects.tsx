import {
  AtomIcon,
  Avatar,
  BoltOffIcon,
  BookOpenIcon,
  Button,
  Card,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ContactsRobotIcon,
  ContactsUserIcon,
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
  ListSelectIcon,
  LogoutIcon,
  MagnifyingGlassIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import { GroupConversationView } from "../components/GroupConversationView";
import { InputBar } from "../components/InputBar";
import {
  type Agent,
  type Conversation,
  createConversationsWithMessages,
  getAgentById,
  getConversationsBySpaceId,
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  getUserById,
  mockAgents,
  mockConversations,
  mockUsers,
  type Space,
  type User,
} from "../data";

type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

type Participant =
  | { type: "user"; data: User }
  | { type: "agent"; data: Agent };

function getRandomParticipants(conversation: Conversation): Participant[] {
  const allParticipants: Participant[] = [];

  // Add user participants
  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  // Add agent participants
  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  // Shuffle and select 1-6 participants
  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
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
  >("new-conversation");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [previousSpaceId, setPreviousSpaceId] = useState<string | null>(null);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >([]);

  // Track sidebar collapsed state for toggle button icon
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);

    // Generate random total count of collaborators between 2 and 12
    const totalCount = Math.floor(Math.random() * (12 - 2 + 1)) + 2;

    // Randomly decide how many agents and people
    const agentCount = Math.floor(Math.random() * (totalCount - 1)) + 1;
    const peopleCount = totalCount - agentCount;

    const randomAgents = getRandomAgents(agentCount);
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

  // Combine mock conversations with conversations that have messages
  const allConversations = useMemo(() => {
    return [...conversationsWithMessages, ...mockConversations];
  }, [conversationsWithMessages]);

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return allConversations;
    }
    const lowerSearch = searchText.toLowerCase();
    return allConversations.filter((conv) =>
      conv.title.toLowerCase().includes(lowerSearch)
    );
  }, [searchText, allConversations]);

  const groupedConversations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const groups = {
      today: [] as typeof filteredConversations,
      yesterday: [] as typeof filteredConversations,
      lastWeek: [] as typeof filteredConversations,
      lastMonth: [] as typeof filteredConversations,
    };

    filteredConversations.forEach((conv) => {
      const updatedAt = conv.updatedAt;
      if (updatedAt >= today) {
        groups.today.push(conv);
      } else if (updatedAt >= yesterday) {
        groups.yesterday.push(conv);
      } else if (updatedAt >= lastWeek) {
        groups.lastWeek.push(conv);
      } else if (updatedAt >= lastMonth) {
        groups.lastMonth.push(conv);
      }
    });

    return groups;
  }, [filteredConversations]);

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

  const sortedSpaces = useMemo(() => {
    return [...spaces].sort((a, b) => {
      // Determine if restricted based on space ID
      const isRestrictedA = a.id.charCodeAt(a.id.length - 1) % 2 === 0;
      const isRestrictedB = b.id.charCodeAt(b.id.length - 1) % 2 === 0;

      // First sort by type: Open (false) first, Restricted (true) second
      if (isRestrictedA !== isRestrictedB) {
        return isRestrictedA ? 1 : -1;
      }

      // Then sort alphabetically by name
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

  // Find selected conversation from all conversations
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return (
      allConversations.find((c) => c.id === selectedConversationId) || null
    );
  }, [selectedConversationId, allConversations]);

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

  const getConversationMoreMenu = (conversation: Conversation) => {
    const participants = getRandomParticipants(conversation);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <NavigationListItemAction />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            label="Rename"
            icon={PencilSquareIcon}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Rename conversation:", conversation.id);
            }}
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              icon={ContactsUserIcon}
              label="Participant list"
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {participants.length > 0 ? (
                  participants.map((participant) => (
                    <DropdownMenuItem
                      key={
                        participant.type === "user"
                          ? `user-${participant.data.id}`
                          : `agent-${participant.data.id}`
                      }
                      label={
                        participant.type === "user"
                          ? participant.data.fullName
                          : participant.data.name
                      }
                      icon={
                        participant.type === "user" ? (
                          <Avatar
                            size="xxs"
                            name={participant.data.fullName}
                            visual={participant.data.portrait}
                            isRounded={true}
                          />
                        ) : (
                          <Avatar
                            size="xxs"
                            name={participant.data.name}
                            emoji={participant.data.emoji}
                            backgroundColor={participant.data.backgroundColor}
                            isRounded={false}
                          />
                        )
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(
                          "View participant:",
                          participant.type,
                          participant.data.id
                        );
                      }}
                    />
                  ))
                ) : (
                  <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground">
                    No participants
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            label="Delete"
            icon={TrashIcon}
            variant="warning"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Delete conversation:", conversation.id);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

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
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "chat" | "spaces" | "admin")
        }
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <TabsList className="s-mt-2 s-px-2">
          <TabsTrigger
            value="chat"
            label="Chat"
            icon={ChatBubbleLeftRightIcon}
          />
          <TabsTrigger value="spaces" label="Spaces" icon={SpaceOpenIcon} />
          <TabsTrigger value="admin" icon={Cog6ToothIcon} />
        </TabsList>
        <TabsContent
          value="chat"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            {/* Search Bar */}
            <div className="s-flex s-gap-2 s-p-2 s-px-2">
              <SearchInput
                name="conversation-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search"
                className="s-flex-1"
              />
              <Button
                variant="primary"
                tooltip="New Conversation"
                size="sm"
                icon={ChatBubbleBottomCenterTextIcon}
                label="New"
              />
            </div>
            {/* Collapsible Sections */}
            <NavigationList className="s-px-2">
              {(filteredSpaces.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Projects"
                  type="collapse"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={PlusIcon}
                        variant="ghost"
                        aria-label="Agents options"
                        onClick={(e) => {
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
                            aria-label="Spaces options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="Browse"
                            icon={PencilSquareIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Manage Spaces");
                            }}
                          />
                          <DropdownMenuItem
                            icon={PlusIcon}
                            label="Create"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Create Space");
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {filteredSpaces.map((space) => {
                    // Deterministically assign open or restricted status based on space ID
                    const isRestricted =
                      space.id.charCodeAt(space.id.length - 1) % 2 === 0;
                    return (
                      <NavigationListItem
                        key={space.id}
                        label={space.name}
                        icon={isRestricted ? SpaceOpenIcon : SpaceClosedIcon}
                        selected={space.id === selectedSpaceId}
                        moreMenu={
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <NavigationListItemAction />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                label="Edit"
                                icon={PencilSquareIcon}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("Edit space:", space.id);
                                }}
                              />
                              <DropdownMenuItem
                                label="Explore"
                                icon={MagnifyingGlassIcon}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("Explore space:", space.id);
                                }}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        }
                        onClick={() => {
                          setSelectedSpaceId(space.id);
                          setSelectedConversationId(null);
                        }}
                      />
                    );
                  })}
                </NavigationListCollapsibleSection>
              )}

              {(filteredConversations.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Conversations"
                  type="collapse"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={ChatBubbleLeftRightIcon}
                        variant="ghost"
                        aria-label="New Conversation"
                        tooltip="New Conversation"
                        onClick={(e) => {
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
                            aria-label="Conversations options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel label="Conversations" />
                          <DropdownMenuItem
                            label="Hide triggered"
                            icon={BoltOffIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Edit Conversations");
                            }}
                          />
                          <DropdownMenuItem
                            label="Edit history"
                            icon={ListSelectIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Edit Conversations");
                            }}
                          />
                          <DropdownMenuItem
                            label="Clear history"
                            variant="warning"
                            icon={TrashIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Clear history");
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {groupedConversations.today.length > 0 && (
                    <>
                      {groupedConversations.today.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            // Clear previousSpaceId when navigating from sidebar
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.yesterday.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Yesterday" />
                      {groupedConversations.yesterday.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            // Clear previousSpaceId when navigating from sidebar
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastWeek.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last week" />
                      {groupedConversations.lastWeek.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            // Clear previousSpaceId when navigating from sidebar
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastMonth.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last month" />
                      {groupedConversations.lastMonth.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            // Clear previousSpaceId when navigating from sidebar
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                          }}
                        />
                      ))}
                    </>
                  )}
                </NavigationListCollapsibleSection>
              )}
            </NavigationList>
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="spaces"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground">
            Spaces - TBD
          </div>
        </TabsContent>
        <TabsContent
          value="admin"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground">
            Admin - TBD
          </div>
        </TabsContent>
      </Tabs>
      {/* Bottom Bar */}
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-t s-border-border s-pl-1 s-pr-2 dark:s-border-border-night">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Card
              size="xs"
              onClick={(e) => e.preventDefault()}
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("View profile");
              }}
            />
            <DropdownMenuItem
              label="Administration"
              icon={Cog6ToothIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Administration");
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Quickstart Guide");
                    }}
                  />
                  <DropdownMenuItem
                    label="Guides & Documentation"
                    icon={BookOpenIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Guides & Documentation");
                    }}
                  />
                  <DropdownMenuItem
                    label="Join the Slack Community"
                    icon={SlackLogo}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Join the Slack Community");
                    }}
                  />
                  <DropdownMenuLabel label="Ask questions" />
                  <DropdownMenuItem
                    label="Ask @help"
                    description="Ask anything about Dust"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Ask @help");
                    }}
                  />
                  <DropdownMenuItem
                    label="How to invite new users?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("How to invite new users?");
                    }}
                  />
                  <DropdownMenuItem
                    label="How to use agents in Slack workflow?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("How to use agents in Slack workflow?");
                    }}
                  />
                  <DropdownMenuItem
                    label="How to manage billing?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("How to manage billing?");
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              label="Signout"
              icon={LogoutIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Signout");
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost-secondary"
          size="mini"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
        />
      </div>
    </div>
  );

  // Handle back button from conversation view
  const handleConversationBack = () => {
    if (previousSpaceId) {
      setSelectedSpaceId(previousSpaceId);
      setSelectedConversationId(null);
      // Optionally clear previousSpaceId, or keep it for future navigation
      // setPreviousSpaceId(null);
    }
  };

  // Main content
  const mainContent =
    // Priority 1: Show conversation view if a conversation is selected (not "new-conversation")
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
        showBackButton={!!previousSpaceId}
        onBack={handleConversationBack}
      />
    ) : // Priority 2: Show space view if a space is selected
    selectedSpace && selectedSpaceId ? (
      <GroupConversationView
        space={selectedSpace}
        conversations={spaceConversations}
        users={mockUsers}
        agents={mockAgents}
        onConversationClick={(conversation) => {
          // Store the current space ID before navigating to conversation
          setPreviousSpaceId(selectedSpaceId);
          setSelectedConversationId(conversation.id);
          // Keep selectedSpaceId set so the space NavigationItem stays selected
        }}
      />
    ) : (
      // Priority 3: Show welcome/new conversation view
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background">
        <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-6 s-px-4 s-py-8">
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
    </div>
  );
}

export default DustMain;
