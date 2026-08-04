import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import type { TriggerType } from "@app/types/assistant/triggers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

export function getTriggerDescription(trigger: TriggerType): string {
  switch (trigger.kind) {
    case "schedule":
      try {
        // cronstrue throws on expressions it cannot parse.
        return `Runs ${describeScheduleConfig(trigger.configuration)}.`;
      } catch {
        return "";
      }
    case "webhook":
      return trigger.configuration.event
        ? `Triggered by ${trigger.configuration.event} events.`
        : "Triggered by webhook events.";
    default:
      assertNeverAndIgnore(trigger);
      return "";
  }
}
