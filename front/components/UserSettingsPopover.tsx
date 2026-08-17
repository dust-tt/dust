import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { MarkdownEditor } from "@app/components/editor/MarkdownEditor";
import {
  ForYouNotificationPreferences,
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
import { MyAwuUsageFromAnalyticsChart } from "@app/components/workspace/AwuUsageFromAnalyticsChart";
import { CreditsCell } from "@app/components/workspace/analytics/creditsTableCells";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { useAppRouter } from "@app/lib/platform";
import { useActivationPod } from "@app/lib/swr/activation";
import {
  useMyTopConversations,
  useMyUsage,
  useSeatPlan,
} from "@app/lib/swr/credits";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  usePatchUser,
  usePendingInvitations,
  useUser,
  useUserMemory,
  useWorkspaceUsageStatus,
} from "@app/lib/swr/user";
import { getConversationRoute } from "@app/lib/utils/router";
import {
  MAX_USER_MEMORY_CHARS,
  MAX_USER_MEMORY_CONTENT_LENGTH,
} from "@app/types/api/me/memory";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  Avatar,
  BarChart01,
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
  Separator,
  Settings01,
  SliderToggle,
  Spinner,
  Stars02,
  Sun,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  User01,
  XClose,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

type SettingsSection =
  | "personal"
  | "usage"
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

// ─── Usage ────────────────────────────────────────────────────────────────────

function ordinalDay(day: number): string {
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

interface MyTopConversationsSectionProps {
  owner: WorkspaceType;
  onClose: () => void;
  visible: boolean;
}

// Conversations ranked by the user's own credit consumption over the last 30
// days. Hidden when there is no consumption to show.
function MyTopConversationsSection({
  owner,
  onClose,
  visible,
}: MyTopConversationsSectionProps) {
  const router = useAppRouter();
  const { topConversations, isTopConversationsLoading } = useMyTopConversations(
    {
      workspaceId: owner.sId,
      disabled: !visible,
    }
  );

  if (!isTopConversationsLoading && topConversations.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">
          Most expensive recent conversations
        </span>
        <Tooltip
          label="Conversations with your highest credit consumption over the last 30 days. Costs only reflect your own messages, not the whole conversation's cost."
          trigger={<InfoCircle className="h-4 w-4 text-muted-foreground" />}
        />
      </div>
      {isTopConversationsLoading ? (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      ) : (
        <NavigationList>
          {topConversations.map((conversation) => (
            <NavigationListItem
              key={conversation.conversationId}
              label={conversation.title ?? "Untitled conversation"}
              onClick={() => {
                onClose();
                void router.push(
                  getConversationRoute(owner.sId, conversation.conversationId)
                );
              }}
              suffix={<CreditsCell credits={conversation.totalCredits} />}
            />
          ))}
        </NavigationList>
      )}
    </section>
  );
}

interface UsageSectionProps {
  owner: WorkspaceType;
  onClose: () => void;
  // The popover stays mounted while closed (animated exit), so gate fetches on
  // visibility to avoid polling the analytics endpoint from a hidden dialog.
  visible: boolean;
}

function UsageSection({ owner, onClose, visible }: UsageSectionProps) {
  const { isManager, subscription } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const canAccessBilling = hasPermission("admin", "billing");

  const isCreditBased = isCreditPricedPlan(subscription.plan);

  const { myUsage, nextCreditResetAt, isMyUsageLoading } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditBased,
  });
  const { seatPlans } = useSeatPlan({
    workspaceId: owner.sId,
    disabled: !isCreditBased,
  });

  const { hasPendingUpgradeRequest } = useWorkspaceUsageStatus({
    owner,
    disabled: isManager || !isCreditBased,
  });

  const seatName =
    (myUsage?.seatType ? seatPlans[myUsage.seatType]?.name : null) ??
    subscription.plan.name;

  const isLoading = isMyUsageLoading;

  const hasPersonalUsage =
    (myUsage?.spendLimitAwuCredits ?? myUsage?.memberUsageLimit ?? null) !==
    null;

  return (
    <SectionContent
      title="Usage"
      description="Manage the usage of your Dust workspace"
    >
      {isCreditBased && (
        <section className="flex flex-col gap-2 rounded-lg bg-muted-background p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-highlight-100 outline outline-1 outline-highlight-500/20">
                <Stars02 className="h-3 w-3 text-highlight-500" />
              </span>
              <span className="text-base font-semibold text-foreground">
                {seatName}
              </span>
            </span>
            <UsageUpgradeButton
              owner={owner}
              hasPendingUpgradeRequest={hasPendingUpgradeRequest}
              variant="button"
              isManager={isManager}
              onManagerNavigate={onClose}
            />
          </div>
          <Separator />
          {isLoading ? (
            <div className="flex justify-center py-2">
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {hasPersonalUsage ? (
                <>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      Your Credits
                    </span>
                    {nextCreditResetAt &&
                      myUsage?.seatType !== "free" &&
                      (() => {
                        const d = new Date(nextCreditResetAt);
                        const month = d.toLocaleDateString("en-US", {
                          month: "long",
                          timeZone: "UTC",
                        });
                        return (
                          <span className="text-xs text-muted-foreground">
                            Resets on {month} {ordinalDay(d.getUTCDate())}
                          </span>
                        );
                      })()}
                  </div>
                  <AwuUsageBar
                    consumed={myUsage?.consumedAwuCredits ?? 0}
                    consumedFromAllowance={
                      myUsage?.consumedFromAllowanceAwuCredits ?? 0
                    }
                    consumedFromPool={myUsage?.consumedFromPoolAwuCredits ?? 0}
                    memberUsageLimit={myUsage?.memberUsageLimit ?? null}
                    seatBalanceAwu={myUsage?.seatBalanceAwu ?? null}
                    effectiveLimit={myUsage?.spendLimitAwuCredits ?? 0}
                    spendLimitSource={myUsage?.spendLimitSource ?? "none"}
                    seatType={myUsage?.seatType ?? null}
                    isTotalAllowedUsagePending={false}
                  />
                </>
              ) : null}
            </div>
          )}
        </section>
      )}

      <MyAwuUsageFromAnalyticsChart
        workspaceId={owner.sId}
        disabled={!visible}
      />

      <MyTopConversationsSection
        owner={owner}
        onClose={onClose}
        visible={visible}
      />

      {canAccessBilling && (
        <section className="flex items-center justify-between border-b border-border dark:border-border-dark pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              Invoices
            </span>
            <span className="text-sm text-muted-foreground">
              Access and download your invoices
            </span>
          </div>
          <Button
            variant="outline"
            size="xs"
            label="Billing"
            icon={ExternalLinkIcon}
            href={`/w/${owner.sId}/${isCreditBased ? "billing" : "subscription"}`}
            target="_blank"
          />
        </section>
      )}
    </SectionContent>
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
        : "enter");

  const handleSave = () => {
    setTheme(localTheme as "light" | "dark" | "system");
    if (typeof window !== "undefined") {
      localStorage.setItem("submitMessageKey", submitKey);
    }
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
      <div className="flex w-full gap-4">
        <div className="flex-1">
          <div className="mb-2">
            <Label>Theme</Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
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
                className="w-fit"
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
        </div>

        <div className="flex-1">
          <div className="mb-2">
            <Label>Keyboard Shortcuts</Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="copy-sm flex items-center gap-2 text-foreground">
                Send message:
                <Button
                  variant="outline"
                  label={submitKey === "enter" ? "Enter (↵)" : modEnterLabel}
                  isSelect
                  className="w-fit"
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent mountPortalContainer={portalContainer}>
              <DropdownMenuItem onClick={() => setSubmitKey("enter")}>
                Enter
                <DropdownMenuShortcut>↵</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSubmitKey("cmd+enter")}>
                {modEnterMenuLabel}
                <DropdownMenuShortcut>{modEnterShortcut}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
          {showNotificationPreferences && (
            <div className="flex flex-col gap-4">
              <Page.SectionHeader
                title="Other channels"
                description="Choose where else to receive notifications"
              />
              {notif.status === "error" ? (
                <ContentMessageInline variant="warning" icon={InfoCircle}>
                  We couldn't load your notification settings. Please try again
                  later.
                </ContentMessageInline>
              ) : (
                <NotificationPreferences
                  control={notif.control}
                  displaySlackOption={notif.displaySlackOption}
                  workflowEnabled={notif.workflowEnabled}
                />
              )}
            </div>
          )}
          {showNotificationPreferences &&
            displayForYouOption &&
            notif.status !== "error" && (
              <div className="flex flex-col gap-4">
                <Page.SectionHeader
                  title="For you"
                  description="Recommendation emails from your learning space"
                />
                <ForYouNotificationPreferences control={notif.control} />
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
  { section: "usage", icon: BarChart01, label: "Usage" },
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
    }
  }, [open]);

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
            {activeSection === "usage" && (
              <UsageSection
                owner={owner}
                onClose={() => onOpenChange(false)}
                visible={open}
              />
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
