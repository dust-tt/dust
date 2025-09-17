import {
  AnimatedText,
  ArrowRightIcon,
  ContentMessage,
  DotIcon,
  Input,
  Label,
  TextArea,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { TriggerFormData } from "@app/components/agent_builder/triggers/triggerFormSchema";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { debounce } from "@app/lib/utils/debounce";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

const MIN_DESCRIPTION_LENGTH = 10;

function formatTimezone(timezone: string): string {
  const parts = timezone.split("/");
  if (parts.length < 2) {
    return timezone;
  }
  const city = parts[parts.length - 1].replace(/_/g, " ");
  return `${city} (${timezone})`;
}

interface ScheduleTriggerSubFormProps {
  owner: LightWorkspaceType;
  isEditor: boolean;
  resetKey: string;
}

export function ScheduleTriggerSubForm({
  owner,
  isEditor,
  resetKey,
}: ScheduleTriggerSubFormProps) {
  const form = useFormContext<TriggerFormData>();
  const cron = useWatch({ control: form.control, name: "cron" });
  const timezone = useWatch({ control: form.control, name: "timezone" });

  const [naturalDescription, setNaturalDescription] = useState("");
  const [naturalDescriptionStatus, setNaturalDescriptionStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [generatedTimezone, setGeneratedTimezone] = useState<string | null>(
    null
  );
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  const textAsCronRule = useTextAsCronRule({ workspace: owner });

  useEffect(() => {
    if (debounceHandle.current) {
      clearTimeout(debounceHandle.current);
      debounceHandle.current = undefined;
    }
    setNaturalDescription("");
    setNaturalDescriptionStatus("idle");
    setGeneratedTimezone(null);
  }, [owner.sId, resetKey]);

  const cronDescription = useMemo(() => {
    switch (naturalDescriptionStatus) {
      case "loading":
        return "Generating schedule...";
      case "error":
        return "Unable to generate a schedule (note: it can't be more frequent than hourly). Try rephrasing.";
      case "idle":
        if (!cron) {
          return undefined;
        }
        try {
          const cronDesc = cronstrue.toString(cron);
          const tz = generatedTimezone ?? timezone;
          if (!tz) {
            return cronDesc;
          }
          return `${cronDesc}, in ${formatTimezone(tz)} timezone.`;
        } catch (error) {
          setNaturalDescriptionStatus("error");
        }
        break;
      default:
        assertNever(naturalDescriptionStatus);
    }
    return undefined;
  }, [cron, generatedTimezone, naturalDescriptionStatus, timezone]);

  useEffect(
    () => () => {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }
    },
    []
  );

  return (
    <div className="space-y-0">
      <div className="space-y-1">
        <Label htmlFor="schedule-description">Scheduler</Label>
        <TextArea
          id="schedule-description"
          placeholder='Describe when you want the agent to run in natural language. e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
          rows={3}
          value={naturalDescription}
          disabled={!isEditor}
          onChange={async (event) => {
            const value = event.target.value;
            setNaturalDescription(value);
            setNaturalDescriptionStatus(value ? "loading" : "idle");

            if (!value || value.length < MIN_DESCRIPTION_LENGTH) {
              if (debounceHandle.current) {
                clearTimeout(debounceHandle.current);
                debounceHandle.current = undefined;
              }
              return;
            }

            debounce(
              debounceHandle,
              async () => {
                form.setValue("cron", "");
                try {
                  const result = await textAsCronRule(value);
                  form.setValue("cron", result.cron, { shouldDirty: true });
                  form.setValue("timezone", result.timezone, {
                    shouldDirty: true,
                  });
                  setGeneratedTimezone(result.timezone);
                  setNaturalDescriptionStatus("idle");
                } catch (error) {
                  setNaturalDescriptionStatus("error");
                  setGeneratedTimezone(null);
                }
              },
              500
            );
          }}
        />

        {cronDescription && (
          <div className="my-2">
            <ContentMessage variant="outline" size="lg">
              <div className="flex flex-row items-start gap-2 text-foreground dark:text-foreground-night">
                {naturalDescriptionStatus === "loading" ? (
                  <>
                    <DotIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                    <AnimatedText variant="primary">
                      {cronDescription}
                    </AnimatedText>
                  </>
                ) : (
                  <>
                    <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                    <p>{cronDescription}</p>
                  </>
                )}
              </div>
            </ContentMessage>
          </div>
        )}
      </div>

      <Input
        id="trigger-cron"
        {...form.register("cron")}
        placeholder="e.g., 0 9 * * 1-5 (weekdays at 9 AM)"
        isError={
          !!("cron" in form.formState.errors
            ? form.formState.errors.cron
            : false)
        }
        message={
          "cron" in form.formState.errors
            ? form.formState.errors.cron?.message
            : undefined
        }
        messageStatus="error"
        className="hidden"
      />

      <Input
        id="trigger-timezone"
        {...form.register("timezone")}
        placeholder="e.g., America/New_York, Europe/Paris"
        isError={
          !!("timezone" in form.formState.errors
            ? form.formState.errors.timezone
            : false)
        }
        message={
          "timezone" in form.formState.errors
            ? form.formState.errors.timezone?.message
            : undefined
        }
        messageStatus="error"
        className="hidden"
      />
    </div>
  );
}
