import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import type { TriggerType } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

export function getTriggerDescription(trigger: TriggerType): string {
  switch (trigger.kind) {
    case "schedule": {
      const schedule = describeScheduleConfig(trigger.configuration);
      return schedule ? `Runs ${schedule}.` : "";
    }
    case "webhook":
      return trigger.configuration.event
        ? `Triggered by ${trigger.configuration.event} events.`
        : "Triggered by webhook events.";
    case "monitor":
      return `Checks Gmail every ${trigger.configuration.intervalMinutes} minutes.`;
    default:
      assertNeverAndIgnore(trigger);
      return "";
  }
}
