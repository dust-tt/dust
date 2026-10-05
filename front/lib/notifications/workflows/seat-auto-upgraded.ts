import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { SeatAutoUpgradedPayloadType } from "@app/lib/notifications/triggers/seat-auto-upgraded";
import { SeatAutoUpgradedPayloadSchema } from "@app/lib/notifications/triggers/seat-auto-upgraded";
import {
  SEAT_AUTO_UPGRADED_TAG,
  SEAT_AUTO_UPGRADED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

const isSeatAutoUpgradedPayload = (
  payload: unknown
): payload is SeatAutoUpgradedPayloadType =>
  SeatAutoUpgradedPayloadSchema.safeParse(payload).success;

function formatMember(payload: SeatAutoUpgradedPayloadType): string {
  return payload.memberEmail
    ? `${payload.memberName} (${payload.memberEmail})`
    : payload.memberName;
}

export function buildSeatAutoUpgradedEmailCopy(
  i18n: I18n,
  members: SeatAutoUpgradedPayloadType[]
): { subject: string; content: string } {
  const count = members.length;
  const firstMember = members[0];
  const member = formatMember(firstMember);
  const { previousSeatType, newSeatType } = firstMember;

  const subject =
    count > 1
      ? i18n._(
          msg`[Dust] ${plural(count, {
            one: "# member was auto-upgraded to a higher seat",
            other: "# members were auto-upgraded to higher seats",
          })}`
        )
      : i18n._(
          msg`[Dust] ${member} was auto-upgraded to a ${newSeatType} seat`
        );

  const intro =
    count > 1
      ? i18n._(
          msg`${plural(count, {
            one: "# member reached their credit limit and was automatically upgraded to a higher seat so they can keep working:",
            other:
              "# members reached their credit limit and were automatically upgraded to higher seats so they can keep working:",
          })}`
        )
      : i18n._(
          msg`${member} reached their credit limit and was automatically upgraded from a ${previousSeatType} seat to a ${newSeatType} seat so they can keep working.`
        );
  const list =
    count > 1
      ? members
          .map(
            (m) =>
              `• ${formatMember(m)} — ${m.previousSeatType} → ${m.newSeatType}`
          )
          .join("\n")
      : "";
  const outro = i18n._(
    msg`This might increase your subscription cost. You can turn off automatic seat upgrades from your workspace usage settings.`
  );
  const content = [intro, list, outro].filter(Boolean).join("\n\n");
  return { subject, content };
}

export const seatAutoUpgradedWorkflow = workflow(
  SEAT_AUTO_UPGRADED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const { events } = await step.digest("digest", async () => {
      const digestKey = `${subscriber.subscriberId}-workspace-${payload.workspaceId}-seat-auto-upgrades`;
      return isDevelopment()
        ? { amount: 2, unit: "minutes", digestKey }
        : { cron: "0 */5 * * *", digestKey }; // Every 5 hours
    });

    await step.email(
      "seat-auto-upgraded-email",
      async () => {
        // Dedupe by member (a member could be upgraded more than once across
        // the window) and keep insertion order so the email lists each once.
        const memberByKey = new Map<string, SeatAutoUpgradedPayloadType>();
        for (const event of events) {
          if (!isSeatAutoUpgradedPayload(event.payload)) {
            continue;
          }
          const key = event.payload.memberEmail ?? event.payload.memberName;
          if (!memberByKey.has(key)) {
            memberByKey.set(key, event.payload);
          }
        }
        const members = Array.from(memberByKey.values());

        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );

        const { subject, content } = buildSeatAutoUpgradedEmailCopy(
          i18n,
          members
        );

        const body = await renderEmail({
          i18n,
          name: subscriber.firstName ?? undefined,
          workspace: {
            id: payload.workspaceId,
            name: payload.workspaceName,
          },
          content,
          action: {
            label: i18n._(msg`Go to workspace usage`),
            url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
          },
        });
        return { subject, body };
      },
      {
        skip: async () =>
          !events.some((event) => isSeatAutoUpgradedPayload(event.payload)),
      }
    );
  },
  {
    payloadSchema: SeatAutoUpgradedPayloadSchema,
    tags: [SEAT_AUTO_UPGRADED_TAG],
  }
);
