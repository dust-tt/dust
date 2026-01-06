import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtomIcon,
  Avatar,
  Button,
  Card,
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
  InboxIcon,
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
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  SpaceClosedIcon,
  SpaceOpenIcon,
  StarStrokeIcon,
  TrashIcon,
  UserIcon,
  type SidebarLayoutRef,
} from "@dust-tt/sparkle";
import {
  getAgentById,
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  getUserById,
  mockAgents,
  mockConversations,
  mockUsers,
  type Agent,
  type Conversation,
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
  const [_activeTab, _setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [agentSearchText, setAgentSearchText] = useState("");
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

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
  }, []);

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return mockConversations;
    }
    const lowerSearch = searchText.toLowerCase();
    return mockConversations.filter((conv) =>
      conv.title.toLowerCase().includes(lowerSearch)
    );
  }, [searchText]);

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
    <div className="s-flex s-h-full s-flex-col s-bg-muted-background">
      {/* Top Bar */}
      <div className="s-flex s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-py-1 s-pl-1 s-pr-2 dark:s-border-border-night">
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
            label="New"
            variant="primary"
            size="sm"
            icon={ChatBubbleLeftRightIcon}
          />
        </div>
        {/* Collapsible Sections */}
        <NavigationList className="s-px-2">
          {!searchText.trim() ? (
            <NavigationListItem
              label="Inbox"
              icon={InboxIcon}
              onClick={() => {
                console.log("Selected Inbox");
              }}
            />
          ) : (
            <>
              <NavigationListItem
                label="Search Documents"
                icon={MagnifyingGlassIcon}
                onClick={() => {
                  console.log("Start a Search Doc");
                }}
              />
              <NavigationListItem
                label="Start a Deep Dive"
                icon={AtomIcon}
                onClick={() => {
                  console.log("Start a Deep Dive");
                }}
              />
            </>
          )}
          {(filteredSpaces.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="Spaces"
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
                      console.log("Selected space:", space.id);
                    }}
                  />
                );
              })}
            </NavigationListCollapsibleSection>
          )}

          {(filteredCollaborators.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="People & Agents"
              defaultOpen={true}
              action={
                <>
                  <Button
                    size="xmini"
                    icon={PlusIcon}
                    variant="ghost"
                    tooltip="Create an Agent"
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
                        aria-label="Agents options"
                        onClick={(e) => {
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Create Agent");
                        }}
                      />
                      <DropdownMenuItem
                        icon={ContactsRobotIcon}
                        label="Manage"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Manage Agents");
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
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log("Edit agent:", agent.id);
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
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log("Edit person:", person.id);
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
                </>
              }
            >
              {filteredCollaborators.map((collaborator) => {
                if (collaborator.type === "agent") {
                  const agent = collaborator.data;
                  return (
                    <NavigationListItem
                      key={`agent-${agent.id}`}
                      label={agent.name}
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
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Edit agent:", agent.id);
                              }}
                            />
                            <DropdownMenuItem
                              label="Remove from favorites"
                              icon={StarStrokeIcon}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Remove from favorites:", agent.id);
                              }}
                            />
                            <DropdownMenuItem
                              label="Delete"
                              icon={TrashIcon}
                              variant="warning"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Delete agent:", agent.id);
                              }}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                      onClick={() => {
                        console.log("Selected agent:", agent.id);
                      }}
                    />
                  );
                } else {
                  const person = collaborator.data;
                  return (
                    <NavigationListItem
                      key={`person-${person.id}`}
                      label={person.fullName}
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
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("View profile:", person.id);
                              }}
                            />
                            <DropdownMenuItem
                              label="Remove from favorites"
                              icon={TrashIcon}
                              variant="warning"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log(
                                  "Remove from favorites:",
                                  person.id
                                );
                              }}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                      onClick={() => {
                        console.log("Selected person:", person.id);
                      }}
                    />
                  );
                }
              })}
            </NavigationListCollapsibleSection>
          )}

          {(filteredConversations.length > 0 || !searchText.trim()) && (
            <NavigationListCollapsibleSection
              label="Conversations"
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
                      moreMenu={getConversationMoreMenu(conversation)}
                      onClick={() => {
                        // Handle conversation click
                        console.log("Selected conversation:", conversation.id);
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
                      moreMenu={getConversationMoreMenu(conversation)}
                      onClick={() => {
                        // Handle conversation click
                        console.log("Selected conversation:", conversation.id);
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
                      moreMenu={getConversationMoreMenu(conversation)}
                      onClick={() => {
                        // Handle conversation click
                        console.log("Selected conversation:", conversation.id);
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
                      moreMenu={getConversationMoreMenu(conversation)}
                      onClick={() => {
                        // Handle conversation click
                        console.log("Selected conversation:", conversation.id);
                      }}
                    />
                  ))}
                </>
              )}
            </NavigationListCollapsibleSection>
          )}
        </NavigationList>
      </ScrollArea>
    </div>
  );

  // Main content
  const mainContent = (
    <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background">
      <div className="s-text-center">
        <p className="s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
          Select a conversation to view
        </p>
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
