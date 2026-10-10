import { MODAL_SETTINGS_LIST_CLASSES } from "@app/components/me/modalSettingsList";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
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
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessageInline,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InfoCircle,
  Lock01,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import cloneDeep from "lodash/cloneDeep";
import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const NOTIFICATION_PREFERENCES_DELAY_LABELS: Record<
  NotificationPreferencesDelay,
  MessageDescriptor
> = {
  "5_minutes": msg`Every 5 minutes`,
  "15_minutes": msg`Every 15 minutes`,
  "30_minutes": msg`Every 30 minutes`,
  "1_hour": msg`Every hour`,
  daily: msg`Once a day`,
  weekly: msg`Once a week`,
};

const NOTIFICATION_CONDITION_LABELS: Record<
  NotificationCondition,
  MessageDescriptor
> = {
  all_messages: msg`All activity`,
  only_mentions: msg`Mentions only`,
  never: msg`Nothing`,
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { canConfigureSlack, isSlackSetupLoading } = useSlackNotifications(
    owner.sId,
    { disabled }
  );
  const displaySlackOption = canConfigureSlack;

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
        sendApiErrorNotification({
          title: t`Error updating notification preferences`,
          error,
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
  conversationExternalNotificationsEnabled: boolean;
}

export function NotificationPreferences({
  control,
  displaySlackOption,
  workflowEnabled,
  conversationExternalNotificationsEnabled,
}: NotificationPreferencesProps) {
  const { t } = useLingui();
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
  const externalChannelsDisabled = !conversationExternalNotificationsEnabled;
  const isInAppEnabled = inAppField.value && workflowEnabled;
  const isSlackEnabled =
    slackField.value && workflowEnabled && !externalChannelsDisabled;
  const isEmailEnabled =
    emailField.value && workflowEnabled && !externalChannelsDisabled;
  const isEmailFrequencyEnabled =
    isEmailEnabled && !notificationsDisabled && !externalChannelsDisabled;
  const slackEmailDisabled = notificationsDisabled || externalChannelsDisabled;

  return (
    <div className="flex flex-col gap-3">
      <SettingsList className={MODAL_SETTINGS_LIST_CLASSES}>
        <SettingsList.Row
          title={t`Notify me about`}
          description={t`Applies to in-app popups, email, and Slack`}
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  label={t(
                    NOTIFICATION_CONDITION_LABELS[notifyConditionField.value]
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent mountPortalContainer={portalContainer}>
                {NOTIFICATION_CONDITION_OPTIONS.map((condition) => (
                  <DropdownMenuItem
                    key={condition}
                    label={t(NOTIFICATION_CONDITION_LABELS[condition])}
                    onClick={() => notifyConditionField.onChange(condition)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <SettingsList.Row
          title={t`In-app popup`}
          description={t`Show a popup inside Dust`}
          action={
            <SliderToggle
              selected={isInAppEnabled}
              disabled={notificationsDisabled}
              onClick={() => inAppField.onChange(!isInAppEnabled)}
            />
          }
        />
      </SettingsList>

      {externalChannelsDisabled && (
        <ContentMessageInline variant="info" icon={InfoCircle}>
          <Trans>
            Email and Slack notifications are turned off for this workspace by
            an admin.
          </Trans>
        </ContentMessageInline>
      )}

      <SettingsList className={MODAL_SETTINGS_LIST_CLASSES}>
        {displaySlackOption && (
          <SettingsList.Row
            title="Slack"
            description={t`A direct message in Slack`}
            action={
              <SliderToggle
                selected={isSlackEnabled}
                disabled={slackEmailDisabled}
                icon={externalChannelsDisabled ? Lock01 : undefined}
                onClick={() => slackField.onChange(!isSlackEnabled)}
              />
            }
          />
        )}

        <SettingsList.Row
          title={t`Email`}
          description={t`Receive a summary by email`}
          action={
            <SliderToggle
              selected={isEmailEnabled}
              disabled={slackEmailDisabled}
              icon={externalChannelsDisabled ? Lock01 : undefined}
              onClick={() => emailField.onChange(!isEmailEnabled)}
            />
          }
        />

        <SettingsList.Row
          title={t`Email frequency`}
          description={t`How often to send email notification summaries`}
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!isEmailFrequencyEnabled}>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  disabled={!isEmailFrequencyEnabled}
                  icon={externalChannelsDisabled ? Lock01 : undefined}
                  label={t(
                    NOTIFICATION_PREFERENCES_DELAY_LABELS[emailDelayField.value]
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent mountPortalContainer={portalContainer}>
                {NOTIFICATION_DELAY_OPTIONS.map((delay) => (
                  <DropdownMenuItem
                    key={delay}
                    label={t(NOTIFICATION_PREFERENCES_DELAY_LABELS[delay])}
                    onClick={() => emailDelayField.onChange(delay)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </SettingsList>
    </div>
  );
}
