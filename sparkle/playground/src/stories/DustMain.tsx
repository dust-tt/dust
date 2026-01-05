import { useEffect, useMemo, useState } from "react";
import {
  InboxIcon,
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SpaceOpenIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  PencilSquareIcon,
  SpaceClosedIcon,
  SearchInput,
  SidebarRightOpenIcon,
  StarStrokeIcon,
  TrashIcon,
  PlusIcon,
  DropdownMenuLabel,
  ContactsUserIcon,
  ContactsRobotIcon,
  UserIcon,
  Card,
  MagnifyingGlassIcon,
  DropdownMenuSeparator,
  LogoutIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  ScrollArea,
  AtomIcon,
  ScrollBar,
} from "@dust-tt/sparkle";
import {
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  mockAgents,
  mockConversations,
  mockUsers,
  type Agent,
  type Space,
  type User,
} from "../data";
import SvgChatBubbleBottomCenterPlus from "@dust-tt/sparkle/dist/esm/icons/app/ChatBubbleBottomCenterPlus";

type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [agentSearchText, setAgentSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

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

  const filteredAgents = useMemo(() => {
    if (!agentSearchText.trim()) {
      return mockAgents;
    }
    const lowerSearch = agentSearchText.toLowerCase();
    return mockAgents.filter((agent) =>
      agent.name.toLowerCase().includes(lowerSearch)
    );
  }, [agentSearchText]);

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

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background">
      {/* Sidebar */}
      <div className="s-flex s-w-[280px] s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
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
                <div className="s-flex s-items-center s-gap-2 s-pr-1">
                  <Avatar
                    name={user.fullName}
                    visual={user.portrait}
                    size="sm"
                    isRounded={true}
                  />
                  <div className="s-flex s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
                    {user.fullName}
                    <span className="-s-mt-0.5 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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
            icon={SidebarRightOpenIcon}
            onClick={() => {
              console.log("Sidebar toggle clicked");
            }}
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
                                filteredAgents.map((agent) => (
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
                        <DropdownMenuItem
                          icon={ContactsUserIcon}
                          label="Browse"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Invite Collaborators");
                          }}
                        />
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
                                  console.log(
                                    "Remove from favorites:",
                                    agent.id
                                  );
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
                        label="Edit"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Edit Conversations");
                        }}
                      />
                      <DropdownMenuItem
                        label="Clear history"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Clear history");
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                {filteredConversations.map((conversation) => (
                  <NavigationListItem
                    key={conversation.id}
                    label={conversation.title}
                    onClick={() => {
                      // Handle conversation click
                      console.log("Selected conversation:", conversation.id);
                    }}
                  />
                ))}
              </NavigationListCollapsibleSection>
            )}
          </NavigationList>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="s-flex s-flex-1 s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
            Select a conversation to view
          </p>
        </div>
      </div>
    </div>
  );
}

export default DustMain;
