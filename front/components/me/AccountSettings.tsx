import { AgentPicker } from "@app/components/assistant/AgentPicker";
import type { NotificationPreferencesRefProps } from "@app/components/me/NotificationPreferences";
import { NotificationPreferences } from "@app/components/me/NotificationPreferences";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useHomeDefaultAgent, usePatchUser, useUser } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import {
  GLOBAL_AGENTS_SID,
  HOME_DEFAULT_AGENT_METADATA_KEY,
} from "@app/types/assistant/assistant";
import type { WorkspaceType } from "@app/types/user";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Edit04,
  Input,
  Label,
  Moon01,
  Page,
  Robot,
  Spinner,
  Sun,
  Tooltip,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

interface AccountSettingsProps {
  owner: WorkspaceType;
}

const AccountSettingsSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  profilePictureUrl: z.string().nullable(),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  submitMessageKey: z.enum(["enter", "cmd+enter"]).default("enter"),
});

type AccountSettingsType = z.infer<typeof AccountSettingsSchema>;

export function AccountSettings({ owner }: AccountSettingsProps) {
  const { user, isUserLoading } = useUser();
  const { theme: currentTheme, setTheme } = useTheme();
  const isMac = useIsMac();
  const modEnterLabel = useMemo(
    () => (isMac ? "Cmd + Enter (⌘ + ↵)" : "Ctrl + Enter"),
    [isMac]
  );
  const modEnterMenuLabel = useMemo(
    () => (isMac ? "Cmd + Enter" : "Ctrl + Enter"),
    [isMac]
  );
  const modEnterShortcut = useMemo(
    () => (isMac ? "⌘ + ↵" : "Ctrl + ↵"),
    [isMac]
  );

  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationPreferencesRef =
    useRef<NotificationPreferencesRefProps>(null);
  const [hasNotificationChanges, setHasNotificationChanges] = useState(false);

  // Personal default agent for new conversations (workspace-scoped). Tracked outside the
  // react-hook-form schema since it persists to UserMetadata, not the user profile.
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });
  const { defaultAgentSId, mutateHomeDefaultAgent } = useHomeDefaultAgent({
    workspaceId: owner.sId,
  });
  // null means "no personal default" (i.e. fall back to @dust).
  const [selectedDefaultAgentSId, setSelectedDefaultAgentSId] = useState<
    string | null
  >(null);
  const [initialDefaultAgentSId, setInitialDefaultAgentSId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const value = defaultAgentSId || null;
    setSelectedDefaultAgentSId(value);
    setInitialDefaultAgentSId(value);
  }, [defaultAgentSId]);

  const hasDefaultAgentChange =
    selectedDefaultAgentSId !== initialDefaultAgentSId;

  // The agent shown in the picker trigger: the user's selection, or @dust as the implicit
  // default when nothing is selected.
  const displayedDefaultAgent =
    agentConfigurations.find(
      (a) => a.sId === (selectedDefaultAgentSId ?? GLOBAL_AGENTS_SID.DUST)
    ) ?? null;

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "avatar",
  });

  const form = useForm<AccountSettingsType>({
    resolver: zodResolver(AccountSettingsSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
      theme: currentTheme ?? "system",
      submitMessageKey: "enter",
    },
  });

  const { field: profilePictureField } = useController({
    name: "profilePictureUrl",
    control: form.control,
  });
  const { field: themeField } = useController({
    name: "theme",
    control: form.control,
  });
  const { field: submitKeyField } = useController({
    name: "submitMessageKey",
    control: form.control,
  });
  const currentImageUrl = profilePictureField.value ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    const storedKey =
      (typeof window !== "undefined" &&
        localStorage.getItem("submitMessageKey")) ??
      null;

    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
        theme: currentTheme ?? "system",
        submitMessageKey:
          storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
      });
    } else {
      // Ensure preferences fields are initialized even without user
      form.setValue("theme", currentTheme ?? "system", { shouldDirty: false });
      form.setValue(
        "submitMessageKey",
        storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
        { shouldDirty: false }
      );
    }
  }, [user, form, currentTheme]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingImage(true);
    const files = await fileUploaderService.handleFilesUpload([file]);
    setIsUploadingImage(false);

    if (files && files.length > 0 && files[0].publicUrl) {
      profilePictureField.onChange(files[0].publicUrl);
    }
  };

  const updateUserProfile = async (data: AccountSettingsType) => {
    const res = await patchUser(
      data.firstName,
      data.lastName,
      true,
      undefined,
      data.profilePictureUrl
    );
    if (res) {
      // Persist preferences upon successful save
      setTheme(data.theme);
      if (typeof window !== "undefined") {
        localStorage.setItem("submitMessageKey", data.submitMessageKey);
      }

      // Save notification preferences if available
      if (notificationPreferencesRef.current) {
        await notificationPreferencesRef.current.savePreferences();
        setHasNotificationChanges(false);
      }

      // Persist the default agent (workspace-scoped). An empty value clears the
      // personal default, falling back to @dust.
      if (hasDefaultAgentChange) {
        await setUserMetadataFromClient(
          {
            key: HOME_DEFAULT_AGENT_METADATA_KEY,
            value: selectedDefaultAgentSId ?? "",
          },
          { workspaceId: owner.sId }
        );
        await mutateHomeDefaultAgent();
        setInitialDefaultAgentSId(selectedDefaultAgentSId);
      }
    }
  };

  const handleCancel = () => {
    const storedKey =
      (typeof window !== "undefined" &&
        localStorage.getItem("submitMessageKey")) ??
      null;

    form.reset({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
      theme: currentTheme ?? "system",
      submitMessageKey:
        storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
    });

    // Reset notification preferences
    if (notificationPreferencesRef.current) {
      notificationPreferencesRef.current.reset();
      setHasNotificationChanges(false);
    }

    setSelectedDefaultAgentSId(initialDefaultAgentSId);
  };

  // Check if notification preferences have changed
  const checkNotificationChanges = () => {
    if (notificationPreferencesRef.current) {
      const isDirty = notificationPreferencesRef.current.isDirty();
      setHasNotificationChanges(isDirty);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }

  const renderNameInput = ({
    label,
    fieldName,
  }: {
    label: string;
    fieldName: "firstName" | "lastName";
  }) => {
    const input = (
      <Input
        label={label}
        {...form.register(fieldName)}
        placeholder={label}
        disabled={isProvisioned}
        isError={!!form.formState.errors[fieldName]}
        message={form.formState.errors[fieldName]?.message}
        messageStatus={form.formState.errors[fieldName] ? "error" : undefined}
      />
    );

    if (isProvisioned) {
      return (
        <Tooltip
          label="Your name is managed by your identity provider and cannot be edited."
          tooltipTriggerAsChild
          trigger={input}
        />
      );
    }

    return input;
  };

  const buttonDisabled =
    (!form.formState.isDirty &&
      !hasNotificationChanges &&
      !hasDefaultAgentChange) ||
    form.formState.isSubmitting;

  return (
    <FormProvider form={form} onSubmit={updateUserProfile}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleImageUpload}
      />
      <div className="flex items-center gap-4 py-2">
        <div className="group relative mb-4">
          <Avatar size="lg" visual={currentImageUrl ?? null} isRounded />
          <Button
            variant="outline"
            size="sm"
            icon={Edit04}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            disabled={isUploadingImage}
            isLoading={isUploadingImage}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            {renderNameInput({ label: "First Name", fieldName: "firstName" })}
          </div>
          <div className="flex-1">
            {renderNameInput({ label: "Last Name", fieldName: "lastName" })}
          </div>
        </div>

        <div className="flex items-center gap-2 py-2">
          <Label>Email</Label>
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            {user?.email}
          </span>
        </div>

        <div className="flex w-full flex-row justify-between gap-4">
          <div className="flex-1">
            <div className="mb-2">
              <Label>Theme</Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  icon={
                    themeField.value === "light"
                      ? Sun
                      : themeField.value === "dark"
                        ? Moon01
                        : Sun
                  }
                  label={
                    themeField.value === "light"
                      ? "Light"
                      : themeField.value === "dark"
                        ? "Dark"
                        : "System"
                  }
                  isSelect
                  className="w-fit"
                />
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    icon={Sun}
                    onClick={() => themeField.onChange("light")}
                    label="Light"
                  />
                  <DropdownMenuItem
                    icon={Moon01}
                    onClick={() => themeField.onChange("dark")}
                    label="Dark"
                  />
                  <DropdownMenuItem
                    icon={Sun}
                    onClick={() => themeField.onChange("system")}
                    label="System"
                  />
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>
          </div>
          <div className="flex-1">
            <div className="mb-2">
              <Label>Keyboard Shortcuts</Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="copy-sm flex items-center gap-2 text-foreground dark:text-foreground-night">
                  Send message:
                  <Button
                    variant="outline"
                    label={
                      submitKeyField.value === "enter"
                        ? "Enter (↵)"
                        : modEnterLabel
                    }
                    isSelect
                    className="w-fit"
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => submitKeyField.onChange("enter")}
                  >
                    Enter
                    <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => submitKeyField.onChange("cmd+enter")}
                  >
                    {modEnterMenuLabel}
                    <DropdownMenuShortcut>
                      {modEnterShortcut}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-2">
            <Label>Default agent</Label>
          </div>
          <div className="flex items-center gap-2">
            <AgentPicker
              owner={owner}
              agents={agentConfigurations}
              showFooterButtons={false}
              onItemClick={(agent) => setSelectedDefaultAgentSId(agent.sId)}
              pickerButton={
                <Button
                  variant="outline"
                  isSelect
                  className="w-fit"
                  icon={
                    displayedDefaultAgent
                      ? () => (
                          <Avatar
                            size="xs"
                            visual={displayedDefaultAgent.pictureUrl}
                          />
                        )
                      : Robot
                  }
                  label={displayedDefaultAgent?.name ?? "Dust"}
                />
              }
            />
            {selectedDefaultAgentSId !== null && (
              <Button
                variant="ghost"
                size="sm"
                label="Reset to default"
                onClick={() => setSelectedDefaultAgentSId(null)}
              />
            )}
          </div>
          <p className="copy-sm mt-1 text-muted-foreground dark:text-muted-foreground-night">
            Pre-selected when you start a new conversation. Defaults to Dust.
          </p>
        </div>

        {user?.subscriberHash && (
          <div className="mt-6 flex flex-col gap-4">
            <Page.SectionHeader
              title="Default Notification Settings"
              description="Tell us what you’d generally like to be notified about."
            />
            <NotificationPreferences
              ref={notificationPreferencesRef}
              onChanged={checkNotificationChanges}
              owner={owner}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            label="Cancel"
            variant="ghost"
            onClick={handleCancel}
            type="button"
            disabled={buttonDisabled}
          />
          <Button
            label="Save"
            variant="primary"
            type="submit"
            disabled={buttonDisabled}
            isLoading={form.formState.isSubmitting}
          />
        </div>
      </div>
    </FormProvider>
  );
}
