import * as t from "io-ts";

export const ConnectorsCommandSchema = t.type({
  majorCommand: t.literal("connectors"),
  command: t.union([
    t.literal("stop"),
    t.literal("delete"),
    t.literal("resume"),
    t.literal("full-resync"),
    t.literal("set-error"),
    t.literal("restart"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type ConnectorsCommandType = t.TypeOf<typeof ConnectorsCommandSchema>;

export const GithubCommandSchema = t.type({
  majorCommand: t.literal("github"),
  command: t.union([t.literal("resync-repo"), t.literal("code-sync")]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type GithubCommandType = t.TypeOf<typeof GithubCommandSchema>;

export const NotionCommandSchema = t.type({
  majorCommand: t.literal("notion"),
  command: t.union([
    t.literal("restart-all"),
    t.literal("skip-page"),
    t.literal("skip-database"),
    t.literal("upsert-page"),
    t.literal("upsert-database"),
    t.literal("search-pages"),
    t.literal("check-url"),
    t.literal("me"),
    t.literal("stop-all-garbage-collectors"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type NotionCommandType = t.TypeOf<typeof NotionCommandSchema>;

export const GoogleDriveCommandSchema = t.type({
  majorCommand: t.literal("google_drive"),
  command: t.union([
    t.literal("garbage-collect-all"),
    t.literal("check-file"),
    t.literal("restart-google-webhooks"),
    t.literal("start-incremental-sync"),
    t.literal("skip-file"),
    t.literal("register-webhook"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type GoogleDriveCommandType = t.TypeOf<typeof GoogleDriveCommandSchema>;

export const SlackCommandSchema = t.type({
  majorCommand: t.literal("slack"),
  command: t.union([
    t.literal("enable-bot"),
    t.literal("sync-channel"),
    t.literal("sync-thread"),
    t.literal("uninstall-for-unknown-team-ids"),
    t.literal("whitelist-domains"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type SlackCommandType = t.TypeOf<typeof SlackCommandSchema>;

export const BatchCommandSchema = t.type({
  majorCommand: t.literal("batch"),
  command: t.literal("full-resync"),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type BatchCommandType = t.TypeOf<typeof BatchCommandSchema>;

export const WebcrawlerCommandSchema = t.type({
  majorCommand: t.literal("webcrawler"),
  command: t.literal("start-scheduler"),
});

export type WebcrawlerCommandType = t.TypeOf<typeof WebcrawlerCommandSchema>;

export const TemporalCommandSchema = t.type({
  majorCommand: t.literal("temporal"),
  command: t.union([
    t.literal("find-unprocessed-workflows"),
    t.literal("check-queue"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type TemporalCommandType = t.TypeOf<typeof TemporalCommandSchema>;

export const PokeAdminCommandSchema = t.union([
  ConnectorsCommandSchema,
  GithubCommandSchema,
  NotionCommandSchema,
  GoogleDriveCommandSchema,
  SlackCommandSchema,
  BatchCommandSchema,
  WebcrawlerCommandSchema,
  TemporalCommandSchema,
]);

export type PokeAdminCommandType = t.TypeOf<typeof PokeAdminCommandSchema>;
