import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useConversationNotificationPreferences } from "@app/lib/swr/notifications";
import { useSlackNotifications, useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  DEFAULT_NOTIFICATION_DELAY,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_CONDITION_OPTIONS,
  NOTIFICATION_DELAY_OPTIONS,
} from "@app/types/notification_preferences";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NewButton,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import cloneDeep from "lodash/cloneDeep";
import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const NOTIFICATION_PREFERENCES_DELAY_LABELS: Record<
  NotificationPreferencesDelay,
  string
> = {
  "5_minutes": "Every 5 minutes",
  "15_minutes": "Every 15 minutes",
  "30_minutes": "Every 30 minutes",
  "1_hour": "Every hour",
  daily: "Once a day",
  weekly: "Once a week",
};

const NOTIFICATION_CONDITION_LABELS: Record<NotificationCondition, string> = {
  all_messages: "All activity",
  only_mentions: "Mentions only",
  never: "Nothing",
};

const NotificationPreferencesFormSchema = z.object({
  notifyCondition: z.enum(NOTIFICATION_CONDITION_OPTIONS),
  emailDelay: z.enum(NOTIFICATION_DELAY_OPTIONS),
  inApp: z.boolean(),
  slack: z.boolean(),
  email: z.boolean(),
});

type NotificationPreferencesFormValues = z.infer<
  typeof NotificationPreferencesFormSchema
>;

export function useNotificationPreferencesForm({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled: boolean;
}) {
  const sendNotification = useSendNotification();
  const { hasFeature } = useFeatureFlags();

  const hasSlackNotificationsFeature = hasFeature(
    "conversations_slack_notifications"
  );
  const { canConfigureSlack, isSlackSetupLoading } = useSlackNotifications(
    owner.sId,
    { disabled: disabled || !hasSlackNotificationsFeature }
  );
  const displaySlackOption = hasSlackNotificationsFeature && canConfigureSlack;

  const { conversationPreferences, status, saveConversationPreferences } =
    useConversationNotificationPreferences({ owner, disabled });

  const {
    metadata: conversationEmailMetadata,
    mutateMetadata: mutateConversationEmailDelay,
  } = useUserMetadata(makeNotificationPreferencesUserMetadata("email"));
  const {
    metadata: notifyConditionMetadata,
    mutateMetadata: mutateNotifyCondition,
  } = useUserMetadata(CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition);

  const form = useForm<NotificationPreferencesFormValues>({
    resolver: zodResolver(NotificationPreferencesFormSchema),
    defaultValues: {
      notifyCondition: DEFAULT_NOTIFICATION_CONDITION,
      emailDelay: DEFAULT_NOTIFICATION_DELAY,
      inApp: false,
      slack: false,
      email: false,
    },
  });

  useEffect(() => {
    if (form.formState.isDirty || !conversationPreferences) {
      return;
    }
    form.reset({
      notifyCondition: isNotificationCondition(notifyConditionMetadata?.value)
        ? notifyConditionMetadata.value
        : DEFAULT_NOTIFICATION_CONDITION,
      emailDelay: isNotificationPreferencesDelay(
        conversationEmailMetadata?.value
      )
        ? conversationEmailMetadata.value
        : DEFAULT_NOTIFICATION_DELAY,
      inApp: Boolean(conversationPreferences.channels.in_app),
      slack: Boolean(conversationPreferences.channels.chat),
      email: Boolean(conversationPreferences.channels.email),
    });
  }, [
    conversationPreferences,
    conversationEmailMetadata,
    notifyConditionMetadata,
    form,
  ]);

  const save = async (): Promise<boolean> => {
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const { dirtyFields } = form.formState;
        if (
          conversationPreferences &&
          (dirtyFields.inApp || dirtyFields.slack || dirtyFields.email)
        ) {
          const updatedPreference = cloneDeep(conversationPreferences);
          updatedPreference.channels.in_app = data.inApp;
          updatedPreference.channels.chat = data.slack;
          updatedPreference.channels.email = data.email;
          await saveConversationPreferences(updatedPreference);
        }
        if (dirtyFields.emailDelay) {
          await setUserMetadataFromClient({
            key: makeNotificationPreferencesUserMetadata("email"),
            value: data.emailDelay,
          });
          await mutateConversationEmailDelay();
        }
        if (dirtyFields.notifyCondition) {
          await setUserMetadataFromClient({
            key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
            value: data.notifyCondition,
          });
          await mutateNotifyCondition();
        }
        form.reset(data);
        succeeded = true;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Error updating notification preferences",
          description: normalizeError(error).message,
        });
      }
    })();
    return succeeded;
  };

  return {
    control: form.control,
    displaySlackOption,
    isDirty: form.formState.isDirty,
    isLoading: status === "loading" || isSlackSetupLoading,
    save,
    status,
    workflowEnabled: Boolean(conversationPreferences?.enabled),
  };
}

interface NotificationPreferencesProps {
  control: Control<NotificationPreferencesFormValues>;
  displaySlackOption: boolean;
  workflowEnabled: boolean;
}

export function NotificationPreferences({
  control,
  displaySlackOption,
  workflowEnabled,
}: NotificationPreferencesProps) {
  const { field: notifyConditionField } = useController({
    name: "notifyCondition",
    control,
  });
  const { field: emailDelayField } = useController({
    name: "emailDelay",
    control,
  });
  const { field: inAppField } = useController({ name: "inApp", control });
  const { field: slackField } = useController({ name: "slack", control });
  const { field: emailField } = useController({ name: "email", control });

  const [portalContainer] = useState<HTMLElement | undefined>(() =>
    typeof document !== "undefined" ? document.body : undefined
  );

  const notificationsDisabled = notifyConditionField.value === "never";
  const isInAppEnabled = inAppField.value && workflowEnabled;
  const isSlackEnabled = slackField.value && workflowEnabled;
  const isEmailEnabled = emailField.value && workflowEnabled;
  const isEmailFrequencyEnabled = isEmailEnabled && !notificationsDisabled;

  return (
    <SettingsList>
      <SettingsList.Row
        title="Notify me about"
        description="Choose which activity sends you a notification"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NewButton
                variant="outline"
                size="sm"
                isSelect
                label={
                  NOTIFICATION_CONDITION_LABELS[notifyConditionField.value]
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent mountPortalContainer={portalContainer}>
              {NOTIFICATION_CONDITION_OPTIONS.map((condition) => (
                <DropdownMenuItem
                  key={condition}
                  label={NOTIFICATION_CONDITION_LABELS[condition]}
                  onClick={() => notifyConditionField.onChange(condition)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <SettingsList.Row
        title="In-app popup"
        description="Show a popup inside Dust"
        action={
          <SliderToggle
            selected={isInAppEnabled}
            disabled={notificationsDisabled}
            onClick={() => inAppField.onChange(!isInAppEnabled)}
          />
        }
      />

      {displaySlackOption && (
        <SettingsList.Row
          title="Slack"
          description="A direct message in Slack"
          action={
            <SliderToggle
              selected={isSlackEnabled}
              disabled={notificationsDisabled}
              onClick={() => slackField.onChange(!isSlackEnabled)}
            />
          }
        />
      )}

      <SettingsList.Row
        title="Email"
        description="Receive a summary by email"
        action={
          <SliderToggle
            selected={isEmailEnabled}
            disabled={notificationsDisabled}
            onClick={() => emailField.onChange(!isEmailEnabled)}
          />
        }
      />

      <SettingsList.Row
        title="Email frequency"
        description="We'll never email you more often than this"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NewButton
                variant="outline"
                size="sm"
                isSelect
                disabled={!isEmailFrequencyEnabled}
                label={
                  NOTIFICATION_PREFERENCES_DELAY_LABELS[emailDelayField.value]
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent mountPortalContainer={portalContainer}>
              {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                <DropdownMenuItem
                  key={delay}
                  label={NOTIFICATION_PREFERENCES_DELAY_LABELS[delay]}
                  onClick={() => emailDelayField.onChange(delay)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </SettingsList>
  );
}
