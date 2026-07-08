import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { ScheduleClient } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";
import parseArgs from "minimist";

const REQUIRED_SCOPE = "https://www.googleapis.com/auth/drive.meet.readonly";

type ConnectionVerdict =
  | "VALID"
  | "VALID_WRONG_SCOPE"
  | "INVALID"
  | "MISSING"
  | "N/A";

type ScheduleStatus =
  | { exists: false }
  | {
      exists: true;
      paused: boolean;
      lastRun: string | null;
      nextRun: string | null;
    };

function extractScope(rawJson: unknown): string | null {
  if (
    rawJson &&
    typeof rawJson === "object" &&
    "scope" in rawJson &&
    typeof rawJson.scope === "string"
  ) {
    return rawJson.scope;
  }
  return null;
}

async function describeSchedule(
  scheduleClient: ScheduleClient,
  scheduleId: string
): Promise<ScheduleStatus> {
  try {
    const desc = await scheduleClient.getHandle(scheduleId).describe();
    const recent = desc.info.recentActions;
    const next = desc.info.nextActionTimes;
    return {
      exists: true,
      paused: desc.state.paused,
      lastRun: recent.length
        ? recent[recent.length - 1].takenAt.toISOString()
        : null,
      nextRun: next.length ? next[0].toISOString() : null,
    };
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      return { exists: false };
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.wId) {
    throw new Error("Missing --wId argument (workspace sId)");
  }

  const auth = await Authenticator.internalAdminForWorkspace(args.wId);
  const workspace = auth.getNonNullableWorkspace();

  const configurations =
    await LabsTranscriptsConfigurationResource.findByWorkspaceId(workspace.id);

  const filtered = args.cId
    ? configurations.filter((c) => c.sId === args.cId)
    : configurations;

  if (filtered.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No transcript configurations found."
    );
    return;
  }

  const { schedule: scheduleClient } =
    await getTemporalClientForFrontNamespace();

  const revokedGoogleDrive: string[] = [];
  const wrongScopeGoogleDrive: string[] = [];
  const validWithLiveSchedule: string[] = [];
  const validDisabledWithHistory: string[] = [];
  const validDisabledNoHistory: string[] = [];

  for (const configuration of filtered) {
    const user = await configuration.getUser();
    const userEmail = user?.email ?? "unknown";
    const hasHistory = await configuration.hasAnyHistory();
    const lastHistoryDate = await configuration.getMostRecentHistoryDate();

    const scheduleId = `retrieve-transcripts-${configuration.workspaceId}-${configuration.id}`;
    const schedule = await describeSchedule(scheduleClient, scheduleId);
    const hasLiveSchedule = schedule.exists && !schedule.paused;

    let verdict: ConnectionVerdict = "N/A";
    let scope: string | null = null;
    let accessTokenExpiry: string | null = null;

    if (configuration.provider === "google_drive") {
      if (!configuration.connectionId) {
        verdict = "MISSING";
      } else {
        const tokRes = await getOAuthConnectionAccessToken({
          config: config.getOAuthAPIConfig(),
          logger,
          connectionId: configuration.connectionId,
        });

        if (tokRes.isErr()) {
          verdict = "INVALID";
        } else {
          scope = extractScope(tokRes.value.scrubbed_raw_json);
          verdict = scope?.includes(REQUIRED_SCOPE)
            ? "VALID"
            : "VALID_WRONG_SCOPE";
          accessTokenExpiry = tokRes.value.access_token_expiry
            ? new Date(tokRes.value.access_token_expiry).toISOString()
            : null;
        }
      }

      switch (verdict) {
        case "INVALID":
          revokedGoogleDrive.push(userEmail);
          break;
        case "VALID_WRONG_SCOPE":
          wrongScopeGoogleDrive.push(userEmail);
          break;
        case "VALID":
          if (hasLiveSchedule) {
            validWithLiveSchedule.push(userEmail);
          } else if (hasHistory) {
            validDisabledWithHistory.push(userEmail);
          } else {
            validDisabledNoHistory.push(userEmail);
          }
          break;
        default:
          break;
      }
    }

    logger.info(
      {
        configId: configuration.sId,
        userEmail: userEmail,
        provider: configuration.provider,
        status: configuration.status,
        dataSourceViewId: configuration.dataSourceViewId,
        agentConfigurationId: configuration.agentConfigurationId,
        connectionId: configuration.connectionId,
        connection: verdict,
        scope,
        accessTokenExpiry,
        hasHistory,
        lastHistoryDate: lastHistoryDate ? lastHistoryDate.toISOString() : null,
        schedule,
        hasLiveSchedule,
      },
      "[transcripts:check] configuration"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      totalConfigurations: filtered.length,
      googleDrive: {
        revokedToken: {
          count: revokedGoogleDrive.length,
          users: revokedGoogleDrive,
        },
        wrongScope: {
          count: wrongScopeGoogleDrive.length,
          users: wrongScopeGoogleDrive,
        },
        validWithLiveSchedule: {
          count: validWithLiveSchedule.length,
          users: validWithLiveSchedule,
        },
        validDisabledWithHistory: {
          count: validDisabledWithHistory.length,
          users: validDisabledWithHistory,
        },
        validDisabledNoHistory: {
          count: validDisabledNoHistory.length,
          users: validDisabledNoHistory,
        },
      },
    },
    "[transcripts:check] SUMMARY"
  );
}

void main().then(
  () => process.exit(0),
  (err) => {
    logger.error({ err }, "[transcripts:check] failed");
    process.exit(1);
  }
);
