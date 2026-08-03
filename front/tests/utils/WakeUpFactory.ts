import type { Authenticator } from "@app/lib/auth";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { faker } from "@faker-js/faker";

type WakeUpConversation = Parameters<typeof WakeUpResource.makeNew>[2];
type WakeUpAgentConfiguration = Parameters<typeof WakeUpResource.makeNew>[3];

interface CronWakeUpOptions {
  cronExpression?: string;
  cronTimezone?: string;
  reason?: string;
}

export class WakeUpFactory {
  static async cron(
    auth: Authenticator,
    conversation: WakeUpConversation,
    agentConfiguration: WakeUpAgentConfiguration,
    options: CronWakeUpOptions = {}
  ): Promise<WakeUpResource> {
    const result = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "cron",
        fireAt: null,
        cronExpression: options.cronExpression ?? "0 7 * * *",
        cronTimezone: options.cronTimezone ?? "Europe/Paris",
        reason: options.reason ?? `wakeup-${faker.string.alphanumeric(8)}`,
      },
      conversation,
      agentConfiguration
    );

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }
}
