import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Page,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AvatarPicker } from "@app/components/assistant_builder/avatar_picker/AssistantBuilderAvatarPicker";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackgroud,
} from "@app/components/assistant_builder/avatar_picker/utils";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import { TagsSelector } from "@app/components/assistant_builder/TagsSelector";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { MembersList } from "@app/components/members/MembersList";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { debounce } from "@app/lib/utils/debounce";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  Result,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

function assistantHandleIsValid(handle: string) {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(removeLeadingAt(handle));
}

async function assistantHandleIsAvailable({
  owner,
  handle,
  initialHandle,
  checkUsernameTimeout,
}: {
  owner: WorkspaceType;
  handle: string;
  initialHandle: string | undefined;
  checkUsernameTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
}) {
  if (checkUsernameTimeout.current) {
    clearTimeout(checkUsernameTimeout.current);
  }
  // No check needed if the agent doesn't change name
  if (handle === initialHandle) {
    return Promise.resolve(true);
  }
  return new Promise((resolve, reject) => {
    checkUsernameTimeout.current = setTimeout(async () => {
      checkUsernameTimeout.current = null;
      const res = await fetch(
        `/api/w/${
          owner.sId
        }/assistant/agent_configurations/name_available?handle=${encodeURIComponent(
          handle
        )}`
      );
      if (!res.ok) {
        return reject(
          new Error("An error occurred while checking the handle.")
        );
      }
      const { available } = await res.json();
      return resolve(available);
    }, 500);
  });
}

export async function validateHandle({
  owner,
  handle,
  initialHandle,
  checkUsernameTimeout,
}: {
  owner: WorkspaceType;
  handle: string | null;
  initialHandle: string | undefined;
  checkUsernameTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
}): Promise<{
  handleValid: boolean;
  handleErrorMessage: string | null;
}> {
  let errorMessage: string | null = null;

  if (!handle || handle === "@") {
    errorMessage = "The name cannot be empty";
  } else {
    if (!assistantHandleIsValid(handle)) {
      if (handle.length > 30) {
        errorMessage = "The name must be 30 characters or less";
      } else {
        errorMessage = "Only letters, numbers, _ and - allowed";
      }
    } else if (
      !(await assistantHandleIsAvailable({
        owner,
        handle,
        initialHandle,
        checkUsernameTimeout,
      }))
    ) {
      errorMessage = "This name is already taken";
    }
  }

  return {
    handleValid: !errorMessage,
    handleErrorMessage: errorMessage,
  };
}

export default function NamingScreen({
  owner,
  builderState,
  initialHandle,
  setBuilderState,
  setEdited,
  assistantHandleError,
  descriptionError,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  initialHandle: string | undefined;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  assistantHandleError: string | null;
  descriptionError: string | null;
}) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  // Name suggestions handling
  const [nameSuggestions, setNameSuggestions] =
    useState<BuilderSuggestionsType>({
      status: "unavailable",
      reason: "irrelevant",
    });
  const nameDebounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  const checkUsernameTimeout = useRef<NodeJS.Timeout | null>(null);
  const updateNameSuggestions = useCallback(async () => {
    const nameSuggestions = await getNamingSuggestions({
      owner,
      instructions: builderState.instructions || "",
      description: builderState.description || "",
    });
    if (nameSuggestions.isOk()) {
      setNameSuggestions(nameSuggestions.value);
    }
  }, [owner, builderState.instructions, builderState.description]);

  const updateEmojiFromSuggestions = useCallback(async () => {
    let avatarUrl: string | null = null;
    const emojiSuggestions = await getEmojiSuggestions({
      owner,
      instructions: builderState.instructions || "",
    });
    if (emojiSuggestions.isOk() && emojiSuggestions.value.suggestions.length) {
      const suggestion = emojiSuggestions.value.suggestions[0];
      const emoji = buildSelectedEmojiType(suggestion.emoji);
      if (emoji) {
        avatarUrl = makeUrlForEmojiAndBackgroud(
          {
            id: emoji.id,
            unified: emoji.unified,
            native: emoji.native,
          },
          suggestion.backgroundColor as `bg-${string}`
        );
      }
      // Default on Ed's babies if no emoji is found
      if (!avatarUrl) {
        const availableUrls = [...DROID_AVATAR_URLS, ...SPIRIT_AVATAR_URLS];
        avatarUrl =
          availableUrls[Math.floor(Math.random() * availableUrls.length)];
      }

      setBuilderState((state) => ({
        ...state,
        avatarUrl,
      }));
    }
  }, [owner, builderState.instructions, setBuilderState]);

  useEffect(() => {
    debounce(nameDebounceHandle, updateNameSuggestions);
  }, [
    builderState.description,
    builderState.instructions,
    owner,
    updateNameSuggestions,
  ]);

  // Emoji suggestion handling

  useEffect(() => {
    if (!builderState.avatarUrl) {
      void updateEmojiFromSuggestions();
    }
  }, [builderState.avatarUrl, updateEmojiFromSuggestions]);

  // Description suggestions handling

  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionIsGenerated, setDescriptionIsGenerated] = useState(false);
  const [isDescriptionInputDisabled, setIsDescriptionInputDisabled] =
    useState(false);

  const suggestDescription = useCallback(
    async (fromUserClick?: boolean) => {
      if (!fromUserClick && builderState.description?.trim()) {
        return;
      }

      setGeneratingDescription(true);
      if (fromUserClick) {
        setIsDescriptionInputDisabled(true);
      }

      const notifyError = fromUserClick ? sendNotification : console.log;
      const descriptionSuggestions = await getDescriptionSuggestions({
        owner,
        instructions: builderState.instructions || "",
        name: builderState.handle || "",
      });

      if (descriptionSuggestions.isOk()) {
        const suggestion =
          descriptionSuggestions.value.status === "ok" &&
          descriptionSuggestions.value.suggestions?.length
            ? descriptionSuggestions.value.suggestions[0]
            : null;
        if (suggestion) {
          setBuilderState((currentState) => {
            // For manual generation, always apply. For auto, only if empty
            const shouldApplySuggestion =
              fromUserClick || !currentState.description?.trim();

            if (!shouldApplySuggestion) {
              return currentState;
            }

            setDescriptionIsGenerated(true);
            return {
              ...currentState,
              description: suggestion,
            };
          });
        } else {
          const errorMessage =
            descriptionSuggestions.value.status === "unavailable"
              ? descriptionSuggestions.value.reason ||
                "No suggestions available"
              : "No suggestions available";
          notifyError({
            type: "error",
            title: "Error generating description suggestion.",
            description: errorMessage,
          });
        }
      } else if (fromUserClick) {
        notifyError({
          type: "error",
          title: "Error generating description suggestion.",
          description: descriptionSuggestions.error.message,
        });
      }

      setGeneratingDescription(false);
      if (fromUserClick) {
        setIsDescriptionInputDisabled(false);
      }
    },
    [
      builderState.description,
      builderState.instructions,
      builderState.handle,
      sendNotification,
      owner,
      setBuilderState,
    ]
  );

  useEffect(() => {
    if (
      !builderState.description?.trim() &&
      builderState.instructions?.trim() &&
      !generatingDescription
    ) {
      void suggestDescription();
    }
    // Here we only want to run this effect once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AvatarPicker
        owner={owner}
        isOpen={isAvatarModalOpen}
        setOpen={setIsAvatarModalOpen}
        onPick={(avatarUrl) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            avatarUrl,
          }));
        }}
        droidAvatarUrls={DROID_AVATAR_URLS}
        spiritAvatarUrls={SPIRIT_AVATAR_URLS}
        avatarUrl={builderState.avatarUrl}
      />

      <div className="flex w-full flex-col gap-5">
        <Page.Header title="Naming" />
        <div className="flex gap-8">
          <div className="flex flex-grow flex-col gap-4">
            <div>
              <Page.SectionHeader title="Handle" />
              <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                Handles are used to mention (call) an agent. They must be
                descriptive and unique.
              </div>
            </div>
            {nameSuggestions.status === "ok" &&
              nameSuggestions.suggestions?.length && (
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground-night">
                    Suggestions:
                  </div>
                  {nameSuggestions.suggestions
                    .slice(0, 3)
                    .filter(async () =>
                      validateHandle({
                        owner,
                        handle: builderState.handle,
                        initialHandle,
                        checkUsernameTimeout,
                      })
                    )
                    .map((suggestion, index) => (
                      <Button
                        label={`@${suggestion.replace(/\s/g, "")}`}
                        variant="outline"
                        key={`naming-suggestion-${index}`}
                        size="xs"
                        onClick={() => {
                          setEdited(true);
                          setBuilderState((state) => ({
                            ...state,
                            // remove all whitespaces from suggestion
                            handle: suggestion.replace(/\s/g, ""),
                          }));
                        }}
                      />
                    ))}
                </div>
              )}

            <div>
              <Input
                placeholder="SalesAgent, FrenchTranslator, SupportCenter…"
                value={builderState.handle}
                onChange={(e) => {
                  setEdited(true);
                  setBuilderState((state) => ({
                    ...state,
                    handle: e.target.value.trim(),
                  }));
                }}
                name="assistantName"
                className="text-sm"
                message={assistantHandleError}
                messageStatus="error"
              />
            </div>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Avatar size="xl" visual={builderState.avatarUrl} />
            <Button
              label="Change"
              variant="outline"
              size="xs"
              icon={PencilSquareIcon}
              onClick={() => {
                setIsAvatarModalOpen(true);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex gap-1">
              <Page.SectionHeader title="Description" />
            </div>
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              Describe for others the agent’s purpose.{" "}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-grow">
              <Input
                placeholder={
                  generatingDescription
                    ? "Generating description..."
                    : "Click on sparkles to generate a description"
                }
                value={builderState.description}
                onChange={(e) => {
                  setEdited(true);
                  setDescriptionIsGenerated(false);
                  setBuilderState((state) => ({
                    ...state,
                    description: e.target.value,
                  }));
                }}
                name="assistantDescription"
                message={descriptionError}
                messageStatus="error"
                disabled={isDescriptionInputDisabled}
              />
            </div>
            {generatingDescription ? (
              <Spinner size="sm" />
            ) : (
              <IconButton
                icon={SparklesIcon}
                size="md"
                disabled={generatingDescription}
                onClick={async () => {
                  if (
                    !builderState.description?.trim() ||
                    descriptionIsGenerated ||
                    (await confirm({
                      title: "Double checking",
                      message:
                        "Heads up! This will overwrite your current description. Are you sure you want to proceed?",
                    }))
                  ) {
                    await suggestDescription(true);
                  }
                }}
                tooltip="Click to generate a description"
              />
            )}
          </div>
        </div>
        {featureFlags.includes("agent_discovery") && (
          <>
            <div className="flex flex-row gap-4">
              <div className="flex flex-[1_0_0] flex-col gap-4">
                <Page.SectionHeader title="Visibility" />
                <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night"></div>
              </div>
              <div className="flex flex-[1_0_0] flex-col gap-4">
                <Page.SectionHeader title="Tags" />
                <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                  <TagsSelector
                    owner={owner}
                    builderState={builderState}
                    setBuilderState={setBuilderState}
                    setEdited={setEdited}
                  />
                </div>
              </div>
            </div>
            <EditorsMembersList currentUserId={"mock1"} owner={owner} />
          </>
        )}
      </div>
    </>
  );
}

async function getNamingSuggestions({
  owner,
  instructions,
  description,
}: {
  owner: WorkspaceType;
  instructions: string;
  description: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "name",
      inputs: { instructions, description },
    }),
  });
}

async function getEmojiSuggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<BuilderEmojiSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "emoji",
      inputs: { instructions },
    }),
  });
}

async function getDescriptionSuggestions({
  owner,
  instructions,
  name,
}: {
  owner: WorkspaceType;
  instructions: string;
  name: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "description",
      inputs: { instructions, name },
    }),
  });
}

async function fetchWithErr<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Result<T, APIError>> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      return new Err({
        type: "internal_server_error",
        message: `Failed to fetch: ${
          res.statusText
        }\nResponse: ${await res.text()}`,
      });
    }

    return new Ok((await res.json()) as T);
  } catch (e) {
    return new Err({
      type: "internal_server_error",
      message: `Failed to fetch.\nError: ${e}`,
    });
  }
}

const DEFAULT_PAGE_SIZE = 25;

function EditorsMembersList({
  currentUserId,
  owner,
}: {
  currentUserId: string;
  owner: WorkspaceType;
}) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  const membersData = {
    members: [
      {
        sId: "mock1",
        fullName: "Mock User 1",
        email: "mock1@test.com",
        image: "https://example.com/image.png",
        workspaces: [
          {
            role: "admin" as const,
            sId: "mock1",
            name: "Mock Workspace 1",
            id: 1,
            segmentation: null,
            whiteListedProviders: null,
            defaultEmbeddingProvider: null,
            metadata: null,
          },
        ],
        id: 1,
        createdAt: 0,
        provider: null,
        username: "mock1",
        firstName: "Mock",
        lastName: "User 1",
      },
      {
        sId: "mock2",
        fullName: "Mock User 2",
        email: "mock2@test.com",
        image: "https://example.com/image.png",
        workspaces: [
          {
            role: "admin" as const,
            sId: "mock1",
            name: "Mock Workspace 1",
            id: 1,
            segmentation: null,
            whiteListedProviders: null,
            defaultEmbeddingProvider: null,
            metadata: null,
          },
        ],
        id: 2,
        createdAt: 0,
        provider: null,
        username: "mock2",
        firstName: "Mock",
        lastName: "User 2",
      },
    ],
    totalMembersCount: 2,
    isLoading: false,
    mutateRegardlessOfQueryParams: () => Promise.resolve(undefined),
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Page.SectionHeader title="Editors" />
        <div className="flex flex-grow" />
        <AddEditorDropdown
          owner={owner}
          onAddEditor={() => membersData.mutateRegardlessOfQueryParams()}
        />
      </div>
      <MembersList
        currentUserId={currentUserId}
        membersData={membersData}
        onRowClick={() => {}}
        onRemoveMemberClick={() => {}}
        showColumns={["name", "email", "remove"]}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}

function AddEditorDropdown({
  owner,
  onAddEditor,
}: {
  owner: WorkspaceType;
  onAddEditor: (member: UserTypeWithWorkspaces) => Promise<void>;
}) {
  const [isEditorPickerOpen, setIsEditorPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const { members: workspaceMembers, isLoading: isWorkspaceMembersLoading } =
    useSearchMembers({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: 0,
      pageSize: 25,
    });

  return (
    <DropdownMenu
      open={isEditorPickerOpen}
      onOpenChange={setIsEditorPickerOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={PlusIcon}
          variant="outline"
          size="sm"
          isSelect
          label="Add editor"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-[380px]"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              ref={searchInputRef}
              name="search"
              onChange={(value) => setSearchTerm(value)}
              placeholder="Search members"
              value={searchTerm}
              button={<Button icon={PlusIcon} label="Create" />}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isWorkspaceMembersLoading ? (
          <Spinner size="sm" />
        ) : (
          workspaceMembers.map((member) => {
            return (
              <DropdownMenuItem
                key={member.sId}
                label={member.fullName}
                description={member.email}
                icon={() => <Avatar size="sm" visual={member.image} />}
                onClick={async () => {
                  setSearchTerm("");
                  setIsEditorPickerOpen(false);
                  await onAddEditor(member);
                }}
                truncateText
              />
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
