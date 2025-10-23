import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { ScheduleFormValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import {
  getScheduleFormDefaultValues,
  ScheduleFormSchema,
} from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { ScheduleEditionSheet } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";

interface ScheduleEditionProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderScheduleTriggerType | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (trigger: AgentBuilderScheduleTriggerType) => void;
}

export function ScheduleEdition({
  owner,
  trigger,
  isOpen,
  onClose,
  onSave,
}: ScheduleEditionProps) {
  const { user } = useUser();

  const isEditor = (trigger?.editor ?? user?.id) === user?.id;

  const defaultValues = useMemo(
    (): ScheduleFormValues => getScheduleFormDefaultValues(trigger),
    [trigger]
  );

  const form = useForm<ScheduleFormValues>({
    defaultValues,
    resolver: zodResolver(ScheduleFormSchema),
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues]);

  const handleSubmit = useCallback(
    async (values: ScheduleFormValues) => {
      if (!user) {
        return;
      }

      const triggerData: AgentBuilderScheduleTriggerType = {
        sId: trigger?.sId,
        enabled: values.enabled,
        name: values.name.trim(),
        kind: "schedule",
        configuration: {
          cron: values.cron.trim(),
          timezone: values.timezone.trim(),
        },
        editor: trigger?.editor ?? user.id ?? null,
        naturalLanguageDescription:
          values.naturalLanguageDescription?.trim() ?? null,
        customPrompt: values.customPrompt?.trim() ?? null,
        editorName: trigger?.editorName ?? user.fullName ?? undefined,
      };

      onSave(triggerData);
    },
    [user, trigger, onSave]
  );

  const onSheetSave = () => {
    return form.handleSubmit(handleSubmit);
  };

  const onCancel = () => {
    form.reset(defaultValues);
  };

  return (
    <FormProvider form={form} onSubmit={handleSubmit}>
      <ScheduleEditionSheet
        owner={owner}
        trigger={trigger}
        isOpen={isOpen}
        onCancel={onCancel}
        onClose={onClose}
        onSave={onSheetSave}
        isEditor={isEditor}
      />
    </FormProvider>
  );
}
