import {
  Avatar,
  Button,
  Collapsible,
  CollapsibleContent,
  Icon,
  Input,
  Page,
  PencilSquareIcon,
  PlusIcon,
  SlackLogo,
  SliderToggle,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AvatarPicker } from "@app/components/assistant_builder/avatar_picker/AssistantBuilderAvatarPicker";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/assistant_builder/avatar_picker/utils";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { SlackAssistantDefaultManager } from "@app/components/assistant_builder/SlackIntegration";
import { TagsSelector } from "@app/components/assistant_builder/TagsSelector";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { useBuilderActionInfo } from "@app/components/assistant_builder/useBuilderActionInfo";
import { ConfirmContext } from "@app/components/Confirm";
import { MembersList } from "@app/components/members/MembersList";
import { useSendNotification } from "@app/hooks/useNotification";
import { useTags } from "@app/lib/swr/tags";
import { debounce } from "@app/lib/utils/debounce";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  DataSourceType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isBuilder, Ok } from "@app/types";
import type { TagType } from "@app/types/tag";

import { AddEditorDropdown } from "../members/AddEditorsDropdown";

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

type SettingsScreenProps = {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  baseUrl: string;
  builderState: AssistantBuilderState;
  initialHandle: string | undefined;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  assistantHandleError: string | null;
  descriptionError: string | null;
  slackChannelSelected: SlackChannel[];
  slackDataSource: DataSourceType | undefined;
  setSelectedSlackChannels: (channels: SlackChannel[]) => void;
  currentUser: UserType | null;
};

export default function SettingsScreen({
  owner,
  builderState,
  initialHandle,
  setBuilderState,
  setEdited,
  assistantHandleError,
  descriptionError,
  slackChannelSelected,
  slackDataSource,
  setSelectedSlackChannels,
  currentUser,
}: SettingsScreenProps) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [slackDrawerOpened, setSlackDrawerOpened] = useState(false);

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

  const { nonGlobalSpacesUsedInActions } = useBuilderActionInfo(builderState);

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
        avatarUrl = makeUrlForEmojiAndBackground(
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

  const isVisible = builderState.scope === "visible";

  return (
    <>
      {slackDataSource && (
        <SlackAssistantDefaultManager
          existingSelection={slackChannelSelected}
          owner={owner}
          onSave={(slackChannels: SlackChannel[]) => {
            setSelectedSlackChannels(slackChannels);
            setEdited(true);
          }}
          assistantHandle="@Dust"
          show={slackDrawerOpened}
          slackDataSource={slackDataSource}
          onClose={() => setSlackDrawerOpened(false)}
        />
      )}
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

          <div className="relative flex items-start gap-2">
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
            <div className="absolute inset-y-0 right-0 flex items-center pr-1">
              {generatingDescription ? (
                <div className="w-8 px-2">
                  <Spinner size="xs" />
                </div>
              ) : (
                <Button
                  icon={SparklesIcon}
                  variant="ghost"
                  size="xs"
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
        </div>
        <TagsSection
          owner={owner}
          builderState={builderState}
          setBuilderState={setBuilderState}
          setEdited={setEdited}
        />

        <div className="flex flex-row gap-4">
          <div className="flex flex-[1_0_0] flex-col gap-2">
            <Page.SectionHeader title="Access" />
            <div className="flex flex-row items-start gap-2">
              <div className="flex flex-1 flex-row items-start gap-2 py-2">
                <div className="min-w-12">
                  <SliderToggle
                    selected={isVisible}
                    onClick={() => {
                      setBuilderState((state) => ({
                        ...state,
                        scope: isVisible ? "hidden" : "visible",
                      }));
                      setEdited(true);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                    {isVisible ? "Published" : "Not published"}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    {builderState.scope === "visible" && (
                      <>
                        {nonGlobalSpacesUsedInActions.length === 0 && (
                          <>Visible & usable by all members of the workspace.</>
                        )}
                        {nonGlobalSpacesUsedInActions.length > 0 && (
                          <div>
                            Visible & usable by the members of the{" "}
                            {`space${nonGlobalSpacesUsedInActions.length > 1 ? "s" : ""}`}{" "}
                            :{" "}
                            <b>
                              {nonGlobalSpacesUsedInActions
                                .map((v) => v.name)
                                .join(", ")}
                            </b>
                          </div>
                        )}
                      </>
                    )}
                    {builderState.scope === "hidden" && (
                      <>Visible & usable by editors only.</>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <Collapsible open={!!(isVisible && slackDataSource)}>
                  <CollapsibleContent>
                    <div className="flex flex-1 flex-row items-start gap-2">
                      <div>
                        <Icon visual={SlackLogo} size="sm" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                          Slack preferences
                        </span>
                        <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                          {slackChannelSelected.length > 0 ? (
                            <>
                              Default agent for:{" "}
                              {slackChannelSelected
                                .map((c) => c.slackChannelName)
                                .join(", ")}
                            </>
                          ) : (
                            <>
                              Select channels in which this agent replies by
                              default.
                            </>
                          )}
                        </span>
                        <div className="pt-2">
                          <Button
                            size="xs"
                            variant="outline"
                            icon={PencilSquareIcon}
                            label="Select channels"
                            onClick={() => {
                              setSlackDrawerOpened(true);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </div>
        <EditorsMembersList
          currentUser={currentUser}
          isVisible={isVisible}
          owner={owner}
          builderState={builderState}
          setBuilderState={setBuilderState}
          setEdited={setEdited}
        />
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

async function getTagsSuggestions({
  owner,
  instructions,
  description,
  tags,
}: {
  owner: WorkspaceType;
  instructions: string;
  description: string;
  tags: string[];
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "tags",
      inputs: {
        instructions,
        description,
        tags,
        isAdmin: false,
      },
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

const onRowClick = () => {};

function EditorsMembersList({
  currentUser,
  owner,
  builderState,
  setBuilderState,
  setEdited,
  isVisible,
}: {
  currentUser: UserType | null;
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  isVisible: boolean;
}) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  const onRemoveMember = useCallback(
    (removed: UserType) => {
      setBuilderState((s) => ({
        ...s,
        editors: s.editors ? s.editors.filter((m) => m.sId != removed.sId) : [],
      }));
      setEdited(true);
    },
    [setBuilderState, setEdited]
  );

  const members = useMemo(
    () => builderState.editors?.map((m) => ({ ...m, workspace: owner })) ?? [],
    [builderState, owner]
  );

  const membersData = {
    members,
    totalMembersCount: members.length,
    isLoading: false,
    mutateRegardlessOfQueryParams: () => {},
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Page.SectionHeader
          title="Editors"
          description={
            isVisible
              ? "People who can edit the agent."
              : "People who can use and edit the agent."
          }
        />
        <div className="flex flex-grow" />
        <AddEditorDropdown
          owner={owner}
          editors={builderState.editors ?? []}
          trigger={
            <Button
              label="Add editor"
              icon={PlusIcon}
              variant="outline"
              size="sm"
              isSelect
            />
          }
          onAddEditor={(added) => {
            if (builderState.editors?.some((e) => e.sId === added.sId)) {
              return;
            }
            setBuilderState((s) => ({
              ...s,
              editors: [...(s.editors ?? []), added],
            }));
            setEdited(true);
          }}
        />
      </div>
      <MembersList
        currentUser={currentUser}
        membersData={membersData}
        onRowClick={onRowClick}
        onRemoveMemberClick={onRemoveMember}
        showColumns={["name", "email", "remove"]}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}

function TagsSection({
  owner,
  builderState,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  const { tags } = useTags({ owner });
  const [isTagsSuggestionLoading, setTagsSuggestionsLoading] = useState(false);

  const [tagsSuggestions, setTagsSuggestions] =
    useState<BuilderSuggestionsType>({
      status: "unavailable",
      reason: "irrelevant",
    });

  const filteredTagsSuggestions = useMemo(() => {
    if (tagsSuggestions.status !== "ok") {
      return [];
    }
    const currentTagIds = new Set(builderState.tags.map((t) => t.sId));
    // We make sure we don't suggest tags that doesn't already exists
    return tags
      .filter((t) => !currentTagIds.has(t.sId))
      .filter((t) => isBuilder(owner) || t.kind !== "protected")
      .filter(
        (tag) =>
          tagsSuggestions.suggestions?.findIndex(
            (t) => tag.name.toLowerCase() === t.toLowerCase()
          ) !== -1
      )
      .slice(0, 3);
  }, [tagsSuggestions, builderState.tags, tags, owner]);

  const updateTagsSuggestions = useCallback(async () => {
    setTagsSuggestionsLoading(true);
    try {
      const tagsSuggestions = await getTagsSuggestions({
        owner,
        instructions: builderState.instructions || "",
        description: builderState.description || "",
        tags: tags.map((t) => t.name),
      });

      if (tagsSuggestions.isOk()) {
        setTagsSuggestions(tagsSuggestions.value);
      }
    } catch (err) {
      //
    } finally {
      setTagsSuggestionsLoading(false);
    }
  }, [owner, builderState.description, builderState.instructions, tags]);

  return (
    <div className="flex flex-[1_0_0] flex-col gap-4">
      <Page.SectionHeader title="Tags" />
      {tagsSuggestions.status === "ok" &&
        filteredTagsSuggestions.length > 0 && (
          <TagsSuggestions
            builderState={builderState}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
            tagsSuggestions={filteredTagsSuggestions}
          />
        )}
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <TagsSelector
          owner={owner}
          builderState={builderState}
          setBuilderState={setBuilderState}
          setEdited={setEdited}
          suggestionButton={
            <Button
              label="Suggest"
              size="xs"
              icon={SparklesIcon}
              variant="outline"
              isLoading={isTagsSuggestionLoading}
              onClick={updateTagsSuggestions}
            />
          }
        />
      </div>
    </div>
  );
}

function TagsSuggestions({
  builderState,
  setBuilderState,
  setEdited,
  tagsSuggestions,
}: {
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  tagsSuggestions: TagType[];
}) {
  const addTag = async (tag: TagType) => {
    const isTagInAssistant =
      builderState.tags.findIndex((t) => t.sId === tag.sId) !== -1;

    if (!isTagInAssistant) {
      setBuilderState((state) => ({
        ...state,
        tags: state.tags.concat(tag),
      }));
    }

    setEdited(true);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-muted-foregroup text-xs font-semibold dark:text-muted-foreground-night">
        Suggestions:
      </div>

      {tagsSuggestions.map((tag) => (
        <Button
          key={`tag-suggestion-${tag}`}
          size="xs"
          variant="outline"
          label={tag.name}
          onClick={() => addTag(tag)}
        />
      ))}
    </div>
  );
}
