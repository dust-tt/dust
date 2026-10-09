import { MarkdownEditor } from "@app/components/editor/MarkdownEditor";
import { MODAL_SETTINGS_LIST_CLASSES } from "@app/components/me/modalSettingsList";
import {
  NotificationPreferences,
  useNotificationPreferencesForm,
} from "@app/components/me/NotificationPreferences";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { PronounPresetChips } from "@app/components/me/PronounPresetChips";
import {
  SoundNotificationPreferences,
  useSoundNotificationPreferencesForm,
} from "@app/components/me/SoundNotificationPreferences";
import { JOB_TYPE_LABELS } from "@app/components/onboarding/ProfileOnboardingSteps";
import type { ConversationFont } from "@app/components/sparkle/ConversationFontContext";
import {
  CONVERSATION_FONT_LABELS,
  CONVERSATION_FONTS,
  ConversationFontContext,
} from "@app/components/sparkle/ConversationFontContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { useMemberDetails } from "@app/lib/swr/assistants";
import {
  usePatchUser,
  usePendingInvitations,
  useUser,
  useUserMemory,
} from "@app/lib/swr/user";
import { useAuthContext } from "@app/lib/swr/workspaces";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import {
  MAX_USER_MEMORY_CHARS,
  MAX_USER_MEMORY_CONTENT_LENGTH,
} from "@app/types/api/me/memory";
import { JOB_TYPES } from "@app/types/job_type";
import type { SupportedLocale } from "@app/types/locale";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@app/types/locale";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { WorkspaceType } from "@app/types/user";
import { areConversationExternalNotificationsEnabled } from "@app/types/user";
import { MAX_USER_PRONOUNS_LENGTH } from "@app/types/user_profile";
import type { OptionTile } from "@dust-tt/sparkle";
import {
  Avatar,
  Bell01,
  Brain,
  Button,
  ContentMessageInline,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Edit04,
  InfoCircle,
  Input,
  Mail01,
  Monitor01,
  Moon01,
  NavigationList,
  NavigationListItem,
  OptionTileGroup,
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const ANONYMOUS_USER_IMAGE_URL = "/static/humanavatar/anonymous.png";

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
          <h2 className="heading-xl text-foreground">{title}</h2>
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

function getPersonalInfoSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    firstName: z.string().min(1, t(msg`First name is required.`)),
    lastName: z.string().min(1, t(msg`Last name is required.`)),
    pronouns: z
      .string()
      .max(
        MAX_USER_PRONOUNS_LENGTH,
        t(msg`Pronouns must be at most ${MAX_USER_PRONOUNS_LENGTH} characters.`)
      ),
    jobType: z.enum(JOB_TYPES).nullable(),
    profilePictureUrl: z.string().nullable(),
  });
}

function OptionalRowTitle({ title }: { title: string }) {
  return (
    <>
      {title}{" "}
      <span className="copy-sm text-muted-foreground">
        <Trans>- Optional</Trans>
      </span>
    </>
  );
}

type PersonalInfoType = z.infer<ReturnType<typeof getPersonalInfoSchema>>;

function PersonalInfoSection({ owner }: { owner: WorkspaceType }) {
  const { t } = useLingui();
  const personalInfoSchema = useMemo(() => getPersonalInfoSchema(t), [t]);
  const { user, isUserLoading } = useUser();
  const { userDetails, isMembersLoading, mutateMembers } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: user ? [user.sId] : [],
  });
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
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      pronouns: userDetails?.pronouns ?? "",
      jobType: userDetails?.jobType ?? null,
      profilePictureUrl: user?.image ?? null,
    },
  });

  const { field: profilePictureField } = useController({
    name: "profilePictureUrl",
    control: form.control,
  });
  const currentImageUrl = profilePictureField.value ?? ANONYMOUS_USER_IMAGE_URL;
  const { field: jobTypeField } = useController({
    name: "jobType",
    control: form.control,
  });
  const [portalContainer] = useState<HTMLElement | undefined>(() =>
    typeof document !== "undefined" ? document.body : undefined
  );

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        pronouns: userDetails?.pronouns ?? "",
        jobType: userDetails?.jobType ?? null,
        profilePictureUrl: user.image ?? null,
      });
    }
  }, [user, userDetails, form]);

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

  const { dirtyFields } = form.formState;

  // Only edited optional fields are sent, so a save never overwrites values that were not loaded.
  const handleSave = async (data: PersonalInfoType) => {
    await patchUser({
      firstName: data.firstName,
      lastName: data.lastName,
      notifySuccess: true,
      imageUrl: dirtyFields.profilePictureUrl
        ? data.profilePictureUrl
        : undefined,
      pronouns: dirtyFields.pronouns ? data.pronouns : undefined,
      jobType: dirtyFields.jobType ? (data.jobType ?? undefined) : undefined,
    });
    await mutateMembers();
  };

  if (isUserLoading || isMembersLoading) {
    return (
      <SectionContent title={t`Personal Information`}>
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      </SectionContent>
    );
  }

  return (
    <SectionContent
      title={t`Personal Information`}
      description={t`How you appear to other members of the workspace`}
      footer={
        <Button
          label={t`Save`}
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

        <SettingsList className={MODAL_SETTINGS_LIST_CLASSES}>
          <SettingsList.Row
            title={t`Profile picture`}
            description={
              isProvisioned
                ? t`Managed by your identity provider`
                : t`Shown next to your messages`
            }
            action={
              <div className="group relative w-fit">
                <Avatar size="md" visual={currentImageUrl} isRounded />
                <Button
                  variant="outline"
                  size="sm"
                  icon={Edit04}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  // Circular overlay the exact size of the avatar, so the
                  // hover state reads as "edit this picture", not a square
                  // button floating over a circle.
                  className="absolute inset-0 h-full w-full rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={isUploadingImage || isProvisioned}
                  isLoading={isUploadingImage}
                />
              </div>
            }
          />

          <SettingsList.Row
            title={t`First name`}
            description={
              isProvisioned ? t`Managed by your identity provider` : undefined
            }
            action={
              <div className="w-64">
                <Input
                  {...form.register("firstName")}
                  placeholder={t`First name`}
                  disabled={isProvisioned}
                  isError={!!form.formState.errors.firstName}
                  message={form.formState.errors.firstName?.message}
                  messageStatus={
                    form.formState.errors.firstName ? "error" : undefined
                  }
                />
              </div>
            }
          />

          <SettingsList.Row
            title={t`Last name`}
            description={
              isProvisioned ? t`Managed by your identity provider` : undefined
            }
            action={
              <div className="w-64">
                <Input
                  {...form.register("lastName")}
                  placeholder={t`Last name`}
                  disabled={isProvisioned}
                  isError={!!form.formState.errors.lastName}
                  message={form.formState.errors.lastName?.message}
                  messageStatus={
                    form.formState.errors.lastName ? "error" : undefined
                  }
                />
              </div>
            }
          />

          <SettingsList.Row
            title={<OptionalRowTitle title={t`Pronouns`} />}
            action={
              <div className="flex w-64 flex-col gap-2">
                <Input
                  {...form.register("pronouns")}
                  placeholder={t`e.g. She/Her`}
                  isError={!!form.formState.errors.pronouns}
                  message={form.formState.errors.pronouns?.message}
                  messageStatus={
                    form.formState.errors.pronouns ? "error" : undefined
                  }
                />
                <PronounPresetChips
                  value={form.watch("pronouns")}
                  onSelect={(pronouns) =>
                    form.setValue("pronouns", pronouns, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            }
          />

          <SettingsList.Row
            title={<OptionalRowTitle title={t`Job title`} />}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    label={
                      jobTypeField.value
                        ? t(JOB_TYPE_LABELS[jobTypeField.value])
                        : t({
                            message: "Select",
                            context: "dropdown placeholder",
                          })
                    }
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  mountPortalContainer={portalContainer}
                >
                  {JOB_TYPES.map((jobType) => (
                    <DropdownMenuItem
                      key={jobType}
                      label={t(JOB_TYPE_LABELS[jobType])}
                      onClick={() => jobTypeField.onChange(jobType)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />

          <SettingsList.Row
            title={t`Email`}
            description={t`Used to sign in and receive notifications`}
            action={
              <span className="copy-sm text-muted-foreground">
                {user?.email}
              </span>
            }
          />
        </SettingsList>
      </FormProvider>
    </SectionContent>
  );
}

// ─── Customization ────────────────────────────────────────────────────────────

type ThemeChoice = "light" | "dark" | "system";

type TranslatableOptionTile<T extends string> = Omit<OptionTile<T>, "label"> & {
  label: MessageDescriptor;
};

const THEME_OPTIONS: TranslatableOptionTile<ThemeChoice>[] = [
  {
    value: "light",
    label: msg({ message: "Light", context: "theme" }),
    icon: Sun,
  },
  {
    value: "dark",
    label: msg({ message: "Dark", context: "theme" }),
    icon: Moon01,
  },
  {
    value: "system",
    label: msg({ message: "Auto", context: "theme" }),
    icon: Monitor01,
  },
];

// Each tile previews its option as a type specimen in that face.
const CONVERSATION_FONT_SPECIMEN_CLASSES: Record<ConversationFont, string> = {
  sans: "font-sans",
  serif: "font-serif",
  dyslexic: "font-dyslexic",
};

const CONVERSATION_FONT_OPTIONS: TranslatableOptionTile<ConversationFont>[] =
  CONVERSATION_FONTS.map((font) => ({
    value: font,
    label: CONVERSATION_FONT_LABELS[font],
    visual: (
      <span
        className={cn(
          CONVERSATION_FONT_SPECIMEN_CLASSES[font],
          "text-xl leading-none"
        )}
      >
        Aa
      </span>
    ),
  }));

interface CustomizationSectionProps {
  owner: WorkspaceType;
}

function CustomizationSection({ owner }: CustomizationSectionProps) {
  const { t } = useLingui();
  const { theme: currentTheme, setTheme } = useTheme();
  // Null outside ConversationFontProvider: this
  // popover also renders on pages without conversations (e.g. /no-workspace,
  // /subscribe), where the font setting is hidden.
  const fontContext = useContext(ConversationFontContext) ?? null;
  const sendNotification = useSendNotification();
  const [localConversationFont, setLocalConversationFont] =
    useState<ConversationFont>(fontContext?.conversationFont ?? "sans");
  const isMac = useIsMac();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const {
    userLocale,
    isSaving: isSavingLocale,
    doUpdateUserLocale,
  } = useUserLocale({ owner });
  const [localLocale, setLocalLocale] = useState<SupportedLocale | null>(null);

  const modEnterLabel = isMac ? t`Cmd + Enter (⌘ + ↵)` : t`Ctrl + Enter`;
  const modEnterMenuLabel = isMac ? t`Cmd + Enter` : t`Ctrl + Enter`;
  const modEnterShortcut = useMemo(
    () => (isMac ? "⌘ + ↵" : "Ctrl + ↵"),
    [isMac]
  );

  const [portalContainer] = useState<HTMLElement | undefined>(() =>
    typeof document !== "undefined" ? document.body : undefined
  );

  const [localTheme, setLocalTheme] = useState<ThemeChoice>(
    currentTheme ?? "system"
  );
  const [submitKey, setSubmitKey] = useState<"enter" | "cmd+enter">(() => {
    if (typeof window === "undefined") {
      return "enter";
    }
    const stored = localStorage.getItem("submitMessageKey");
    return stored && isSubmitMessageKey(stored) ? stored : "enter";
  });
  const isDirty =
    localTheme !== currentTheme ||
    (fontContext !== null &&
      localConversationFont !== fontContext.conversationFont) ||
    submitKey !==
      (typeof window !== "undefined"
        ? (localStorage.getItem("submitMessageKey") ?? "enter")
        : "enter") ||
    (localLocale !== null && localLocale !== userLocale);

  const handleSave = () => {
    if (localTheme !== currentTheme) {
      trackEvent({
        area: TRACKING_AREAS.SETTINGS,
        object: "theme",
        action: TRACKING_ACTIONS.SELECT,
        extra: { theme: localTheme },
      });
    }
    setTheme(localTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("submitMessageKey", submitKey);
    }
    if (
      fontContext !== null &&
      localConversationFont !== fontContext.conversationFont
    ) {
      trackEvent({
        area: TRACKING_AREAS.SETTINGS,
        object: "conversation_font",
        action: TRACKING_ACTIONS.SELECT,
        extra: { font: localConversationFont },
      });
      void fontContext
        .setConversationFont(localConversationFont)
        .then((saved) => {
          if (!saved) {
            sendNotification({
              type: "error",
              title: t`Could not save the conversation font`,
              description: t`It applies on this device, but could not be saved to your account.`,
            });
          }
        });
    }
    if (localLocale !== null && localLocale !== userLocale) {
      void doUpdateUserLocale(localLocale).then((saved) => {
        if (saved) {
          setLocalLocale(null);
        }
      });
    }
  };

  return (
    <SectionContent
      title={t`Customization`}
      description={t`Adjust how Dust looks and behaves for you.`}
      footer={
        <Button
          label={t`Save`}
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSavingLocale}
          isLoading={isSavingLocale}
        />
      }
    >
      <SettingsList className={MODAL_SETTINGS_LIST_CLASSES}>
        {hasLocalisation && (
          <SettingsList.Row
            title={t`Language`}
            description={t`Language used by Dust for you, across all your workspaces`}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    label={LOCALE_LABELS[localLocale ?? userLocale]}
                    isSelect
                    disabled={isSavingLocale}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent mountPortalContainer={portalContainer}>
                  <DropdownMenuRadioGroup value={localLocale ?? userLocale}>
                    {SUPPORTED_LOCALES.map((locale) => (
                      <DropdownMenuRadioItem
                        key={locale}
                        value={locale}
                        label={LOCALE_LABELS[locale]}
                        onClick={() => setLocalLocale(locale)}
                      />
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        )}

        <SettingsList.Row
          title={t`Theme`}
          description={t`Choose how Dust looks on this device`}
          className="max-sm:flex-col max-sm:items-start"
          action={
            <OptionTileGroup
              ariaLabel={t`Theme`}
              options={THEME_OPTIONS.map((option) => ({
                ...option,
                label: t(option.label),
              }))}
              value={localTheme}
              onValueChange={setLocalTheme}
            />
          }
        />

        {fontContext !== null && (
          <SettingsList.Row
            title={t`Conversation font`}
            description={t`Font used for agent answers in conversations`}
            className="max-sm:flex-col max-sm:items-start"
            action={
              <OptionTileGroup
                ariaLabel={t`Conversation font`}
                options={CONVERSATION_FONT_OPTIONS.map((option) => ({
                  ...option,
                  label: t(option.label),
                }))}
                value={localConversationFont}
                onValueChange={setLocalConversationFont}
              />
            }
          />
        )}

        <SettingsList.Row
          title={t`Send message`}
          description={t`Keyboard shortcut to send a message`}
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  label={submitKey === "enter" ? t`Enter (↵)` : modEnterLabel}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent mountPortalContainer={portalContainer}>
                <DropdownMenuItem onClick={() => setSubmitKey("enter")}>
                  <Trans context="keyboard key">Enter</Trans>
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
      </SettingsList>
    </SectionContent>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection({ owner }: { owner: WorkspaceType }) {
  const { t } = useLingui();
  const { user } = useUser();
  const sendNotification = useSendNotification();
  const sound = useSoundNotificationPreferencesForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showNotificationPreferences = Boolean(user?.subscriberHash);
  const notif = useNotificationPreferencesForm({
    owner,
    disabled: !showNotificationPreferences,
  });

  const isDirty = sound.isDirty || notif.isDirty;
  const isLoading =
    sound.isLoading || (showNotificationPreferences && notif.isLoading);

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
          title: t`Notification preferences saved`,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SectionContent
      title={t`Notifications`}
      description={t`Control how and when Dust notifies you`}
      footer={
        <Button
          label={t`Save`}
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
              title={t`Inbox notifications`}
              description={t`Sound alerts for items that need your attention`}
            />
            <SoundNotificationPreferences
              control={sound.control}
              disabled={sound.isLoading}
            />
          </div>
          {showNotificationPreferences && notif.status === "error" && (
            <ContentMessageInline variant="warning" icon={InfoCircle}>
              <Trans>
                We couldn't load your notification settings. Please try again
                later.
              </Trans>
            </ContentMessageInline>
          )}
          {showNotificationPreferences && notif.status !== "error" && (
            <div className="flex flex-col gap-4">
              <Page.SectionHeader
                title={t`Other channels`}
                description={t`Choose where else to receive notifications`}
              />
              <NotificationPreferences
                control={notif.control}
                displaySlackOption={notif.displaySlackOption}
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
  const { t } = useLingui();
  return (
    <SectionContent
      title={t`Invitations`}
      description={t`Workspaces you've been invited to join`}
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
  const { t } = useLingui();
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
      title={t`Memory`}
      footer={
        <Button
          label={t`Save`}
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
                <Trans>Enable Memory</Trans>
              </span>
              <span className="copy-sm text-muted-foreground">
                <Trans>
                  Dust builds a personal memory from your conversations and uses
                  it to tailor future responses.
                </Trans>
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
              <Trans>
                Agents use your memory when answering, so their responses,
                including in Slack, can reflect what it contains.
              </Trans>
            </ContentMessageInline>
          )}

          {enabledValue && (
            <div className="flex flex-col gap-2">
              <span className="heading-base text-foreground">
                <Trans>About you</Trans>
              </span>
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
  label: MessageDescriptor;
}> = [
  { section: "personal", icon: User01, label: msg`Personal Information` },
  { section: "customization", icon: Settings01, label: msg`Customization` },
  { section: "memory", icon: Brain, label: msg`Memory` },
  { section: "notifications", icon: Bell01, label: msg`Notifications` },
  { section: "invitations", icon: Mail01, label: msg`Invitations` },
];

export function UserSettingsPopover({
  open,
  onOpenChange,
  owner,
}: UserSettingsPopoverProps) {
  const { t } = useLingui();
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
                    label={t(label)}
                  />
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Desktop: vertical sidebar */}
          <div className="hidden w-72 flex-shrink-0 flex-col border-r border-border dark:border-border-dark sm:flex">
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
                  label={t(label)}
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
            {activeSection === "customization" && (
              <CustomizationSection owner={owner} />
            )}
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
