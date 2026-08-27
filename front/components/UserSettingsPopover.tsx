import { MarkdownEditor } from "@app/components/editor/MarkdownEditor";
import {
  NotificationPreferences,
  useNotificationPreferencesForm,
} from "@app/components/me/NotificationPreferences";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import {
  SoundNotificationPreferences,
  useSoundNotificationPreferencesForm,
} from "@app/components/me/SoundNotificationPreferences";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAgentsSectionVisibility } from "@app/hooks/useAgentsSectionVisibility";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { useActivationPod } from "@app/lib/swr/activation";
import {
  usePatchUser,
  usePendingInvitations,
  useUser,
  useUserMemory,
} from "@app/lib/swr/user";
import { useAuthContext } from "@app/lib/swr/workspaces";
import {
  MAX_USER_MEMORY_CHARS,
  MAX_USER_MEMORY_CONTENT_LENGTH,
} from "@app/types/api/me/memory";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { WorkspaceType } from "@app/types/user";
import {
  ANONYMOUS_USER_IMAGE_URL,
  areConversationExternalNotificationsEnabled,
} from "@app/types/user";
import {
  Avatar,
  Bell01,
  Brain,
  Button,
  ContentMessageInline,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Edit04,
  InfoCircle,
  Input,
  Label,
  Mail01,
  Moon01,
  NavigationList,
  NavigationListItem,
  Page,
  Settings01,
  SettingsList,
  SliderToggle,
  Spinner,
  Sun,
  Tabs,
  TabsList,
  TabsTrigger,
  User01,
  XClose,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

type SettingsSection =
  | "personal"
  | "customization"
  | "notifications"
  | "memory"
  | "invitations";

interface UserSettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: WorkspaceType;
}

// ─── Shared section wrapper ───────────────────────────────────────────────────

interface SectionContentProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function SectionContent({
  title,
  description,
  children,
  footer,
}: SectionContentProps) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-8 pt-5 sm:px-6 sm:pt-8">
        <header className="flex flex-col gap-1">
          <h2 className="heading-2xl text-foreground">{title}</h2>
          {description && (
            <p className="copy-sm text-muted-foreground">{description}</p>
          )}
        </header>
        {children}
      </div>
      {footer && (
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border dark:border-border-dark px-6 py-4">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Personal Information ─────────────────────────────────────────────────────

const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  profilePictureUrl: z.string().nullable(),
});

type PersonalInfoType = z.infer<typeof PersonalInfoSchema>;

function PersonalInfoSection({ owner }: { owner: WorkspaceType }) {
  const { user, isUserLoading } = useUser();
  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "avatar",
  });

  const form = useForm<PersonalInfoType>({
    resolver: zodResolver(PersonalInfoSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
    },
  });

  const { field: profilePictureField } = useController({
    name: "profilePictureUrl",
    control: form.control,
  });
  const currentImageUrl = profilePictureField.value ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
      });
    }
  }, [user, form]);

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

  const handleSave = async (data: PersonalInfoType) => {
    await patchUser(
      data.firstName,
      data.lastName,
      true,
      undefined,
      data.profilePictureUrl
    );
  };

  if (isUserLoading) {
    return (
      <SectionContent title="Personal Information">
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      </SectionContent>
    );
  }

  return (
    <SectionContent
      title="Personal Information"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={form.handleSubmit(handleSave)}
          disabled={!form.formState.isDirty || form.formState.isSubmitting}
          isLoading={form.formState.isSubmitting}
        />
      }
    >
      <FormProvider form={form} onSubmit={handleSave}>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleImageUpload}
        />

        <div className="group relative w-fit">
          <Avatar size="lg" visual={currentImageUrl} isRounded />
          <Button
            variant="outline"
            size="sm"
            icon={Edit04}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            disabled={isUploadingImage || isProvisioned}
            isLoading={isUploadingImage}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                label="First Name"
                {...form.register("firstName")}
                placeholder="First Name"
                disabled={isProvisioned}
                isError={!!form.formState.errors.firstName}
                message={form.formState.errors.firstName?.message}
                messageStatus={
                  form.formState.errors.firstName ? "error" : undefined
                }
              />
            </div>
            <div className="flex-1">
              <Input
                label="Last Name"
                {...form.register("lastName")}
                placeholder="Last Name"
                disabled={isProvisioned}
                isError={!!form.formState.errors.lastName}
                message={form.formState.errors.lastName?.message}
                messageStatus={
                  form.formState.errors.lastName ? "error" : undefined
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label>Email</Label>
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </div>
      </FormProvider>
    </SectionContent>
  );
}

// ─── Customization ────────────────────────────────────────────────────────────

function CustomizationSection() {
  const { theme: currentTheme, setTheme } = useTheme();
  const isMac = useIsMac();
  const { isAgentsSectionVisible, setAgentsSectionVisible } =
    useAgentsSectionVisibility();
  const [localAgentsSectionVisible, setLocalAgentsSectionVisible] = useState(
    isAgentsSectionVisible
  );

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

  const [portalContainer] = useState<HTMLElement | undefined>(() =>
    typeof document !== "undefined" ? document.body : undefined
  );

  const [localTheme, setLocalTheme] = useState(currentTheme ?? "system");
  const [submitKey, setSubmitKey] = useState<"enter" | "cmd+enter">(() => {
    if (typeof window === "undefined") {
      return "enter";
    }
    const stored = localStorage.getItem("submitMessageKey");
    return stored && isSubmitMessageKey(stored) ? stored : "enter";
  });
  const isDirty =
    localTheme !== currentTheme ||
    submitKey !==
      (typeof window !== "undefined"
        ? (localStorage.getItem("submitMessageKey") ?? "enter")
        : "enter") ||
    localAgentsSectionVisible !== isAgentsSectionVisible;

  const handleSave = () => {
    setTheme(localTheme as "light" | "dark" | "system");
    if (typeof window !== "undefined") {
      localStorage.setItem("submitMessageKey", submitKey);
    }
    setAgentsSectionVisible(localAgentsSectionVisible);
  };

  return (
    <SectionContent
      title="Customization"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
        />
      }
    >
      <SettingsList>
        <SettingsList.Row
          title="Theme"
          description="Choose how Dust looks on this device"
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  icon={
                    localTheme === "light"
                      ? Sun
                      : localTheme === "dark"
                        ? Moon01
                        : Sun
                  }
                  label={
                    localTheme === "light"
                      ? "Light"
                      : localTheme === "dark"
                        ? "Dark"
                        : "System"
                  }
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent mountPortalContainer={portalContainer}>
                <DropdownMenuItem
                  icon={Sun}
                  label="Light"
                  onClick={() => setLocalTheme("light")}
                />
                <DropdownMenuItem
                  icon={Moon01}
                  label="Dark"
                  onClick={() => setLocalTheme("dark")}
                />
                <DropdownMenuItem
                  icon={Sun}
                  label="System"
                  onClick={() => setLocalTheme("system")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <SettingsList.Row
          title="Send message"
          description="Keyboard shortcut to send a message"
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  label={submitKey === "enter" ? "Enter (↵)" : modEnterLabel}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent mountPortalContainer={portalContainer}>
                <DropdownMenuItem onClick={() => setSubmitKey("enter")}>
                  Enter
                  <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSubmitKey("cmd+enter")}>
                  {modEnterMenuLabel}
                  <DropdownMenuShortcut>
                    {modEnterShortcut}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <SettingsList.Row
          title={'Show "Chat with..." on home'}
          description="Display your favorite and most used agents, and the agent search, on the home page"
          action={
            <SliderToggle
              selected={localAgentsSectionVisible}
              onClick={() =>
                setLocalAgentsSectionVisible(!localAgentsSectionVisible)
              }
            />
          }
        />
      </SettingsList>
    </SectionContent>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection({ owner }: { owner: WorkspaceType }) {
  const { user } = useUser();
  const sendNotification = useSendNotification();
  const sound = useSoundNotificationPreferencesForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showNotificationPreferences = Boolean(user?.subscriberHash);
  const { activationPodId, isActivationPodLoading } = useActivationPod({
    workspaceId: owner.sId,
    disabled: !showNotificationPreferences,
  });
  const displayForYouOption = activationPodId !== null;
  const notif = useNotificationPreferencesForm({
    owner,
    disabled: !showNotificationPreferences,
    displayForYouOption,
  });

  const isDirty = sound.isDirty || notif.isDirty;
  const isLoading =
    sound.isLoading ||
    (showNotificationPreferences &&
      (notif.isLoading || isActivationPodLoading));

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const [soundSaved, notifSaved] = await Promise.all([
        sound.save(),
        notif.save(),
      ]);
      if (soundSaved && notifSaved) {
        sendNotification({
          type: "success",
          title: "Notification preferences saved",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SectionContent
      title="Notifications"
      description="Control how and when Dust notifies you"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSubmitting}
        />
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <Page.SectionHeader
              title="Inbox notifications"
              description="Sound alerts for items that need your attention"
            />
            <SoundNotificationPreferences
              control={sound.control}
              disabled={sound.isLoading}
            />
          </div>
          {showNotificationPreferences && notif.status === "error" && (
            <ContentMessageInline variant="warning" icon={InfoCircle}>
              We couldn't load your notification settings. Please try again
              later.
            </ContentMessageInline>
          )}
          {showNotificationPreferences && notif.status !== "error" && (
            <div className="flex flex-col gap-4">
              <Page.SectionHeader
                title="Other channels"
                description="Choose where else to receive notifications"
              />
              <NotificationPreferences
                control={notif.control}
                displaySlackOption={notif.displaySlackOption}
                displayForYouOption={displayForYouOption}
                workflowEnabled={notif.workflowEnabled}
                conversationExternalNotificationsEnabled={areConversationExternalNotificationsEnabled(
                  owner
                )}
              />
            </div>
          )}
        </>
      )}
    </SectionContent>
  );
}

// ─── Invitations ──────────────────────────────────────────────────────────────

interface InvitationsSectionProps {
  invitations: PendingInvitationOption[];
  isLoading: boolean;
}

function InvitationsSection({
  invitations,
  isLoading,
}: InvitationsSectionProps) {
  return (
    <SectionContent
      title="Invitations"
      description="Workspaces you've been invited to join"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <PendingInvitationsTable invitations={invitations} />
      )}
    </SectionContent>
  );
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function MemorySection({ owner }: { owner: WorkspaceType }) {
  const { content, isMemoryEnabled, isMemoryLoading, setMemory } =
    useUserMemory({ owner });

  const [draft, setDraft] = useState<string | null>(null);
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const value = draft ?? content;
  const enabledValue = enabledDraft ?? isMemoryEnabled;

  const isContentDirty = draft !== null && draft !== content;
  const isEnabledDirty =
    enabledDraft !== null && enabledDraft !== isMemoryEnabled;
  const isDirty = isEnabledDirty || (enabledValue && isContentDirty);
  // The editor shows the visible-character count; the Save gate uses the raw
  // markdown length against the server cap so we never submit a rejected body.
  const isOverLimit = value.length > MAX_USER_MEMORY_CONTENT_LENGTH;

  const handleToggle = () => {
    setEnabledDraft(!enabledValue);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const update: { content?: string; enabled?: boolean } = {};
      if (isEnabledDirty) {
        update.enabled = enabledValue;
      }
      if (enabledValue && isContentDirty) {
        update.content = value;
      }

      const saved = await setMemory(update);
      if (saved) {
        setDraft(null);
        setEnabledDraft(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionContent
      title="Memory"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isOverLimit || isSaving}
        />
      }
    >
      {isMemoryLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-border dark:border-border-dark p-4">
            <div className="flex flex-col gap-1">
              <span className="heading-base text-foreground">
                Enable Memory
              </span>
              <span className="copy-sm text-muted-foreground">
                Dust builds a personal memory from your conversations and uses
                it to tailor future responses.
              </span>
            </div>
            <SliderToggle selected={enabledValue} onClick={handleToggle} />
          </div>

          {enabledValue && (
            <ContentMessageInline
              variant="info"
              icon={InfoCircle}
              className="rounded-2xl p-4"
            >
              The content of your saved memory may appear in responses sent to
              Slack and other external integrations.
            </ContentMessageInline>
          )}

          {enabledValue && (
            <div className="flex flex-col gap-2">
              <span className="heading-base text-foreground">About you</span>
              <MarkdownEditor
                value={value}
                onChange={(markdown) => setDraft(markdown)}
                readOnly={isSaving}
                maxCharacterCount={MAX_USER_MEMORY_CHARS}
                showCharacterCount
                editorClassName="min-h-96"
              />
            </div>
          )}
        </>
      )}
    </SectionContent>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

// Order only. "Memory" (user_memory feature flag) and "Invitations" (pending
// invitations) keep their position here and are filtered out below when not
// applicable.
const NAV_ITEMS: Array<{
  section: SettingsSection;
  icon: React.ComponentType;
  label: string;
}> = [
  { section: "personal", icon: User01, label: "Personal Information" },
  { section: "customization", icon: Settings01, label: "Customization" },
  { section: "memory", icon: Brain, label: "Memory" },
  { section: "notifications", icon: Bell01, label: "Notifications" },
  { section: "invitations", icon: Mail01, label: "Invitations" },
];

export function UserSettingsPopover({
  open,
  onOpenChange,
  owner,
}: UserSettingsPopoverProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("personal");

  const { hasFeature } = useFeatureFlags();
  const hasUserMemory = hasFeature("user_memory");

  // Only fetch while the popover is open: it is always mounted in the user menu.
  const { pendingInvitations, isPendingInvitationsLoading } =
    usePendingInvitations({ workspaceId: owner.sId, disabled: !open });
  const hasPendingInvitations = pendingInvitations.length > 0;
  const { mutateAuthContext } = useAuthContext({
    workspaceId: owner.sId,
    disabled: true,
  });

  // "Memory" is gated on the user_memory feature flag; "Invitations" only
  // appears when the user has pending invitations.
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.section === "memory") {
          return hasUserMemory;
        }
        if (item.section === "invitations") {
          return hasPendingInvitations;
        }
        return true;
      }),
    [hasUserMemory, hasPendingInvitations]
  );

  useEffect(() => {
    if (open) {
      setActiveSection("personal");
      void mutateAuthContext();
    }
  }, [open, mutateAuthContext]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="2xl"
        height="xl"
        className="h-[90vh] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:duration-200 data-[state=closed]:duration-150 data-[state=open]:ease-out data-[state=closed]:ease-in motion-reduce:animate-none"
      >
        <div className="flex h-full flex-col overflow-hidden sm:flex-row">
          {/* Mobile: top horizontal tab menu with an underline on the active tab */}
          <div className="flex flex-shrink-0 flex-col border-b border-border dark:border-border-dark sm:hidden">
            <div className="flex flex-shrink-0 items-center justify-end p-2">
              <DialogClose asChild>
                <Button variant="ghost" size="mini" icon={XClose} />
              </DialogClose>
            </div>
            <Tabs
              value={activeSection}
              onValueChange={(value) => {
                const item = navItems.find((i) => i.section === value);
                if (item) {
                  setActiveSection(item.section);
                }
              }}
              className="px-2"
            >
              <TabsList>
                {navItems.map(({ section, icon, label }) => (
                  <TabsTrigger
                    key={section}
                    value={section}
                    icon={icon}
                    label={label}
                  />
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Desktop: vertical sidebar */}
          <div className="hidden w-64 flex-shrink-0 flex-col border-r border-border dark:border-border-dark sm:flex">
            <div className="flex-shrink-0 p-2">
              <DialogClose asChild>
                <Button variant="ghost" size="mini" icon={XClose} />
              </DialogClose>
            </div>
            <NavigationList className="flex-1 px-2 pb-3">
              {navItems.map(({ section, icon, label }) => (
                <NavigationListItem
                  key={section}
                  icon={icon}
                  label={label}
                  selected={activeSection === section}
                  onClick={() => setActiveSection(section)}
                />
              ))}
            </NavigationList>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {activeSection === "personal" && (
              <PersonalInfoSection owner={owner} />
            )}
            {activeSection === "customization" && <CustomizationSection />}
            {activeSection === "notifications" && (
              <NotificationsSection owner={owner} />
            )}
            {activeSection === "memory" && <MemorySection owner={owner} />}
            {activeSection === "invitations" && (
              <InvitationsSection
                invitations={pendingInvitations}
                isLoading={isPendingInvitationsLoading}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
