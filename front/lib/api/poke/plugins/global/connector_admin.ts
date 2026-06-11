import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger, { auditLog } from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

// The field names for per-connector subcommand selectors.
const CONNECTOR_NAMES = [
  "batch",
  "confluence",
  "connectors",
  "github",
  "gong",
  "google_drive",
  "intercom",
  "microsoft",
  "notion",
  "salesforce",
  "slack",
  "snowflake",
  "temporal",
  "webcrawler",
  "zendesk",
] as const;

type ConnectorName = (typeof CONNECTOR_NAMES)[number];

// Keys used internally for command selection — excluded from CLI args.
const SELECTION_KEYS = new Set<string>([
  "mainCommand",
  ...CONNECTOR_NAMES.map((c) => `${c}SubCommand`),
]);

// Options shared between 2+ connectors are always visible (no mainCommand dependsOn).
// Options unique to one connector depend on both mainCommand and the subcommand having any value.

function dep(connector: ConnectorName) {
  return { field: "mainCommand", value: connector };
}

function uniqueDep(connector: ConnectorName) {
  return [dep(connector), { field: `${connector}SubCommand`, value: "_any" }];
}

export const connectorAdminPlugin = createPlugin({
  manifest: {
    id: "connector-admin-command",
    name: "Connector Admin Command",
    description:
      "Run any connector admin CLI command with individual typed options. Commands and options are loaded dynamically from the connectors API.",
    resourceTypes: ["global"],
    warning:
      "Direct admin operation — bypasses normal connector flows. Use with care.",
    args: {
      // ── Stage 1: main command (async enum, populated from manifest) ────
      mainCommand: {
        type: "enum",
        label: "Main Command",
        description: "Select the connector to administrate.",
        values: [],
        async: true,
        multiple: false,
      },

      // ── Stage 2: per-connector subcommand (async enum) ─────────────────
      batchSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("batch"),
      },
      confluenceSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("confluence"),
      },
      connectorsSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("connectors"),
      },
      githubSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("github"),
      },
      gongSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("gong"),
      },
      google_driveSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("google_drive"),
      },
      intercomSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("intercom"),
      },
      microsoftSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("microsoft"),
      },
      notionSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("notion"),
      },
      salesforceSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("salesforce"),
      },
      slackSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("slack"),
      },
      snowflakeSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("snowflake"),
      },
      temporalSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("temporal"),
      },
      webcrawlerSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("webcrawler"),
      },
      zendeskSubCommand: {
        type: "enum",
        label: "Subcommand",
        values: [],
        async: true,
        multiple: false,
        dependsOn: dep("zendesk"),
      },

      // ── Universal options (shown always, used by many connectors) ──────
      wId: { type: "string", label: "Workspace ID" },
      dsId: { type: "string", label: "Data Source ID" },
      connectorId: { type: "string", label: "Connector ID" },

      // ── Shared options (used by 2+ connectors, always shown) ───────────
      fromTs: {
        type: "string",
        label: "From Timestamp (ms)",
        description: "batch · connectors · gong",
      },
      pageId: {
        type: "string",
        label: "Page ID",
        description: "confluence · notion",
      },
      url: {
        type: "string",
        label: "URL",
        description: "confluence · notion",
      },
      folderId: {
        type: "string",
        label: "Folder ID",
        description: "google_drive · microsoft",
      },
      reason: {
        type: "string",
        label: "Reason",
        description: "google_drive · microsoft · notion",
      },
      skipReason: {
        type: "string",
        label: "Skip Reason",
        description: "confluence · github · slack",
      },
      query: {
        type: "string",
        label: "Query",
        description: "notion · zendesk",
      },
      forceResync: {
        type: "string",
        label: "Force Resync",
        description: "notion · zendesk",
      },
      force: {
        type: "string",
        label: "Force",
        description: "intercom · slack",
      },
      execute: {
        type: "string",
        label: "Execute",
        description: "google_drive · salesforce",
      },

      // ── batch-unique ───────────────────────────────────────────────────
      provider: {
        type: "string",
        label: "Provider",
        dependsOn: uniqueDep("batch"),
      },

      // ── confluence-unique ──────────────────────────────────────────────
      spaceId: {
        type: "string",
        label: "Space ID",
        dependsOn: uniqueDep("confluence"),
      },
      forceUpsert: {
        type: "string",
        label: "Force Upsert",
        dependsOn: uniqueDep("confluence"),
      },
      keyInFile: {
        type: "string",
        label: "Key in File",
        dependsOn: uniqueDep("confluence"),
      },
      file: {
        type: "string",
        label: "File",
        dependsOn: uniqueDep("confluence"),
      },

      // ── connectors-unique ──────────────────────────────────────────────
      error: {
        type: "string",
        label: "Error Message",
        dependsOn: uniqueDep("connectors"),
      },
      permissionKey: {
        type: "string",
        label: "Permission Key",
        dependsOn: uniqueDep("connectors"),
      },
      permissionValue: {
        type: "string",
        label: "Permission Value",
        dependsOn: uniqueDep("connectors"),
      },
      permissionsFile: {
        type: "string",
        label: "Permissions File",
        dependsOn: uniqueDep("connectors"),
      },

      // ── github-unique ──────────────────────────────────────────────────
      owner: {
        type: "string",
        label: "Owner",
        dependsOn: uniqueDep("github"),
      },
      repo: {
        type: "string",
        label: "Repo",
        dependsOn: uniqueDep("github"),
      },
      repoId: {
        type: "string",
        label: "Repo ID",
        dependsOn: uniqueDep("github"),
      },
      repoLogin: {
        type: "string",
        label: "Repo Login",
        dependsOn: uniqueDep("github"),
      },
      repoName: {
        type: "string",
        label: "Repo Name",
        dependsOn: uniqueDep("github"),
      },
      issueNumber: {
        type: "string",
        label: "Issue Number",
        dependsOn: uniqueDep("github"),
      },
      enable: {
        type: "string",
        label: "Enable",
        dependsOn: uniqueDep("github"),
      },
      documentId: {
        type: "string",
        label: "Document ID",
        dependsOn: uniqueDep("github"),
      },

      // ── gong-unique ────────────────────────────────────────────────────
      callId: {
        type: "string",
        label: "Call ID",
        dependsOn: uniqueDep("gong"),
      },

      // ── google_drive-unique ────────────────────────────────────────────
      fileId: {
        type: "string",
        label: "File ID",
        dependsOn: uniqueDep("google_drive"),
      },
      fileType: {
        type: "string",
        label: "File Type",
        dependsOn: uniqueDep("google_drive"),
      },
      rootFolderId: {
        type: "string",
        label: "Root Folder ID",
        dependsOn: uniqueDep("google_drive"),
      },
      fix: {
        type: "string",
        label: "Fix",
        dependsOn: uniqueDep("google_drive"),
      },

      // ── intercom-unique ────────────────────────────────────────────────
      conversationId: {
        type: "string",
        label: "Conversation ID",
        dependsOn: uniqueDep("intercom"),
      },
      day: {
        type: "string",
        label: "Day",
        dependsOn: uniqueDep("intercom"),
      },
      helpCenterId: {
        type: "string",
        label: "Help Center ID",
        dependsOn: uniqueDep("intercom"),
      },
      conversationsSlidingWindow: {
        type: "string",
        label: "Conversations Sliding Window",
        dependsOn: uniqueDep("intercom"),
      },
      teamId: {
        type: "string",
        label: "Team ID",
        dependsOn: uniqueDep("intercom"),
      },
      closedAfter: {
        type: "string",
        label: "Closed After",
        dependsOn: uniqueDep("intercom"),
      },
      state: {
        type: "string",
        label: "State",
        dependsOn: uniqueDep("intercom"),
      },
      cursor: {
        type: "string",
        label: "Cursor",
        dependsOn: uniqueDep("intercom"),
      },
      forceDeleteExisting: {
        type: "string",
        label: "Force Delete Existing",
        dependsOn: uniqueDep("intercom"),
      },

      // ── microsoft-unique ───────────────────────────────────────────────
      internalId: {
        type: "string",
        label: "Internal ID",
        dependsOn: uniqueDep("microsoft"),
      },
      idsFile: {
        type: "string",
        label: "IDs File",
        dependsOn: uniqueDep("microsoft"),
      },

      // ── notion-unique ──────────────────────────────────────────────────
      databaseId: {
        type: "string",
        label: "Database ID",
        dependsOn: uniqueDep("notion"),
      },
      method: {
        type: "string",
        label: "Method",
        dependsOn: uniqueDep("notion"),
      },
      body: {
        type: "text",
        label: "Body",
        dependsOn: uniqueDep("notion"),
      },
      remove: {
        type: "string",
        label: "Remove",
        dependsOn: uniqueDep("notion"),
      },
      all: {
        type: "string",
        label: "All",
        dependsOn: uniqueDep("notion"),
      },
      resetToDate: {
        type: "string",
        label: "Reset to Date",
        dependsOn: uniqueDep("notion"),
      },

      // ── salesforce-unique ──────────────────────────────────────────────
      soql: {
        type: "string",
        label: "SOQL Query",
        dependsOn: uniqueDep("salesforce"),
      },
      limit: {
        type: "string",
        label: "Limit",
        dependsOn: uniqueDep("salesforce"),
      },
      lastModifiedDateOrder: {
        type: "string",
        label: "Last Modified Date Order",
        dependsOn: uniqueDep("salesforce"),
      },
      offset: {
        type: "string",
        label: "Offset",
        dependsOn: uniqueDep("salesforce"),
      },
      rootNodeName: {
        type: "string",
        label: "Root Node Name",
        dependsOn: uniqueDep("salesforce"),
      },
      titleTemplate: {
        type: "string",
        label: "Title Template",
        dependsOn: uniqueDep("salesforce"),
      },
      contentTemplate: {
        type: "text",
        label: "Content Template",
        dependsOn: uniqueDep("salesforce"),
      },
      tagsTemplate: {
        type: "string",
        label: "Tags Template",
        dependsOn: uniqueDep("salesforce"),
      },
      queryId: {
        type: "string",
        label: "Query ID",
        dependsOn: uniqueDep("salesforce"),
      },
      full: {
        type: "string",
        label: "Full",
        dependsOn: uniqueDep("salesforce"),
      },

      // ── slack-unique ───────────────────────────────────────────────────
      channelId: {
        type: "string",
        label: "Channel ID",
        dependsOn: uniqueDep("slack"),
      },
      threadId: {
        type: "string",
        label: "Thread ID",
        dependsOn: uniqueDep("slack"),
      },
      threadTs: {
        type: "string",
        label: "Thread Timestamp",
        dependsOn: uniqueDep("slack"),
      },
      whitelistedDomains: {
        type: "string",
        label: "Whitelisted Domains",
        dependsOn: uniqueDep("slack"),
      },
      botName: {
        type: "string",
        label: "Bot Name",
        dependsOn: uniqueDep("slack"),
      },
      groupId: {
        type: "string",
        label: "Group ID",
        dependsOn: uniqueDep("slack"),
      },
      whitelistType: {
        type: "string",
        label: "Whitelist Type",
        dependsOn: uniqueDep("slack"),
      },
      providerType: {
        type: "string",
        label: "Provider Type",
        dependsOn: uniqueDep("slack"),
      },

      // ── snowflake-unique ───────────────────────────────────────────────
      database: {
        type: "string",
        label: "Database",
        dependsOn: uniqueDep("snowflake"),
      },
      schema: {
        type: "string",
        label: "Schema",
        dependsOn: uniqueDep("snowflake"),
      },

      // ── temporal-unique ────────────────────────────────────────────────
      queue: {
        type: "string",
        label: "Queue",
        dependsOn: uniqueDep("temporal"),
      },

      // ── webcrawler-unique ──────────────────────────────────────────────
      crawlFrequency: {
        type: "string",
        label: "Crawl Frequency",
        dependsOn: uniqueDep("webcrawler"),
      },
      actions: {
        type: "text",
        label: "Actions (JSON)",
        dependsOn: uniqueDep("webcrawler"),
      },

      // ── zendesk-unique ─────────────────────────────────────────────────
      brandId: {
        type: "string",
        label: "Brand ID",
        dependsOn: uniqueDep("zendesk"),
      },
      ticketId: {
        type: "string",
        label: "Ticket ID",
        dependsOn: uniqueDep("zendesk"),
      },
      ticketUrl: {
        type: "string",
        label: "Ticket URL",
        dependsOn: uniqueDep("zendesk"),
      },
      retentionPeriodDays: {
        type: "string",
        label: "Retention Period (days)",
        dependsOn: uniqueDep("zendesk"),
      },
      rateLimitTps: {
        type: "string",
        label: "Rate Limit (TPS)",
        dependsOn: uniqueDep("zendesk"),
      },
      tag: {
        type: "string",
        label: "Tag",
        dependsOn: uniqueDep("zendesk"),
      },
      include: {
        type: "string",
        label: "Include",
        dependsOn: uniqueDep("zendesk"),
      },
      exclude: {
        type: "string",
        label: "Exclude",
        dependsOn: uniqueDep("zendesk"),
      },
    },
  },

  populateAsyncArgs: async () => {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const manifestRes = await connectorsAPI.adminManifest();
    if (manifestRes.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch connectors manifest: ${manifestRes.error.message}`
        )
      );
    }

    const manifest = manifestRes.value;

    // Build mainCommand enum values from manifest keys.
    const mainCommandValues = Object.keys(manifest).map((key) => ({
      label: key,
      value: key,
      checked: false,
    }));

    const asyncArgs: Record<string, unknown> = {
      mainCommand: mainCommandValues,
    };

    // Build per-connector subcommand enum values.
    for (const connector of CONNECTOR_NAMES) {
      const entry = manifest[connector];
      if (
        entry &&
        typeof entry === "object" &&
        "subcommands" in entry &&
        Array.isArray((entry as { subcommands: unknown }).subcommands)
      ) {
        const subcommands = (entry as { subcommands: string[] }).subcommands;
        asyncArgs[`${connector}SubCommand`] = subcommands.map((cmd) => ({
          label: cmd,
          value: cmd,
          checked: false,
        }));
      }
    }

    // AsyncArgsType<T> is a partial record mapping each async field to EnumValue[].
    // The asyncArgs object satisfies that shape — the cast is safe because every
    // value we store is an EnumValue array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Ok(asyncArgs as any);
  },

  execute: async (auth, _, args) => {
    const [mainCommand] = args.mainCommand;
    if (!mainCommand) {
      return new Err(new Error("Please select a main command."));
    }

    const subcommandFields: Record<string, string[]> = {
      batch: args.batchSubCommand,
      confluence: args.confluenceSubCommand,
      connectors: args.connectorsSubCommand,
      github: args.githubSubCommand,
      gong: args.gongSubCommand,
      google_drive: args.google_driveSubCommand,
      intercom: args.intercomSubCommand,
      microsoft: args.microsoftSubCommand,
      notion: args.notionSubCommand,
      salesforce: args.salesforceSubCommand,
      slack: args.slackSubCommand,
      snowflake: args.snowflakeSubCommand,
      temporal: args.temporalSubCommand,
      webcrawler: args.webcrawlerSubCommand,
      zendesk: args.zendeskSubCommand,
    };

    const [subcommand] = subcommandFields[mainCommand] ?? [];
    if (!subcommand) {
      return new Err(new Error("Please select a subcommand."));
    }

    // Fetch manifest to determine which options need numeric coercion.
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const manifestRes = await connectorsAPI.adminManifest();

    // Build a map of option name -> type for the selected connector.
    const optionTypes: Record<string, string> = {};
    if (manifestRes.isOk()) {
      const connectorEntry = manifestRes.value[mainCommand];
      if (
        connectorEntry &&
        typeof connectorEntry === "object" &&
        "options" in connectorEntry &&
        Array.isArray((connectorEntry as { options: unknown }).options)
      ) {
        for (const opt of (
          connectorEntry as { options: Array<{ name: string; type: string }> }
        ).options) {
          optionTypes[opt.name] = opt.type;
        }
      }
    }

    const collectedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (SELECTION_KEYS.has(key)) {
        continue;
      }
      if (typeof value === "string" && value === "") {
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      // Coerce to number when the manifest says this option is numeric.
      if (typeof value === "string" && optionTypes[key] === "number") {
        const coerced = Number(value);
        if (!Number.isNaN(coerced)) {
          collectedArgs[key] = coerced;
          continue;
        }
      }

      collectedArgs[key] = value;
    }

    auditLog(
      {
        author: auth.user()?.toJSON() ?? "no-author",
        majorCommand: mainCommand,
        command: subcommand,
      },
      "Running connector admin command from poke"
    );

    // AdminCommandType is a large io-ts union. The actual validation happens on
    // the connectors API side via Zod. We cast here because we cannot statically
    // prove which union member applies — the connector server will reject invalid
    // combinations with a 400.
    const adminCommand = {
      majorCommand: mainCommand,
      command: subcommand,
      args: collectedArgs,
    } as unknown as AdminCommandType;

    const res = await connectorsAPI.admin(adminCommand);

    if (res.isErr()) {
      return new Err(new Error(res.error.message));
    }

    return new Ok({
      display: "json",
      value: res.value as Record<string, unknown>,
    });
  },
});
