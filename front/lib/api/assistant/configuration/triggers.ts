import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { getDustProdAction } from "@app/lib/registry";
import { cloneBaseConfig } from "@app/lib/registry";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, Ok } from "@app/types";

function isValidIANATimezone(timezone: string): boolean {
  // Get the list of all supported IANA timezones
  const supportedTimezones = Intl.supportedValuesOf("timeZone");
  return supportedTimezones.includes(timezone);
}

export async function generateCronRule(
  auth: Authenticator,
  {
    naturalDescription,
    defaultTimezone,
  }: {
    naturalDescription: string;
    defaultTimezone: string;
  }
): Promise<Result<{ cron: string; timezone: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  const config = cloneBaseConfig(
    getDustProdAction("assistant-builder-cron-timezone-generator").config
  );
  config.CREATE_CRON.provider_id = model.providerId;
  config.CREATE_CRON.model_id = model.modelId;
  config.CREATE_TZ.provider_id = model.providerId;
  config.CREATE_TZ.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-builder-cron-timezone-generator",
    config,
    [
      {
        naturalDescription,
        defaultTimezone,
      },
    ],
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
    }
  );

  if (res.isErr()) {
    return new Err(new Error(`Error generating cron rule: ${res.error}`));
  }

  const { eventStream } = res.value;
  let cronRule: string | null = null;
  let timezone: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating cron rule: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating cron rule: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.cron) {
          cronRule = v.cron;
        }
        if (v.timezone) {
          timezone = v.timezone;
        }
      }
    }
  }

  if (
    !cronRule ||
    cronRule.split(" ").length !== 5 ||
    !cronRule.split(" ")[0].match(/^\d+$/) ||
    !cronRule.match(
      /^((((\d+,)+\d+|(\d+(\/|-|#)\d+)|\d+L?|\*(\/\d+)?|L(-\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})|(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)$/
    )
  ) {
    return new Err(
      new Error("Error generating cron rule: malformed cron output")
    );
  }

  if (!timezone || !isValidIANATimezone(timezone)) {
    return new Err(new Error("Error generating cron rule: invalid timezone"));
  }

  return new Ok({ cron: cronRule, timezone });
}
