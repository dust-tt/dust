'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var t = require('io-ts');
var Either = require('fp-ts/lib/Either');
var reporter = require('io-ts-reporters');
var uuid = require('uuid');
var nonEmptyArray = require('io-ts-types/lib/nonEmptyArray');
var NonEmptyString = require('io-ts-types/lib/NonEmptyString');
var eventsourceParser = require('eventsource-parser');
var ioTsTypes = require('io-ts-types');
var NumberFromString = require('io-ts-types/lib/NumberFromString');
var redis = require('redis');
var hotShots = require('hot-shots');
var child_process = require('child_process');
var Either$1 = require('fp-ts/Either');
var htmlparser2 = require('htmlparser2');
var stream = require('stream');
var sync = require('csv-stringify/sync');
var crypto = require('crypto');
var csvParse = require('csv-parse');
var csvStringify = require('csv-stringify');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return n;
}

var t__namespace = /*#__PURE__*/_interopNamespaceDefault(t);
var reporter__namespace = /*#__PURE__*/_interopNamespaceDefault(reporter);
var child_process__namespace = /*#__PURE__*/_interopNamespaceDefault(child_process);

/**
 * A Result is a type that can be either Ok or Err.
 * The main motivation behind this utils is to overcome the fact that Javascript does not
 * let you check the type of an object at runtime, so you cannot know if a function returned an error type
 * or a success type.
 *
 * Usage:
 * import {Result, Ok, Err} from "@app/lib/result"
 * function divide(numerator: number, denominator: number) : Result<number, Error> {
 *     if (denominator === 0) {
 *        return new Err(new Error("Cannot divide by zero"));
 *      }
 *     return new Ok(numerator / denominator);
 * }
 */
var Ok = /*#__PURE__*/function () {
  function Ok(value) {
    this.value = void 0;
    this.value = value;
  }
  var _proto = Ok.prototype;
  _proto.isOk = function isOk() {
    return true;
  };
  _proto.isErr = function isErr() {
    return false;
  };
  return Ok;
}();
var Err = /*#__PURE__*/function () {
  function Err(error) {
    this.error = void 0;
    this.error = error;
  }
  var _proto2 = Err.prototype;
  _proto2.isOk = function isOk() {
    return false;
  };
  _proto2.isErr = function isErr() {
    return true;
  };
  return Err;
}();

function ioTsEnum(enumValues, enumName) {
  var isEnumValue = function isEnumValue(input) {
    return enumValues.includes(input);
  };
  return new t__namespace.Type(enumName || uuid.v4(), isEnumValue, function (input, context) {
    return isEnumValue(input) ? t__namespace.success(input) : t__namespace.failure(input, context);
  }, t__namespace.identity);
}
// Defines a function to generate a branded codec for validating numbers within a specific range.
function createRangeCodec(min, max) {
  return t__namespace.brand(t__namespace.number, function (n) {
    return n >= min && n <= max;
  }, "Range");
}
var SlugifiedString = /*#__PURE__*/t__namespace.brand(t__namespace.string, function (s) {
  return /^[a-z0-9_]+$/.test(s);
}, "SlugifiedString");
function ioTsParsePayload(payload, codec) {
  var bodyValidation = codec.decode(payload);
  if (Either.isLeft(bodyValidation)) {
    var pathError = reporter__namespace.formatValidationErrors(bodyValidation.left);
    return new Err(pathError);
  }
  return new Ok(bodyValidation.right);
}
// Parses numbers as strings. Must not be used in union types with number.
var NumberAsStringCodec = /*#__PURE__*/new t__namespace.Type("NumberAsString", function (u) {
  return typeof u === "number";
}, function (u, c) {
  if (typeof u === "number") {
    return t__namespace.success(u.toString());
  }
  return t__namespace.failure(u, c, "Value must be a number");
}, t__namespace.identity);

var ConnectorsCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("connectors"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("stop"), /*#__PURE__*/t__namespace.literal("delete"), /*#__PURE__*/t__namespace.literal("pause"), /*#__PURE__*/t__namespace.literal("unpause"), /*#__PURE__*/t__namespace.literal("resume"), /*#__PURE__*/t__namespace.literal("full-resync"), /*#__PURE__*/t__namespace.literal("set-error"), /*#__PURE__*/t__namespace.literal("clear-error"), /*#__PURE__*/t__namespace.literal("restart"), /*#__PURE__*/t__namespace.literal("get-parents"), /*#__PURE__*/t__namespace.literal("set-permission"), /*#__PURE__*/t__namespace.literal("garbage-collect")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
/**
 * <Confluence>
 */
var ConfluenceCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("confluence"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("me"), /*#__PURE__*/t__namespace.literal("upsert-page"), /*#__PURE__*/t__namespace.literal("upsert-pages"), /*#__PURE__*/t__namespace.literal("update-parents")]),
  args: /*#__PURE__*/t__namespace.type({
    connectorId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    pageId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    spaceId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    file: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    keyInFile: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined])
  })
});
var ConfluenceMeResponseSchema = /*#__PURE__*/t__namespace.type({
  me: t__namespace.UnknownRecord
});
var ConfluenceUpsertPageResponseSchema = /*#__PURE__*/t__namespace.type({
  workflowId: t__namespace.string,
  workflowUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined])
});
/**
 * </Confluence>
 */
var GithubCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("github"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("resync-repo"), /*#__PURE__*/t__namespace.literal("code-sync"), /*#__PURE__*/t__namespace.literal("sync-issue"), /*#__PURE__*/t__namespace.literal("force-daily-code-sync"), /*#__PURE__*/t__namespace.literal("skip-issue")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var NotionCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("notion"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("skip-page"), /*#__PURE__*/t__namespace.literal("skip-database"), /*#__PURE__*/t__namespace.literal("upsert-page"), /*#__PURE__*/t__namespace.literal("upsert-database"), /*#__PURE__*/t__namespace.literal("search-pages"), /*#__PURE__*/t__namespace.literal("update-core-parents"), /*#__PURE__*/t__namespace.literal("check-url"), /*#__PURE__*/t__namespace.literal("find-url"), /*#__PURE__*/t__namespace.literal("delete-url"), /*#__PURE__*/t__namespace.literal("me"), /*#__PURE__*/t__namespace.literal("stop-all-garbage-collectors"), /*#__PURE__*/t__namespace.literal("update-parents-fields"), /*#__PURE__*/t__namespace.literal("clear-parents-last-updated-at")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var GoogleDriveCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("google_drive"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("garbage-collect-all"), /*#__PURE__*/t__namespace.literal("get-file"), /*#__PURE__*/t__namespace.literal("check-file"), /*#__PURE__*/t__namespace.literal("get-google-parents"), /*#__PURE__*/t__namespace.literal("clean-invalid-parents"), /*#__PURE__*/t__namespace.literal("upsert-file"), /*#__PURE__*/t__namespace.literal("update-core-parents"), /*#__PURE__*/t__namespace.literal("restart-google-webhooks"), /*#__PURE__*/t__namespace.literal("start-incremental-sync"), /*#__PURE__*/t__namespace.literal("restart-all-incremental-sync-workflows"), /*#__PURE__*/t__namespace.literal("skip-file"), /*#__PURE__*/t__namespace.literal("register-webhook"), /*#__PURE__*/t__namespace.literal("register-all-webhooks"), /*#__PURE__*/t__namespace.literal("list-labels")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var SlackCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("slack"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("enable-bot"), /*#__PURE__*/t__namespace.literal("sync-channel"), /*#__PURE__*/t__namespace.literal("sync-thread"), /*#__PURE__*/t__namespace.literal("uninstall-for-unknown-team-ids"), /*#__PURE__*/t__namespace.literal("whitelist-domains"), /*#__PURE__*/t__namespace.literal("whitelist-bot"), /*#__PURE__*/t__namespace.literal("sync-channel-metadata")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var BatchCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("batch"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("full-resync"), /*#__PURE__*/t__namespace.literal("restart-all"), /*#__PURE__*/t__namespace.literal("stop-all"), /*#__PURE__*/t__namespace.literal("resume-all")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var WebcrawlerCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("webcrawler"),
  command: /*#__PURE__*/t__namespace.literal("start-scheduler")
});
var BatchAllResponseSchema = /*#__PURE__*/t__namespace.type({
  succeeded: t__namespace.number,
  failed: t__namespace.number
});
var TemporalCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("temporal"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("find-unprocessed-workflows"), /*#__PURE__*/t__namespace.literal("check-queue")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
/**
 * <Intercom>
 */
var IntercomCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("intercom"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("force-resync-articles"), /*#__PURE__*/t__namespace.literal("check-conversation"), /*#__PURE__*/t__namespace.literal("fetch-conversation"), /*#__PURE__*/t__namespace.literal("fetch-articles"), /*#__PURE__*/t__namespace.literal("check-missing-conversations"), /*#__PURE__*/t__namespace.literal("check-teams")]),
  args: /*#__PURE__*/t__namespace.type({
    force: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("true"), t__namespace.undefined]),
    connectorId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    conversationId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    day: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    helpCenterId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined])
  })
});
var IntercomCheckConversationResponseSchema = /*#__PURE__*/t__namespace.type({
  isConversationOnIntercom: t__namespace["boolean"],
  isConversationOnDB: t__namespace["boolean"],
  conversationTeamIdOnIntercom: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  conversationTeamIdOnDB: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]])
});
var IntercomFetchConversationResponseSchema = /*#__PURE__*/t__namespace.type({
  conversation: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]) // intercom type, can't be iots'd
});
var IntercomFetchArticlesResponseSchema = /*#__PURE__*/t__namespace.type({
  articles: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]])) // intercom type, can't be iots'd
});
var IntercomCheckTeamsResponseSchema = /*#__PURE__*/t__namespace.type({
  teams: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    teamId: t__namespace.string,
    name: t__namespace.string,
    isTeamOnDB: t__namespace["boolean"]
  }))
});
var IntercomCheckMissingConversationsResponseSchema = /*#__PURE__*/t__namespace.type({
  missingConversations: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    conversationId: t__namespace.string,
    teamId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace["null"]]),
    open: t__namespace["boolean"],
    createdAt: t__namespace.number
  }))
});
var IntercomForceResyncArticlesResponseSchema = /*#__PURE__*/t__namespace.type({
  affectedCount: t__namespace.number
});
/**
 * </ Intercom>
 */
/**
 * <Zendesk>
 */
var ZendeskCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("zendesk"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("check-is-admin"), /*#__PURE__*/t__namespace.literal("count-tickets"), /*#__PURE__*/t__namespace.literal("resync-tickets"), /*#__PURE__*/t__namespace.literal("fetch-ticket"), /*#__PURE__*/t__namespace.literal("fetch-brand"), /*#__PURE__*/t__namespace.literal("resync-help-centers"), /*#__PURE__*/t__namespace.literal("resync-brand-metadata")]),
  args: /*#__PURE__*/t__namespace.type({
    wId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    dsId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    connectorId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    brandId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    query: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    forceResync: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("true"), t__namespace.undefined]),
    ticketId: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    ticketUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined])
  })
});
var ZendeskCheckIsAdminResponseSchema = /*#__PURE__*/t__namespace.type({
  userRole: t__namespace.string,
  userActive: t__namespace["boolean"],
  userIsAdmin: t__namespace["boolean"]
});
var ZendeskCountTicketsResponseSchema = /*#__PURE__*/t__namespace.type({
  ticketCount: t__namespace.number
});
var ZendeskFetchTicketResponseSchema = /*#__PURE__*/t__namespace.type({
  ticket: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]),
  // Zendesk type, can't be iots'd,
  isTicketOnDb: t__namespace["boolean"]
});
var ZendeskFetchBrandResponseSchema = /*#__PURE__*/t__namespace.type({
  brand: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]),
  // Zendesk type, can't be iots'd,
  brandOnDb: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]])
});
/**
 * </Zendesk>
 */
var MicrosoftCommandSchema = /*#__PURE__*/t__namespace.type({
  majorCommand: /*#__PURE__*/t__namespace.literal("microsoft"),
  command: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("garbage-collect-all"), /*#__PURE__*/t__namespace.literal("check-file"), /*#__PURE__*/t__namespace.literal("start-incremental-sync"), /*#__PURE__*/t__namespace.literal("restart-all-incremental-sync-workflows"), /*#__PURE__*/t__namespace.literal("skip-file"), /*#__PURE__*/t__namespace.literal("sync-node"), /*#__PURE__*/t__namespace.literal("get-parents")]),
  args: /*#__PURE__*/t__namespace.record(t__namespace.string, /*#__PURE__*/t__namespace.union([t__namespace.string, NumberAsStringCodec, t__namespace.undefined]))
});
var AdminCommandSchema = /*#__PURE__*/t__namespace.union([BatchCommandSchema, ConnectorsCommandSchema, ConfluenceCommandSchema, GithubCommandSchema, GoogleDriveCommandSchema, IntercomCommandSchema, MicrosoftCommandSchema, NotionCommandSchema, SlackCommandSchema, TemporalCommandSchema, WebcrawlerCommandSchema, ZendeskCommandSchema]);
var AdminSuccessResponseSchema = /*#__PURE__*/t__namespace.type({
  success: /*#__PURE__*/t__namespace.literal(true)
});
var CheckFileGenericResponseSchema = /*#__PURE__*/t__namespace.type({
  status: t__namespace.number,
  // all literals from js `typeof`
  type: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("undefined"), /*#__PURE__*/t__namespace.literal("object"), /*#__PURE__*/t__namespace.literal("boolean"), /*#__PURE__*/t__namespace.literal("number"), /*#__PURE__*/t__namespace.literal("string"), /*#__PURE__*/t__namespace.literal("function"), /*#__PURE__*/t__namespace.literal("symbol"), /*#__PURE__*/t__namespace.literal("bigint")]),
  content: t__namespace.unknown // google drive type, can't be iots'd
});
var GetParentsResponseSchema = /*#__PURE__*/t__namespace.type({
  parents: /*#__PURE__*/t__namespace.array(t__namespace.string)
});
var NotionUpsertResponseSchema = /*#__PURE__*/t__namespace.type({
  workflowId: t__namespace.string,
  workflowUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined])
});
var NotionSearchPagesResponseSchema = /*#__PURE__*/t__namespace.type({
  pages: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    id: t__namespace.string,
    title: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
    type: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("page"), /*#__PURE__*/t__namespace.literal("database")]),
    isSkipped: t__namespace["boolean"],
    isFull: t__namespace["boolean"]
  }))
});
var NotionCheckUrlResponseSchema = /*#__PURE__*/t__namespace.type({
  page: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]),
  // notion type, can't be iots'd
  db: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]) // notion type, can't be iots'd
});
var NotionDeleteUrlResponseSchema = /*#__PURE__*/t__namespace.type({
  deletedPage: t__namespace["boolean"],
  deletedDb: t__namespace["boolean"]
});
var NotionFindUrlResponseSchema = /*#__PURE__*/t__namespace.type({
  page: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]),
  // notion type, can't be iots'd
  db: /*#__PURE__*/t__namespace.union([t__namespace.UnknownRecord, t__namespace["null"]]) // notion type, can't be iots'd
});
var NotionMeResponseSchema = /*#__PURE__*/t__namespace.type({
  me: t__namespace.UnknownRecord,
  // notion type, can't be iots'd
  botOwner: t__namespace.UnknownRecord // notion type, can't be iots'd
});
var TemporalCheckQueueResponseSchema = /*#__PURE__*/t__namespace.type({
  taskQueue: t__namespace.UnknownRecord // temporal type, can't be iots'd
});
var TemporalUnprocessedWorkflowsResponseSchema = /*#__PURE__*/t__namespace.type({
  queuesAndPollers: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    queue: t__namespace.string,
    pollers: t__namespace.number
  })),
  unprocessedQueues: /*#__PURE__*/t__namespace.array(t__namespace.string)
});
var AdminResponseSchema = /*#__PURE__*/t__namespace.union([AdminSuccessResponseSchema, BatchAllResponseSchema, CheckFileGenericResponseSchema, ConfluenceMeResponseSchema, ConfluenceUpsertPageResponseSchema, GetParentsResponseSchema, IntercomCheckConversationResponseSchema, IntercomCheckMissingConversationsResponseSchema, IntercomCheckTeamsResponseSchema, IntercomFetchConversationResponseSchema, IntercomFetchArticlesResponseSchema, NotionCheckUrlResponseSchema, NotionDeleteUrlResponseSchema, NotionMeResponseSchema, NotionSearchPagesResponseSchema, NotionUpsertResponseSchema, TemporalCheckQueueResponseSchema, TemporalUnprocessedWorkflowsResponseSchema, IntercomForceResyncArticlesResponseSchema, ZendeskCheckIsAdminResponseSchema, ZendeskCountTicketsResponseSchema, ZendeskFetchTicketResponseSchema, ZendeskFetchBrandResponseSchema]);

var CONNECTORS_API_ERROR_TYPES = ["authorization_error", "not_found", "internal_server_error", "unexpected_error_format", "unexpected_response_format", "unexpected_network_error", "unknown_connector_provider", "invalid_request_error", "connector_not_found", "connector_configuration_not_found", "connector_update_error", "connector_update_unauthorized", "connector_oauth_target_mismatch", "connector_oauth_user_missing_rights", "connector_oauth_error", "connector_authorization_error", "slack_channel_not_found", "connector_rate_limit_error", "slack_configuration_not_found", "google_drive_webhook_not_found"];
function isConnectorsAPIError(obj) {
  return typeof obj === "object" && obj !== null && "message" in obj && typeof obj.message === "string" && "type" in obj && typeof obj.type === "string" && CONNECTORS_API_ERROR_TYPES.includes(obj.type);
}

// Auto-read patterns.
var SlackAutoReadPatternSchema = /*#__PURE__*/t__namespace.type({
  pattern: t__namespace.string,
  spaceId: t__namespace.string
});
var SlackAutoReadPatternsSchema = /*#__PURE__*/t__namespace.array(SlackAutoReadPatternSchema);
function isSlackAutoReadPatterns(v) {
  return SlackAutoReadPatternsSchema.is(v);
}
// Configuration.
var SlackConfigurationTypeSchema = /*#__PURE__*/t__namespace.type({
  botEnabled: t__namespace["boolean"],
  whitelistedDomains: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined]),
  autoReadChannelPatterns: SlackAutoReadPatternsSchema
});
function isSlackbotWhitelistType(value) {
  return value === "summon_agent" || value === "index_messages";
}

var WEBCRAWLER_MAX_DEPTH = 5;
var WEBCRAWLER_MAX_PAGES = 512;
var CrawlingModes = ["child", "website"];
var CrawlingFrequencies = ["never", "daily", "weekly", "monthly"];
var DepthOptions = [0, 1, 2, 3, 4, 5];
function isDepthOption(value) {
  return DepthOptions.includes(value);
}
var WebCrawlerConfigurationTypeSchema = /*#__PURE__*/t__namespace.type({
  url: t__namespace.string,
  depth: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal(0), /*#__PURE__*/t__namespace.literal(1), /*#__PURE__*/t__namespace.literal(2), /*#__PURE__*/t__namespace.literal(3), /*#__PURE__*/t__namespace.literal(4), /*#__PURE__*/t__namespace.literal(5)]),
  maxPageToCrawl: t__namespace.number,
  crawlMode: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("child"), /*#__PURE__*/t__namespace.literal("website")]),
  crawlFrequency: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("never"), /*#__PURE__*/t__namespace.literal("daily"), /*#__PURE__*/t__namespace.literal("weekly"), /*#__PURE__*/t__namespace.literal("monthly")]),
  headers: /*#__PURE__*/t__namespace.record(t__namespace.string, t__namespace.string)
});
var WebCrawlerHeaderRedactedValue = "<REDACTED>";
var WEBCRAWLER_DEFAULT_CONFIGURATION = {
  url: "",
  depth: 2,
  maxPageToCrawl: 50,
  crawlMode: "website",
  crawlFrequency: "monthly",
  headers: {}
};

var ConnectorConfigurationTypeSchema = /*#__PURE__*/t__namespace.union([WebCrawlerConfigurationTypeSchema, SlackConfigurationTypeSchema, t__namespace["null"]]);
var UpdateConnectorConfigurationTypeSchema = /*#__PURE__*/t__namespace.type({
  configuration: ConnectorConfigurationTypeSchema
});

var ConnectorCreateRequestBodySchema = /*#__PURE__*/t__namespace.type({
  workspaceAPIKey: t__namespace.string,
  dataSourceId: t__namespace.string,
  workspaceId: t__namespace.string,
  connectionId: t__namespace.string,
  configuration: ConnectorConfigurationTypeSchema
});

var UpdateConnectorRequestBodySchema = /*#__PURE__*/t__namespace.type({
  connectionId: t__namespace.string
});

function isWebCrawlerConfiguration(config) {
  var maybeWebCrawlerConfig = config;
  return (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.url) !== undefined && (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.depth) !== undefined && (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.maxPageToCrawl) !== undefined && (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.crawlMode) !== undefined && (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.crawlFrequency) !== undefined && (maybeWebCrawlerConfig == null ? void 0 : maybeWebCrawlerConfig.headers) !== undefined;
}

function _AsyncGenerator(e) {
  var r, t;
  function resume(r, t) {
    try {
      var n = e[r](t),
        o = n.value,
        u = o instanceof _OverloadYield;
      Promise.resolve(u ? o.v : o).then(function (t) {
        if (u) {
          var i = "return" === r ? "return" : "next";
          if (!o.k || t.done) return resume(i, t);
          t = e[i](t).value;
        }
        settle(n.done ? "return" : "normal", t);
      }, function (e) {
        resume("throw", e);
      });
    } catch (e) {
      settle("throw", e);
    }
  }
  function settle(e, n) {
    switch (e) {
      case "return":
        r.resolve({
          value: n,
          done: !0
        });
        break;
      case "throw":
        r.reject(n);
        break;
      default:
        r.resolve({
          value: n,
          done: !1
        });
    }
    (r = r.next) ? resume(r.key, r.arg) : t = null;
  }
  this._invoke = function (e, n) {
    return new Promise(function (o, u) {
      var i = {
        key: e,
        arg: n,
        resolve: o,
        reject: u,
        next: null
      };
      t ? t = t.next = i : (r = t = i, resume(e, n));
    });
  }, "function" != typeof e.return && (this.return = void 0);
}
_AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function () {
  return this;
}, _AsyncGenerator.prototype.next = function (e) {
  return this._invoke("next", e);
}, _AsyncGenerator.prototype.throw = function (e) {
  return this._invoke("throw", e);
}, _AsyncGenerator.prototype.return = function (e) {
  return this._invoke("return", e);
};
function _OverloadYield(t, e) {
  this.v = t, this.k = e;
}
function _asyncIterator(r) {
  var n,
    t,
    o,
    e = 2;
  for ("undefined" != typeof Symbol && (t = Symbol.asyncIterator, o = Symbol.iterator); e--;) {
    if (t && null != (n = r[t])) return n.call(r);
    if (o && null != (n = r[o])) return new AsyncFromSyncIterator(n.call(r));
    t = "@@asyncIterator", o = "@@iterator";
  }
  throw new TypeError("Object is not async iterable");
}
function AsyncFromSyncIterator(r) {
  function AsyncFromSyncIteratorContinuation(r) {
    if (Object(r) !== r) return Promise.reject(new TypeError(r + " is not an object."));
    var n = r.done;
    return Promise.resolve(r.value).then(function (r) {
      return {
        value: r,
        done: n
      };
    });
  }
  return AsyncFromSyncIterator = function (r) {
    this.s = r, this.n = r.next;
  }, AsyncFromSyncIterator.prototype = {
    s: null,
    n: null,
    next: function () {
      return AsyncFromSyncIteratorContinuation(this.n.apply(this.s, arguments));
    },
    return: function (r) {
      var n = this.s.return;
      return void 0 === n ? Promise.resolve({
        value: r,
        done: !0
      }) : AsyncFromSyncIteratorContinuation(n.apply(this.s, arguments));
    },
    throw: function (r) {
      var n = this.s.return;
      return void 0 === n ? Promise.reject(r) : AsyncFromSyncIteratorContinuation(n.apply(this.s, arguments));
    }
  }, new AsyncFromSyncIterator(r);
}
function _awaitAsyncGenerator(e) {
  return new _OverloadYield(e, 0);
}
function _construct(t, e, r) {
  if (_isNativeReflectConstruct()) return Reflect.construct.apply(null, arguments);
  var o = [null];
  o.push.apply(o, e);
  var p = new (t.bind.apply(t, o))();
  return r && _setPrototypeOf(p, r.prototype), p;
}
function _isNativeReflectConstruct() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {}));
  } catch (t) {}
  return (_isNativeReflectConstruct = function () {
    return !!t;
  })();
}
function _regeneratorRuntime() {
  _regeneratorRuntime = function () {
    return e;
  };
  var t,
    e = {},
    r = Object.prototype,
    n = r.hasOwnProperty,
    o = Object.defineProperty || function (t, e, r) {
      t[e] = r.value;
    },
    i = "function" == typeof Symbol ? Symbol : {},
    a = i.iterator || "@@iterator",
    c = i.asyncIterator || "@@asyncIterator",
    u = i.toStringTag || "@@toStringTag";
  function define(t, e, r) {
    return Object.defineProperty(t, e, {
      value: r,
      enumerable: !0,
      configurable: !0,
      writable: !0
    }), t[e];
  }
  try {
    define({}, "");
  } catch (t) {
    define = function (t, e, r) {
      return t[e] = r;
    };
  }
  function wrap(t, e, r, n) {
    var i = e && e.prototype instanceof Generator ? e : Generator,
      a = Object.create(i.prototype),
      c = new Context(n || []);
    return o(a, "_invoke", {
      value: makeInvokeMethod(t, r, c)
    }), a;
  }
  function tryCatch(t, e, r) {
    try {
      return {
        type: "normal",
        arg: t.call(e, r)
      };
    } catch (t) {
      return {
        type: "throw",
        arg: t
      };
    }
  }
  e.wrap = wrap;
  var h = "suspendedStart",
    l = "suspendedYield",
    f = "executing",
    s = "completed",
    y = {};
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}
  var p = {};
  define(p, a, function () {
    return this;
  });
  var d = Object.getPrototypeOf,
    v = d && d(d(values([])));
  v && v !== r && n.call(v, a) && (p = v);
  var g = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(p);
  function defineIteratorMethods(t) {
    ["next", "throw", "return"].forEach(function (e) {
      define(t, e, function (t) {
        return this._invoke(e, t);
      });
    });
  }
  function AsyncIterator(t, e) {
    function invoke(r, o, i, a) {
      var c = tryCatch(t[r], t, o);
      if ("throw" !== c.type) {
        var u = c.arg,
          h = u.value;
        return h && "object" == typeof h && n.call(h, "__await") ? e.resolve(h.__await).then(function (t) {
          invoke("next", t, i, a);
        }, function (t) {
          invoke("throw", t, i, a);
        }) : e.resolve(h).then(function (t) {
          u.value = t, i(u);
        }, function (t) {
          return invoke("throw", t, i, a);
        });
      }
      a(c.arg);
    }
    var r;
    o(this, "_invoke", {
      value: function (t, n) {
        function callInvokeWithMethodAndArg() {
          return new e(function (e, r) {
            invoke(t, n, e, r);
          });
        }
        return r = r ? r.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
      }
    });
  }
  function makeInvokeMethod(e, r, n) {
    var o = h;
    return function (i, a) {
      if (o === f) throw Error("Generator is already running");
      if (o === s) {
        if ("throw" === i) throw a;
        return {
          value: t,
          done: !0
        };
      }
      for (n.method = i, n.arg = a;;) {
        var c = n.delegate;
        if (c) {
          var u = maybeInvokeDelegate(c, n);
          if (u) {
            if (u === y) continue;
            return u;
          }
        }
        if ("next" === n.method) n.sent = n._sent = n.arg;else if ("throw" === n.method) {
          if (o === h) throw o = s, n.arg;
          n.dispatchException(n.arg);
        } else "return" === n.method && n.abrupt("return", n.arg);
        o = f;
        var p = tryCatch(e, r, n);
        if ("normal" === p.type) {
          if (o = n.done ? s : l, p.arg === y) continue;
          return {
            value: p.arg,
            done: n.done
          };
        }
        "throw" === p.type && (o = s, n.method = "throw", n.arg = p.arg);
      }
    };
  }
  function maybeInvokeDelegate(e, r) {
    var n = r.method,
      o = e.iterator[n];
    if (o === t) return r.delegate = null, "throw" === n && e.iterator.return && (r.method = "return", r.arg = t, maybeInvokeDelegate(e, r), "throw" === r.method) || "return" !== n && (r.method = "throw", r.arg = new TypeError("The iterator does not provide a '" + n + "' method")), y;
    var i = tryCatch(o, e.iterator, r.arg);
    if ("throw" === i.type) return r.method = "throw", r.arg = i.arg, r.delegate = null, y;
    var a = i.arg;
    return a ? a.done ? (r[e.resultName] = a.value, r.next = e.nextLoc, "return" !== r.method && (r.method = "next", r.arg = t), r.delegate = null, y) : a : (r.method = "throw", r.arg = new TypeError("iterator result is not an object"), r.delegate = null, y);
  }
  function pushTryEntry(t) {
    var e = {
      tryLoc: t[0]
    };
    1 in t && (e.catchLoc = t[1]), 2 in t && (e.finallyLoc = t[2], e.afterLoc = t[3]), this.tryEntries.push(e);
  }
  function resetTryEntry(t) {
    var e = t.completion || {};
    e.type = "normal", delete e.arg, t.completion = e;
  }
  function Context(t) {
    this.tryEntries = [{
      tryLoc: "root"
    }], t.forEach(pushTryEntry, this), this.reset(!0);
  }
  function values(e) {
    if (e || "" === e) {
      var r = e[a];
      if (r) return r.call(e);
      if ("function" == typeof e.next) return e;
      if (!isNaN(e.length)) {
        var o = -1,
          i = function next() {
            for (; ++o < e.length;) if (n.call(e, o)) return next.value = e[o], next.done = !1, next;
            return next.value = t, next.done = !0, next;
          };
        return i.next = i;
      }
    }
    throw new TypeError(typeof e + " is not iterable");
  }
  return GeneratorFunction.prototype = GeneratorFunctionPrototype, o(g, "constructor", {
    value: GeneratorFunctionPrototype,
    configurable: !0
  }), o(GeneratorFunctionPrototype, "constructor", {
    value: GeneratorFunction,
    configurable: !0
  }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, u, "GeneratorFunction"), e.isGeneratorFunction = function (t) {
    var e = "function" == typeof t && t.constructor;
    return !!e && (e === GeneratorFunction || "GeneratorFunction" === (e.displayName || e.name));
  }, e.mark = function (t) {
    return Object.setPrototypeOf ? Object.setPrototypeOf(t, GeneratorFunctionPrototype) : (t.__proto__ = GeneratorFunctionPrototype, define(t, u, "GeneratorFunction")), t.prototype = Object.create(g), t;
  }, e.awrap = function (t) {
    return {
      __await: t
    };
  }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, c, function () {
    return this;
  }), e.AsyncIterator = AsyncIterator, e.async = function (t, r, n, o, i) {
    void 0 === i && (i = Promise);
    var a = new AsyncIterator(wrap(t, r, n, o), i);
    return e.isGeneratorFunction(r) ? a : a.next().then(function (t) {
      return t.done ? t.value : a.next();
    });
  }, defineIteratorMethods(g), define(g, u, "Generator"), define(g, a, function () {
    return this;
  }), define(g, "toString", function () {
    return "[object Generator]";
  }), e.keys = function (t) {
    var e = Object(t),
      r = [];
    for (var n in e) r.push(n);
    return r.reverse(), function next() {
      for (; r.length;) {
        var t = r.pop();
        if (t in e) return next.value = t, next.done = !1, next;
      }
      return next.done = !0, next;
    };
  }, e.values = values, Context.prototype = {
    constructor: Context,
    reset: function (e) {
      if (this.prev = 0, this.next = 0, this.sent = this._sent = t, this.done = !1, this.delegate = null, this.method = "next", this.arg = t, this.tryEntries.forEach(resetTryEntry), !e) for (var r in this) "t" === r.charAt(0) && n.call(this, r) && !isNaN(+r.slice(1)) && (this[r] = t);
    },
    stop: function () {
      this.done = !0;
      var t = this.tryEntries[0].completion;
      if ("throw" === t.type) throw t.arg;
      return this.rval;
    },
    dispatchException: function (e) {
      if (this.done) throw e;
      var r = this;
      function handle(n, o) {
        return a.type = "throw", a.arg = e, r.next = n, o && (r.method = "next", r.arg = t), !!o;
      }
      for (var o = this.tryEntries.length - 1; o >= 0; --o) {
        var i = this.tryEntries[o],
          a = i.completion;
        if ("root" === i.tryLoc) return handle("end");
        if (i.tryLoc <= this.prev) {
          var c = n.call(i, "catchLoc"),
            u = n.call(i, "finallyLoc");
          if (c && u) {
            if (this.prev < i.catchLoc) return handle(i.catchLoc, !0);
            if (this.prev < i.finallyLoc) return handle(i.finallyLoc);
          } else if (c) {
            if (this.prev < i.catchLoc) return handle(i.catchLoc, !0);
          } else {
            if (!u) throw Error("try statement without catch or finally");
            if (this.prev < i.finallyLoc) return handle(i.finallyLoc);
          }
        }
      }
    },
    abrupt: function (t, e) {
      for (var r = this.tryEntries.length - 1; r >= 0; --r) {
        var o = this.tryEntries[r];
        if (o.tryLoc <= this.prev && n.call(o, "finallyLoc") && this.prev < o.finallyLoc) {
          var i = o;
          break;
        }
      }
      i && ("break" === t || "continue" === t) && i.tryLoc <= e && e <= i.finallyLoc && (i = null);
      var a = i ? i.completion : {};
      return a.type = t, a.arg = e, i ? (this.method = "next", this.next = i.finallyLoc, y) : this.complete(a);
    },
    complete: function (t, e) {
      if ("throw" === t.type) throw t.arg;
      return "break" === t.type || "continue" === t.type ? this.next = t.arg : "return" === t.type ? (this.rval = this.arg = t.arg, this.method = "return", this.next = "end") : "normal" === t.type && e && (this.next = e), y;
    },
    finish: function (t) {
      for (var e = this.tryEntries.length - 1; e >= 0; --e) {
        var r = this.tryEntries[e];
        if (r.finallyLoc === t) return this.complete(r.completion, r.afterLoc), resetTryEntry(r), y;
      }
    },
    catch: function (t) {
      for (var e = this.tryEntries.length - 1; e >= 0; --e) {
        var r = this.tryEntries[e];
        if (r.tryLoc === t) {
          var n = r.completion;
          if ("throw" === n.type) {
            var o = n.arg;
            resetTryEntry(r);
          }
          return o;
        }
      }
      throw Error("illegal catch attempt");
    },
    delegateYield: function (e, r, n) {
      return this.delegate = {
        iterator: values(e),
        resultName: r,
        nextLoc: n
      }, "next" === this.method && (this.arg = t), y;
    }
  }, e;
}
function _wrapAsyncGenerator(fn) {
  return function () {
    return new _AsyncGenerator(fn.apply(this, arguments));
  };
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }
  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}
function _asyncToGenerator(fn) {
  return function () {
    var self = this,
      args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);
      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }
      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }
      _next(undefined);
    });
  };
}
function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function _inheritsLoose(subClass, superClass) {
  subClass.prototype = Object.create(superClass.prototype);
  subClass.prototype.constructor = subClass;
  _setPrototypeOf(subClass, superClass);
}
function _getPrototypeOf(o) {
  _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  };
  return _getPrototypeOf(o);
}
function _setPrototypeOf(o, p) {
  _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  };
  return _setPrototypeOf(o, p);
}
function _isNativeFunction(fn) {
  try {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
  } catch (e) {
    return typeof fn === "function";
  }
}
function _wrapNativeSuper(Class) {
  var _cache = typeof Map === "function" ? new Map() : undefined;
  _wrapNativeSuper = function _wrapNativeSuper(Class) {
    if (Class === null || !_isNativeFunction(Class)) return Class;
    if (typeof Class !== "function") {
      throw new TypeError("Super expression must either be null or a function");
    }
    if (typeof _cache !== "undefined") {
      if (_cache.has(Class)) return _cache.get(Class);
      _cache.set(Class, Wrapper);
    }
    function Wrapper() {
      return _construct(Class, arguments, _getPrototypeOf(this).constructor);
    }
    Wrapper.prototype = Object.create(Class.prototype, {
      constructor: {
        value: Wrapper,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    return _setPrototypeOf(Wrapper, Class);
  };
  return _wrapNativeSuper(Class);
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _createForOfIteratorHelperLoose(o, allowArrayLike) {
  var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];
  if (it) return (it = it.call(o)).next.bind(it);
  if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
    if (it) o = it;
    var i = 0;
    return function () {
      if (i >= o.length) return {
        done: true
      };
      return {
        done: false,
        value: o[i++]
      };
    };
  }
  throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

function makeConfluenceSyncWorkflowId(connectorId) {
  return "confluence-sync-" + connectorId;
}
var ConfluenceClientError = /*#__PURE__*/function (_Error) {
  function ConfluenceClientError(message, error_data) {
    var _this;
    _this = _Error.call(this, message) || this;
    _this.type = void 0;
    _this.status = void 0;
    _this.data = void 0;
    _this.type = error_data.type;
    _this.status = error_data.type === "http_response_error" ? error_data.status : undefined;
    _this.data = error_data.data;
    return _this;
  }
  _inheritsLoose(ConfluenceClientError, _Error);
  return ConfluenceClientError;
}( /*#__PURE__*/_wrapNativeSuper(Error));
function isConfluenceNotFoundError(err) {
  return err instanceof ConfluenceClientError && err.status === 404;
}

// When viewing ContentNodes, we have 3 view types: "tables", "documents" and "all".
// - The "table" view allows picking tables in the Extract and TableQuery tools,
// which applies to Notion, Google Drive, Microsoft, Snowflake and BigQuery connectors.
// - The "document" view allows picking documents in the Search tool,
// which is useful for all connectors except Snowflake and BigQuery.
// - The "all" view shows all nodes, which is used in the Knowledge tab for displaying content node trees.
// More precisely, the "table" (resp. "document") view hides leaves that are document (resp. table).
// Define a codec for ContentNodesViewType using io-ts.
// WARNING: when changing this codec, search and map for comments on ContentNodesViewTypeCodec
// because parts of the codebase could not use this type directly (and as such commented)
var ContentNodesViewTypeCodec = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("table"), /*#__PURE__*/t__namespace.literal("document"), /*#__PURE__*/t__namespace.literal("all")]);
function isValidContentNodesViewType(value) {
  return value === "document" || value === "table" || value === "all";
}

// Get the Table ID for a sheet within a Google Spreadsheet from the
// Google-provided file ID and the ID of the sheet within the spreadsheet.
function getGoogleSheetTableId(googleFileId, googleSheetId) {
  return "google-spreadsheet-" + googleFileId + "-sheet-" + googleSheetId;
}
// Get the Content Node ID for a sheet within a Google Spreadsheet from the
// Google-provided file ID and the ID of the sheet within the spreadsheet.
function getGoogleSheetContentNodeInternalId(googleFileId, googleSheetId) {
  return getGoogleSheetTableId(googleFileId, googleSheetId);
}
// Recover the Google-provided file ID and the ID of the sheet within the
// spreadsheet from the Content Node ID of a sheet.
function getGoogleIdsFromSheetContentNodeInternalId(internalId) {
  var parts = internalId.split("-sheet-");
  var googleFileId = parts[0].replace("google-spreadsheet-", "");
  var googleSheetId = parts[1];
  return {
    googleFileId: googleFileId,
    googleSheetId: googleSheetId
  };
}
// Check if a Content Node ID is a valid Content Node ID for a sheet within a
// Google Spreadsheet.
function isGoogleSheetContentNodeInternalId(internalId) {
  return internalId.startsWith("google-spreadsheet-") && internalId.includes("-sheet-");
}
function googleDriveIncrementalSyncWorkflowId(connectorId) {
  return "googleDrive-IncrementalSync-" + connectorId;
}

function getIntercomSyncWorkflowId(connectorId) {
  return "intercom-sync-" + connectorId;
}

function microsoftIncrementalSyncWorkflowId(connectorId) {
  return "microsoft-incrementalSync-" + connectorId;
}
function microsoftGarbageCollectionWorkflowId(connectorId) {
  return "microsoft-garbageCollection-" + connectorId;
}

function getNotionWorkflowId(connectorId, isGarbageCollectionRun) {
  var wfName = "workflow-notion-" + connectorId;
  if (isGarbageCollectionRun) {
    wfName += "-garbage-collector";
  }
  return wfName;
}
var ParsedNotionDatabaseSchema = /*#__PURE__*/t__namespace.type({
  id: t__namespace.string,
  url: t__namespace.string,
  title: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  parentType: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("database"), /*#__PURE__*/t__namespace.literal("page"), /*#__PURE__*/t__namespace.literal("block"), /*#__PURE__*/t__namespace.literal("workspace")]),
  parentId: t__namespace.string,
  archived: t__namespace["boolean"]
});
// Returns the Table ID for a Notion database from the Notion-provided database ID.
function getNotionDatabaseTableId(notionDatabaseId) {
  return "notion-" + notionDatabaseId;
}
// Returns the Table ID for a Notion database from the Content Node ID.
function getNotionDatabaseTableIdFromContentNodeInternalId(internalId) {
  // The internalId is also the notion-provided database ID
  // so we can just use the same function.
  return getNotionDatabaseTableId(internalId);
}

/**
 * Some databases and schemas are not useful to show in the content tree.
 * We exclude them here.
 */
var EXCLUDE_DATABASES = ["SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA"];
var EXCLUDE_SCHEMAS = ["INFORMATION_SCHEMA"];

function getZendeskSyncWorkflowId(connectorId) {
  return "zendesk-sync-" + connectorId;
}
function getZendeskGarbageCollectionWorkflowId(connectorId) {
  return "zendesk-gc-" + connectorId;
}

var DEFAULT_QDRANT_CLUSTER = "cluster-0";
function sectionFullText(section) {
  return "" + (section.prefix || "") + (section.content || "") + section.sections.map(sectionFullText).join("");
}

var TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"];
var TimeframeUnitCodec = /*#__PURE__*/ioTsEnum(TIME_FRAME_UNITS);
function isTimeFrame(arg) {
  return arg.duration !== undefined && arg.unit !== undefined;
}
function getProviderFromRetrievedDocument(document) {
  if (document.dataSourceView) {
    if (document.dataSourceView.dataSource.connectorProvider === "webcrawler") {
      return "document";
    }
    return document.dataSourceView.dataSource.connectorProvider || "document";
  }
  return "document";
}
function getTitleFromRetrievedDocument(document) {
  var provider = getProviderFromRetrievedDocument(document);
  if (provider === "slack") {
    for (var _iterator = _createForOfIteratorHelperLoose(document.tags), _step; !(_step = _iterator()).done;) {
      var t = _step.value;
      if (t.startsWith("channelName:")) {
        return "#" + t.substring(12);
      }
    }
  }
  for (var _iterator2 = _createForOfIteratorHelperLoose(document.tags), _step2; !(_step2 = _iterator2()).done;) {
    var _t = _step2.value;
    if (_t.startsWith("title:")) {
      return _t.substring(6);
    }
  }
  return document.documentId;
}

/**
 * PROVIDER IDS
 */
var MODEL_PROVIDER_IDS = ["openai", "anthropic", "mistral", "google_ai_studio", "togetherai", "deepseek", "fireworks"];
var REASONING_EFFORT_IDS = ["low", "medium", "high"];
var DEFAULT_EMBEDDING_PROVIDER_ID = "openai";
var EMBEDDING_PROVIDER_IDS = [DEFAULT_EMBEDDING_PROVIDER_ID, "mistral"];
var isModelProviderId = function isModelProviderId(providerId) {
  return MODEL_PROVIDER_IDS.includes(providerId);
};
var ModelProviderIdCodec = /*#__PURE__*/ioTsEnum(MODEL_PROVIDER_IDS);
var ReasoningEffortCodec = /*#__PURE__*/ioTsEnum(REASONING_EFFORT_IDS);
var EmbeddingProviderCodec = /*#__PURE__*/ioTsEnum(EMBEDDING_PROVIDER_IDS);
function isProviderWhitelisted(owner, providerId) {
  var _owner$whiteListedPro;
  var whiteListedProviders = (_owner$whiteListedPro = owner.whiteListedProviders) != null ? _owner$whiteListedPro : MODEL_PROVIDER_IDS;
  return whiteListedProviders.includes(providerId);
}
function getSmallWhitelistedModel(owner) {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4O_MINI_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_FLASH_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_SMALL_MODEL_CONFIG;
  }
  return null;
}
function getLargeWhitelistedModel(owner) {
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_4O_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_PRO_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "mistral")) {
    return MISTRAL_LARGE_MODEL_CONFIG;
  }
  return null;
}
/**
 * MODEL IDS
 */
var GPT_3_5_TURBO_MODEL_ID = "gpt-3.5-turbo";
var GPT_4_TURBO_MODEL_ID = "gpt-4-turbo";
var GPT_4O_MODEL_ID = "gpt-4o";
var GPT_4O_20240806_MODEL_ID = "gpt-4o-2024-08-06";
var GPT_4O_MINI_MODEL_ID = "gpt-4o-mini";
var O1_MODEL_ID = "o1";
var O1_MINI_MODEL_ID = "o1-mini";
var O3_MINI_MODEL_ID = "o3-mini";
var CLAUDE_3_OPUS_2024029_MODEL_ID = "claude-3-opus-20240229";
var CLAUDE_3_5_SONNET_20240620_MODEL_ID = "claude-3-5-sonnet-20240620";
var CLAUDE_3_5_SONNET_20241022_MODEL_ID = "claude-3-5-sonnet-20241022";
var CLAUDE_3_7_SONNET_20250219_MODEL_ID = "claude-3-7-sonnet-20250219";
var CLAUDE_3_HAIKU_20240307_MODEL_ID = "claude-3-haiku-20240307";
var CLAUDE_3_5_HAIKU_20241022_MODEL_ID = "claude-3-5-haiku-20241022";
var CLAUDE_2_1_MODEL_ID = "claude-2.1";
var CLAUDE_INSTANT_1_2_MODEL_ID = "claude-instant-1.2";
var MISTRAL_LARGE_MODEL_ID = "mistral-large-latest";
var MISTRAL_MEDIUM_MODEL_ID = "mistral-medium";
var MISTRAL_SMALL_MODEL_ID = "mistral-small-latest";
var MISTRAL_CODESTRAL_MODEL_ID = "codestral-latest";
var GEMINI_1_5_PRO_LATEST_MODEL_ID = "gemini-1.5-pro-latest";
var GEMINI_1_5_FLASH_LATEST_MODEL_ID = "gemini-1.5-flash-latest";
var GEMINI_2_FLASH_PREVIEW_MODEL_ID = "gemini-2.0-flash-exp";
var GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID = "gemini-2.0-flash-thinking-exp-01-21";
var GEMINI_2_FLASH_MODEL_ID = "gemini-2.0-flash";
var GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID = "gemini-2.0-flash-lite-preview-02-05";
var GEMINI_2_PRO_PREVIEW_MODEL_ID = "gemini-2.0-pro-exp-02-05";
var TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
var TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID = "Qwen/Qwen2.5-Coder-32B-Instruct";
var TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID = "Qwen/QwQ-32B-Preview";
var TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID = "Qwen/Qwen2-72B-Instruct";
var TOGETHERAI_DEEPSEEK_V3_MODEL_ID = "deepseek-ai/DeepSeek-V3";
var TOGETHERAI_DEEPSEEK_R1_MODEL_ID = "deepseek-ai/DeepSeek-R1";
var DEEPSEEK_CHAT_MODEL_ID = "deepseek-chat";
var DEEPSEEK_REASONER_MODEL_ID = "deepseek-reasoner";
var FIREWORKS_DEEPSEEK_R1_MODEL_ID = "accounts/fireworks/models/deepseek-r1";
var MODEL_IDS = [GPT_3_5_TURBO_MODEL_ID, GPT_4_TURBO_MODEL_ID, GPT_4O_MODEL_ID, GPT_4O_20240806_MODEL_ID, GPT_4O_MINI_MODEL_ID, O1_MODEL_ID, O1_MINI_MODEL_ID, O3_MINI_MODEL_ID, CLAUDE_3_OPUS_2024029_MODEL_ID, CLAUDE_3_5_SONNET_20240620_MODEL_ID, CLAUDE_3_5_SONNET_20241022_MODEL_ID, CLAUDE_3_7_SONNET_20250219_MODEL_ID, CLAUDE_3_HAIKU_20240307_MODEL_ID, CLAUDE_3_5_HAIKU_20241022_MODEL_ID, CLAUDE_2_1_MODEL_ID, CLAUDE_INSTANT_1_2_MODEL_ID, MISTRAL_LARGE_MODEL_ID, MISTRAL_MEDIUM_MODEL_ID, MISTRAL_SMALL_MODEL_ID, MISTRAL_CODESTRAL_MODEL_ID, GEMINI_1_5_PRO_LATEST_MODEL_ID, GEMINI_1_5_FLASH_LATEST_MODEL_ID, GEMINI_2_FLASH_PREVIEW_MODEL_ID, GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID, GEMINI_2_FLASH_MODEL_ID, GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID, GEMINI_2_PRO_PREVIEW_MODEL_ID, TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID, TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID, TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID, TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID, TOGETHERAI_DEEPSEEK_V3_MODEL_ID, TOGETHERAI_DEEPSEEK_R1_MODEL_ID, DEEPSEEK_CHAT_MODEL_ID, DEEPSEEK_REASONER_MODEL_ID, FIREWORKS_DEEPSEEK_R1_MODEL_ID];
var isModelId = function isModelId(modelId) {
  return MODEL_IDS.includes(modelId);
};
var ModelIdCodec = /*#__PURE__*/ioTsEnum(MODEL_IDS);
// Should be used for all Open AI models older than gpt-4o-2024-08-06 to prevent issues
// with invalid JSON.
var LEGACY_OPEN_AI_TOOL_USE_META_PROMPT = "When using tools, generate valid and properly escaped JSON arguments.";
var GPT_3_5_TURBO_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_3_5_TURBO_MODEL_ID,
  displayName: "GPT 3.5 turbo",
  contextSize: 16384,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 24,
  // 12_288
  largeModel: false,
  description: "OpenAI's GPT 3.5 Turbo model, cost-effective and high throughput (16k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
  generationTokensCount: 2048,
  supportsVision: false
};
var GPT_4_TURBO_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4_TURBO_MODEL_ID,
  displayName: "GPT 4 turbo",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4 Turbo model for complex tasks (128k context).",
  shortDescription: "OpenAI's second best model.",
  isLegacy: false,
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
  generationTokensCount: 2048,
  supportsVision: true
};
var GPT_4O_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4O_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true
};
var GPT_4O_20240806_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4O_20240806_MODEL_ID,
  displayName: "GPT 4o",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o model (128k context).",
  shortDescription: "OpenAI's most advanced model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true
};
var GPT_4O_MINI_MODEL_CONFIG = {
  providerId: "openai",
  modelId: GPT_4O_MINI_MODEL_ID,
  displayName: "GPT 4o-mini",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's GPT 4o mini model (128k context).",
  shortDescription: "OpenAI's fast model.",
  isLegacy: false,
  toolUseMetaPrompt: LEGACY_OPEN_AI_TOOL_USE_META_PROMPT,
  generationTokensCount: 2048,
  supportsVision: true
};
var O1_MODEL_CONFIG = {
  providerId: "openai",
  modelId: O1_MODEL_ID,
  displayName: "o1",
  contextSize: 200000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's reasoning model designed to solve hard problems across domains (Limited preview access).",
  shortDescription: "OpenAI's reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  featureFlag: "openai_o1_feature",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature"
};
var O1_HIGH_REASONING_MODEL_CONFIG = {
  providerId: "openai",
  modelId: O1_MODEL_ID,
  displayName: "o1 (High Reasoning)",
  contextSize: 200000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's reasoning model designed to solve hard problems across domains (Limited preview access). High reasoning effort.",
  shortDescription: "OpenAI's reasoning model (high effort).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  reasoningEffort: "high",
  featureFlag: "openai_o1_high_reasoning_feature",
  customAssistantFeatureFlag: "openai_o1_high_reasoning_custom_assistants_feature"
};
var O1_MINI_MODEL_CONFIG = {
  providerId: "openai",
  modelId: O1_MINI_MODEL_ID,
  displayName: "o1-mini",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  featureFlag: "openai_o1_mini_feature",
  customAssistantFeatureFlag: "openai_o1_custom_assistants_feature"
};
var O3_MINI_MODEL_CONFIG = {
  providerId: "openai",
  modelId: O3_MINI_MODEL_ID,
  displayName: "o3-mini",
  contextSize: 200000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's fast reasoning model particularly good at coding, math, and science.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var O3_MINI_HIGH_REASONING_MODEL_CONFIG = {
  providerId: "openai",
  modelId: O3_MINI_MODEL_ID,
  displayName: "o3-mini (High Reasoning)",
  contextSize: 200000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "OpenAI's fast reasoning model particularly good at coding, math, and science. High reasoning effort.",
  shortDescription: "OpenAI's fast reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  reasoningEffort: "high"
};
var ANTHROPIC_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [{
    openingPattern: "<thinking>",
    closingPattern: "</thinking>",
    classification: "chain_of_thought",
    swallow: false
  }, {
    openingPattern: "<search_quality_reflection>",
    closingPattern: "</search_quality_reflection>",
    classification: "chain_of_thought",
    swallow: false
  }, {
    openingPattern: "<reflecting>",
    closingPattern: "</reflecting>",
    classification: "chain_of_thought",
    swallow: false
  }, {
    openingPattern: "<search_quality_score>",
    closingPattern: "</search_quality_score>",
    classification: "chain_of_thought",
    swallow: true
  }, {
    openingPattern: "<result>",
    closingPattern: "</result>",
    classification: "tokens",
    swallow: false
  }, {
    openingPattern: "<response>",
    closingPattern: "</response>",
    classification: "tokens",
    swallow: false
  }]
};
var ANTHROPIC_TOOL_USE_META_PROMPT = "Immediately before using a tool, think for one short bullet point in `<thinking>` tags about " + "how it evaluates against the criteria for a good and bad tool use. " + "After using a tool, think for one short bullet point in `<thinking>` tags to evaluate " + "whether the tools results are enough to answer the user's question. " + "The response to the user must be in `<response>` tags. " + "There must be a single `<response>` after the tools use (if any).";
var CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_OPUS_2024029_MODEL_ID,
  displayName: "Claude 3 Opus",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Anthropic's Claude 3 Opus model (200k context).",
  shortDescription: "Anthropic's largest model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  generationTokensCount: 4096,
  supportsVision: true,
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
  tokenCountAdjustment: 1.15
};
var CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  displayName: "Claude 3.5 Sonnet",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
  shortDescription: "Anthropic's latest model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  generationTokensCount: 8192,
  supportsVision: true,
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
  tokenCountAdjustment: 1.15
};
var CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  displayName: "Claude 3.5 Sonnet",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Anthropic's latest Claude 3.5 Sonnet model (200k context).",
  shortDescription: "Anthropic's latest model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  generationTokensCount: 8192,
  supportsVision: true,
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
  tokenCountAdjustment: 1.15
};
var CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  displayName: "Claude 3.7 Sonnet",
  contextSize: 200000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Anthropic's latest Claude 3.7 Sonnet model (200k context).",
  shortDescription: "Anthropic's best model.",
  isLegacy: false,
  delimitersConfiguration: ANTHROPIC_DELIMITERS_CONFIGURATION,
  generationTokensCount: 64000,
  supportsVision: true,
  toolUseMetaPrompt: ANTHROPIC_TOOL_USE_META_PROMPT,
  tokenCountAdjustment: 1.15
};
var CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  displayName: "Claude 3.5 Haiku",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: false,
  description: "Anthropic's Claude 3.5 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  tokenCountAdjustment: 1.15
};
var CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_3_HAIKU_20240307_MODEL_ID,
  displayName: "Claude 3 Haiku",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: false,
  description: "Anthropic's Claude 3 Haiku model, cost effective and high throughput (200k context).",
  shortDescription: "Anthropic's cost-effective model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  tokenCountAdjustment: 1.15
};
var CLAUDE_2_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_2_1_MODEL_ID,
  displayName: "Claude 2.1",
  contextSize: 180000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Anthropic's Claude 2 model (200k context).",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  generationTokensCount: 2048,
  supportsVision: false
};
var CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = {
  providerId: "anthropic",
  modelId: CLAUDE_INSTANT_1_2_MODEL_ID,
  displayName: "Claude Instant 1.2",
  contextSize: 90000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: false,
  description: "Anthropic's low-latency and high throughput model (100k context)",
  shortDescription: "Anthropic's legacy model.",
  isLegacy: true,
  generationTokensCount: 2048,
  supportsVision: false
};
var MISTRAL_LARGE_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_LARGE_MODEL_ID,
  displayName: "Mistral Large",
  contextSize: 128000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: true,
  description: "Mistral's `large 2` model (128k context).",
  shortDescription: "Mistral's large model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var MISTRAL_MEDIUM_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_MEDIUM_MODEL_ID,
  displayName: "Mistral Medium",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: true,
  description: "Mistral's `medium` model (32k context).",
  shortDescription: "Mistral's legacy model.",
  isLegacy: true,
  generationTokensCount: 2048,
  supportsVision: false
};
var MISTRAL_SMALL_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_SMALL_MODEL_ID,
  displayName: "Mistral Small",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: false,
  description: "Mistral's `small` model (8x7B Instruct, 32k context).",
  shortDescription: "Mistral's cost-effective model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var MISTRAL_CODESTRAL_MODEL_CONFIG = {
  providerId: "mistral",
  modelId: MISTRAL_CODESTRAL_MODEL_ID,
  displayName: "Mistral Codestral",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: false,
  description: "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.",
  shortDescription: "Mistral's code model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var GEMINI_PRO_DEFAULT_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_PRO_LATEST_MODEL_ID,
  displayName: "Gemini Pro 1.5",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Google's best model for scaling across a wide range of tasks (1m context).",
  shortDescription: "Google's large model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var GEMINI_FLASH_DEFAULT_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_1_5_FLASH_LATEST_MODEL_ID,
  displayName: "Gemini Flash 1.5",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Google's lightweight, fast and cost-efficient model (1m context).",
  shortDescription: "Google's cost-effective model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "Google's lightweight, fast and cost-efficient model (1m context).",
  shortDescription: "Google's cost-effective model (preview).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  featureFlag: "google_ai_studio_experimental_models_feature"
};
var GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0 Thinking",
  contextSize: 32000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "Google's lightweight model optimized for reasoning (1m context).",
  shortDescription: "Google's reasoning-focused model (preview).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  featureFlag: "google_ai_studio_experimental_models_feature"
};
var GEMINI_2_FLASH_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_MODEL_ID,
  displayName: "Gemini Flash 2.0",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "Google's fast large context model (1m context).",
  shortDescription: "Google's fast model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true
};
var GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0 Lite Preview",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "Google's lightweight large context model (1m context).",
  shortDescription: "Google's lightweight model (preview).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  featureFlag: "google_ai_studio_experimental_models_feature"
};
var GEMINI_2_PRO_PREVIEW_MODEL_CONFIG = {
  providerId: "google_ai_studio",
  modelId: GEMINI_2_PRO_PREVIEW_MODEL_ID,
  displayName: "Gemini Flash 2.0 Pro Preview",
  contextSize: 1000000,
  recommendedTopK: 64,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "Google's powerful large context model (1m context).",
  shortDescription: "Google's powerful model (preview).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: true,
  featureFlag: "google_ai_studio_experimental_models_feature"
};
var TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID,
  displayName: "Llama 3.3 70B Instruct Turbo",
  contextSize: 128000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  // 65_536
  largeModel: true,
  description: "Meta's fast, powerful and open source model (128k context).",
  shortDescription: "Meta's open source model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID,
  displayName: "Qwen 2.5 Coder 32B Instruct",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: false,
  description: "Alibaba's fast model for coding (32k context).",
  shortDescription: "Alibaba's fast coding model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID,
  displayName: "Qwen QwQ 32B Preview",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: false,
  description: "Alibaba's fast reasoning model (32k context).",
  shortDescription: "Alibaba's fast reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID,
  displayName: "Qwen 72B Instruct",
  contextSize: 32000,
  recommendedTopK: 16,
  recommendedExhaustiveTopK: 56,
  // 28_672
  largeModel: false,
  description: "Alibaba's powerful model (32k context).",
  shortDescription: "Alibaba's powerful model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_V3_MODEL_ID,
  displayName: "DeepSeek V3 (TogetherAI)",
  contextSize: 131072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG = {
  providerId: "togetherai",
  modelId: TOGETHERAI_DEEPSEEK_R1_MODEL_ID,
  displayName: "DeepSeek R1 (TogetherAI)",
  contextSize: 163840,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek R1 (reasoning, 163k context, served via TogetherAI).",
  shortDescription: "DeepSeek R1 (reasoning model).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false
};
var DEEPSEEK_CHAT_MODEL_CONFIG = {
  providerId: "deepseek",
  modelId: DEEPSEEK_CHAT_MODEL_ID,
  displayName: "DeepSeek",
  contextSize: 64000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's best model (v3, 64k context).",
  shortDescription: "DeepSeek's best model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  featureFlag: "deepseek_feature"
};
var DEEPSEEK_REASONER_MODEL_CONFIG = {
  providerId: "deepseek",
  modelId: DEEPSEEK_REASONER_MODEL_ID,
  displayName: "DeepSeek R1",
  contextSize: 64000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek's reasoning model (R1, 64k context).",
  shortDescription: "DeepSeek's reasoning model.",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  featureFlag: "deepseek_feature"
};
var FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG = {
  providerId: "fireworks",
  modelId: FIREWORKS_DEEPSEEK_R1_MODEL_ID,
  displayName: "DeepSeek R1 (Fireworks)",
  contextSize: 164000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 128,
  largeModel: true,
  description: "DeepSeek's reasoning model (164k context, served via Fireworks).",
  shortDescription: "DeepSeek R1 (reasoning model).",
  isLegacy: false,
  generationTokensCount: 2048,
  supportsVision: false,
  delimitersConfiguration: {
    incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
    delimiters: [{
      openingPattern: "<think>",
      closingPattern: "</think>",
      classification: "chain_of_thought",
      swallow: false
    }]
  }
};
var SUPPORTED_MODEL_CONFIGS = [GPT_3_5_TURBO_MODEL_CONFIG, GPT_4_TURBO_MODEL_CONFIG, GPT_4O_MODEL_CONFIG, GPT_4O_20240806_MODEL_CONFIG, GPT_4O_MINI_MODEL_CONFIG, O1_MODEL_CONFIG, O1_HIGH_REASONING_MODEL_CONFIG, O1_MINI_MODEL_CONFIG, O3_MINI_MODEL_CONFIG, O3_MINI_HIGH_REASONING_MODEL_CONFIG, CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG, CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG, CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG, CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG, CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG, CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG, CLAUDE_2_DEFAULT_MODEL_CONFIG, CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG, MISTRAL_LARGE_MODEL_CONFIG, MISTRAL_MEDIUM_MODEL_CONFIG, MISTRAL_SMALL_MODEL_CONFIG, MISTRAL_CODESTRAL_MODEL_CONFIG, GEMINI_PRO_DEFAULT_MODEL_CONFIG, GEMINI_FLASH_DEFAULT_MODEL_CONFIG, GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG, GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG, GEMINI_2_FLASH_MODEL_CONFIG, GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG, GEMINI_2_PRO_PREVIEW_MODEL_CONFIG, TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG, TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG, TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG, TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG, TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG, TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG, DEEPSEEK_CHAT_MODEL_CONFIG, DEEPSEEK_REASONER_MODEL_CONFIG, FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG];
function isSupportedModel(model) {
  var maybeSupportedModel = model;
  return SUPPORTED_MODEL_CONFIGS.some(function (m) {
    return m.modelId === maybeSupportedModel.modelId && m.providerId === maybeSupportedModel.providerId;
  });
}
/**
 * Global agent list (stored here to be imported from client-side)
 */
exports.GLOBAL_AGENTS_SID = void 0;
(function (GLOBAL_AGENTS_SID) {
  GLOBAL_AGENTS_SID["HELPER"] = "helper";
  GLOBAL_AGENTS_SID["DUST"] = "dust";
  GLOBAL_AGENTS_SID["SLACK"] = "slack";
  GLOBAL_AGENTS_SID["GOOGLE_DRIVE"] = "google_drive";
  GLOBAL_AGENTS_SID["NOTION"] = "notion";
  GLOBAL_AGENTS_SID["GITHUB"] = "github";
  GLOBAL_AGENTS_SID["INTERCOM"] = "intercom";
  GLOBAL_AGENTS_SID["GPT35_TURBO"] = "gpt-3.5-turbo";
  GLOBAL_AGENTS_SID["GPT4"] = "gpt-4";
  GLOBAL_AGENTS_SID["O1"] = "o1";
  GLOBAL_AGENTS_SID["O1_MINI"] = "o1-mini";
  GLOBAL_AGENTS_SID["O1_HIGH_REASONING"] = "o1_high";
  GLOBAL_AGENTS_SID["O3_MINI"] = "o3-mini";
  GLOBAL_AGENTS_SID["CLAUDE_3_OPUS"] = "claude-3-opus";
  GLOBAL_AGENTS_SID["CLAUDE_3_SONNET"] = "claude-3-sonnet";
  GLOBAL_AGENTS_SID["CLAUDE_3_HAIKU"] = "claude-3-haiku";
  GLOBAL_AGENTS_SID["CLAUDE_3_7_SONNET"] = "claude-3-7-sonnet";
  GLOBAL_AGENTS_SID["CLAUDE_2"] = "claude-2";
  GLOBAL_AGENTS_SID["CLAUDE_INSTANT"] = "claude-instant-1";
  GLOBAL_AGENTS_SID["MISTRAL_LARGE"] = "mistral-large";
  GLOBAL_AGENTS_SID["MISTRAL_MEDIUM"] = "mistral-medium";
  //!\ TEMPORARY WORKAROUND: Renaming 'mistral' to 'mistral-small' is not feasible since
  // it interferes with the retrieval of ongoing conversations involving this agent.
  // Needed to preserve ongoing chat integrity due to 'sId=mistral' references in legacy messages.
  GLOBAL_AGENTS_SID["MISTRAL_SMALL"] = "mistral";
  GLOBAL_AGENTS_SID["GEMINI_PRO"] = "gemini-pro";
  GLOBAL_AGENTS_SID["DEEPSEEK_R1"] = "deepseek-r1";
})(exports.GLOBAL_AGENTS_SID || (exports.GLOBAL_AGENTS_SID = {}));
function getGlobalAgentAuthorName(agentId) {
  switch (agentId) {
    case exports.GLOBAL_AGENTS_SID.GPT4:
    case exports.GLOBAL_AGENTS_SID.O1:
    case exports.GLOBAL_AGENTS_SID.O1_MINI:
    case exports.GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
    case exports.GLOBAL_AGENTS_SID.O3_MINI:
      return "OpenAI";
    case exports.GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
    case exports.GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
    case exports.GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
    case exports.GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
    case exports.GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
    case exports.GLOBAL_AGENTS_SID.CLAUDE_2:
      return "Anthropic";
    case exports.GLOBAL_AGENTS_SID.MISTRAL_LARGE:
    case exports.GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
    case exports.GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return "Mistral";
    case exports.GLOBAL_AGENTS_SID.GEMINI_PRO:
      return "Google";
    case exports.GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      return "DeepSeek";
    default:
      return "Dust";
  }
}
var CUSTOM_ORDER = [exports.GLOBAL_AGENTS_SID.DUST, exports.GLOBAL_AGENTS_SID.GPT4, exports.GLOBAL_AGENTS_SID.O3_MINI, exports.GLOBAL_AGENTS_SID.SLACK, exports.GLOBAL_AGENTS_SID.NOTION, exports.GLOBAL_AGENTS_SID.GOOGLE_DRIVE, exports.GLOBAL_AGENTS_SID.GITHUB, exports.GLOBAL_AGENTS_SID.INTERCOM, exports.GLOBAL_AGENTS_SID.CLAUDE_3_OPUS, exports.GLOBAL_AGENTS_SID.CLAUDE_3_SONNET, exports.GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU, exports.GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET, exports.GLOBAL_AGENTS_SID.CLAUDE_2, exports.GLOBAL_AGENTS_SID.CLAUDE_INSTANT, exports.GLOBAL_AGENTS_SID.MISTRAL_LARGE, exports.GLOBAL_AGENTS_SID.MISTRAL_MEDIUM, exports.GLOBAL_AGENTS_SID.MISTRAL_SMALL, exports.GLOBAL_AGENTS_SID.GEMINI_PRO, exports.GLOBAL_AGENTS_SID.HELPER];
// This function implements our general strategy to sort agents to users (input bar, agent list,
// agent suggestions...).
function compareAgentsForSort(a, b) {
  // Place favorites first
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }
  // Check for 'dust'
  if (a.sId === exports.GLOBAL_AGENTS_SID.DUST) {
    return -1;
  }
  if (b.sId === exports.GLOBAL_AGENTS_SID.DUST) {
    return 1;
  }
  // Check for 'gpt4'
  if (a.sId === exports.GLOBAL_AGENTS_SID.GPT4) {
    return -1;
  }
  if (b.sId === exports.GLOBAL_AGENTS_SID.GPT4) {
    return 1;
  }
  // Check for agents with non-global 'scope'
  if (a.scope !== "global" && b.scope === "global") {
    return -1;
  }
  if (b.scope !== "global" && a.scope === "global") {
    return 1;
  }
  // Check for customOrder (slack, notion, googledrive, github, claude)
  var aIndex = CUSTOM_ORDER.indexOf(a.sId);
  var bIndex = CUSTOM_ORDER.indexOf(b.sId);
  if (aIndex !== -1 && bIndex !== -1) {
    return aIndex - bIndex; // Both are in customOrder, sort them accordingly
  }
  if (aIndex !== -1) {
    return -1;
  } // Only a is in customOrder, it comes first
  if (bIndex !== -1) {
    return 1;
  } // Only b is in customOrder, it comes first
  // default: sort alphabetically
  return a.name.localeCompare(b.name, "en", {
    sensitivity: "base"
  });
}

var LimitCodec = /*#__PURE__*/createRangeCodec(0, 100);
// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
var GetAgentConfigurationsQuerySchema = /*#__PURE__*/t__namespace.type({
  view: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("current_user"), /*#__PURE__*/t__namespace.literal("list"), /*#__PURE__*/t__namespace.literal("workspace"), /*#__PURE__*/t__namespace.literal("published"), /*#__PURE__*/t__namespace.literal("global"), /*#__PURE__*/t__namespace.literal("admin_internal"), /*#__PURE__*/t__namespace.literal("all"), t__namespace.undefined]),
  withUsage: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("true"), /*#__PURE__*/t__namespace.literal("false"), t__namespace.undefined]),
  withAuthors: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("true"), /*#__PURE__*/t__namespace.literal("false"), t__namespace.undefined]),
  withFeedbacks: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("true"), /*#__PURE__*/t__namespace.literal("false"), t__namespace.undefined]),
  limit: /*#__PURE__*/t__namespace.union([LimitCodec, t__namespace.undefined]),
  sort: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("priority"), /*#__PURE__*/t__namespace.literal("alphabetical"), t__namespace.undefined])
});
var GetAgentConfigurationsHistoryQuerySchema = /*#__PURE__*/t__namespace.type({
  limit: /*#__PURE__*/t__namespace.union([LimitCodec, t__namespace.undefined])
});
var GetAgentConfigurationsLeaderboardQuerySchema = /*#__PURE__*/t__namespace.type({
  view: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("list"), /*#__PURE__*/t__namespace.literal("workspace"), /*#__PURE__*/t__namespace.literal("published"), /*#__PURE__*/t__namespace.literal("global"), /*#__PURE__*/t__namespace.literal("admin_internal"), /*#__PURE__*/t__namespace.literal("manage-assistants-search"), /*#__PURE__*/t__namespace.literal("all")])
});
var DataSourceFilterParentsCodec = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
  "in": /*#__PURE__*/t__namespace.array(t__namespace.string),
  not: /*#__PURE__*/t__namespace.array(t__namespace.string)
}), t__namespace["null"]]);
var OptionalDataSourceFilterTagsCodec = /*#__PURE__*/t__namespace.partial({
  tags: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
    "in": /*#__PURE__*/t__namespace.array(t__namespace.string),
    not: /*#__PURE__*/t__namespace.array(t__namespace.string),
    mode: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("custom"), /*#__PURE__*/t__namespace.literal("auto")])
  }), t__namespace["null"]])
});
var DataSourceFilterCodec = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  parents: DataSourceFilterParentsCodec
}), OptionalDataSourceFilterTagsCodec]);
var RetrievalActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("retrieval_configuration"),
  query: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("auto"), /*#__PURE__*/t__namespace.literal("none")]),
  relativeTimeFrame: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("auto"), /*#__PURE__*/t__namespace.literal("none"), /*#__PURE__*/t__namespace.type({
    duration: t__namespace.number,
    unit: TimeframeUnitCodec
  })]),
  topK: /*#__PURE__*/t__namespace.union([t__namespace.number, /*#__PURE__*/t__namespace.literal("auto")]),
  dataSources: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    dataSourceViewId: t__namespace.string,
    workspaceId: t__namespace.string,
    filter: DataSourceFilterCodec
  }))
});
var DustAppRunActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("dust_app_run_configuration"),
  appWorkspaceId: t__namespace.string,
  appId: t__namespace.string
});
var TablesQueryActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("tables_query_configuration"),
  tables: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    dataSourceViewId: t__namespace.string,
    tableId: t__namespace.string,
    workspaceId: t__namespace.string
  }))
});
var WebsearchActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("websearch_configuration")
});
var BrowseActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("browse_configuration")
});
var ReasoningActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("reasoning_configuration"),
  modelId: ModelIdCodec,
  providerId: ModelProviderIdCodec,
  temperature: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace["null"]]),
  reasoningEffort: /*#__PURE__*/t__namespace.union([ReasoningEffortCodec, t__namespace["null"]])
});
var ProcessActionConfigurationSchema = /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("process_configuration"),
  dataSources: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    dataSourceViewId: t__namespace.string,
    workspaceId: t__namespace.string,
    filter: DataSourceFilterCodec
  })),
  relativeTimeFrame: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("auto"), /*#__PURE__*/t__namespace.literal("none"), /*#__PURE__*/t__namespace.type({
    duration: t__namespace.number,
    unit: TimeframeUnitCodec
  })]),
  schema: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    name: t__namespace.string,
    type: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("string"), /*#__PURE__*/t__namespace.literal("number"), /*#__PURE__*/t__namespace.literal("boolean")]),
    description: t__namespace.string
  }))
});
var multiActionsCommonFields = {
  name: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]]),
  description: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]])
};
var requiredMultiActionsCommonFields = /*#__PURE__*/t__namespace.type({
  name: t__namespace.string,
  description: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]])
});
var ActionConfigurationSchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.union([RetrievalActionConfigurationSchema, DustAppRunActionConfigurationSchema, TablesQueryActionConfigurationSchema, ProcessActionConfigurationSchema, WebsearchActionConfigurationSchema, BrowseActionConfigurationSchema, ReasoningActionConfigurationSchema]), requiredMultiActionsCommonFields]);
var ModelConfigurationSchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  modelId: ModelIdCodec,
  providerId: ModelProviderIdCodec,
  temperature: t__namespace.number
}),
/*#__PURE__*/
// TODO(2024-11-04 flav) Clean up this legacy type.
t__namespace.partial(multiActionsCommonFields), /*#__PURE__*/t__namespace.partial({
  reasoningEffort: ReasoningEffortCodec
})]);
var IsSupportedModelSchema = /*#__PURE__*/new t__namespace.Type("SupportedModel", isSupportedModel, function (i, c) {
  return isSupportedModel(i) ? t__namespace.success(i) : t__namespace.failure(i, c);
}, t__namespace.identity);
var PostOrPatchAgentConfigurationRequestBodySchema = /*#__PURE__*/t__namespace.type({
  assistant: /*#__PURE__*/t__namespace.type({
    name: t__namespace.string,
    description: t__namespace.string,
    instructions: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]]),
    pictureUrl: t__namespace.string,
    status: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("active"), /*#__PURE__*/t__namespace.literal("archived"), /*#__PURE__*/t__namespace.literal("draft")]),
    scope: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("workspace"), /*#__PURE__*/t__namespace.literal("published"), /*#__PURE__*/t__namespace.literal("private")]),
    model: /*#__PURE__*/t__namespace.intersection([ModelConfigurationSchema, IsSupportedModelSchema]),
    actions: /*#__PURE__*/t__namespace.array(ActionConfigurationSchema),
    templateId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"], t__namespace.undefined]),
    maxStepsPerRun: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined]),
    visualizationEnabled: t__namespace["boolean"]
  })
});

/**
 *  Filters out nulls & undefineds from an array by correclty narrowing the type
 */
function removeNulls(arr) {
  return arr.filter(function (v) {
    return v !== null && v !== undefined;
  });
}
function isString(value) {
  return typeof value === "string";
}
function isEmptyString(str) {
  if (str === null || str === undefined) {
    return true;
  }
  return str.trim() === "";
}

// Types.
var uniq = function uniq(arr) {
  return Array.from(new Set(arr));
};
var TABLE_PREFIX = "TABLE:";
// Define max sizes for each category.
var MAX_FILE_SIZES = {
  data: 50 * 1024 * 1024,
  // 50MB.
  code: 50 * 1024 * 1024,
  // 50MB.
  delimited: 50 * 1024 * 1024,
  // 50MB.
  image: 5 * 1024 * 1024 // 5 MB
};
function maxFileSizeToHumanReadable(size, decimals) {
  if (decimals === void 0) {
    decimals = 0;
  }
  if (size < 1024) {
    return size.toFixed(decimals) + " B";
  }
  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(decimals) + " KB";
  }
  if (size < 1024 * 1024 * 1024) {
    return (size / (1024 * 1024)).toFixed(decimals) + " MB";
  }
  return (size / (1024 * 1024 * 1024)).toFixed(decimals) + " GB";
}
var BIG_FILE_SIZE = 5000000;
function isBigFileSize(size) {
  return size > BIG_FILE_SIZE;
}
// Function to ensure file size is within max limit for given content type.
function ensureFileSize(contentType, fileSize) {
  var format = getFileFormat(contentType);
  if (format) {
    return fileSize <= MAX_FILE_SIZES[format.cat];
  }
  return false;
}
// NOTE: if we add more content types, we need to update the public api package. (but the typechecker should catch it)
var FILE_FORMATS = {
  // Images
  "image/jpeg": {
    cat: "image",
    exts: [".jpg", ".jpeg"]
  },
  "image/png": {
    cat: "image",
    exts: [".png"]
  },
  "image/gif": {
    cat: "image",
    exts: [".gif"]
  },
  "image/webp": {
    cat: "image",
    exts: [".webp"]
  },
  // Structured
  "text/csv": {
    cat: "delimited",
    exts: [".csv"]
  },
  "text/comma-separated-values": {
    cat: "delimited",
    exts: [".csv"]
  },
  "text/tsv": {
    cat: "delimited",
    exts: [".tsv"]
  },
  "text/tab-separated-values": {
    cat: "delimited",
    exts: [".tsv"]
  },
  "application/vnd.ms-excel": {
    cat: "delimited",
    exts: [".xls"]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    cat: "delimited",
    exts: [".xlsx"]
  },
  // Custom for section json files generated from tables query results.
  "application/vnd.dust.section.json": {
    cat: "data",
    exts: [".json"]
  },
  // Data
  "text/plain": {
    cat: "data",
    exts: [".txt", ".log", ".cfg", ".conf"]
  },
  "text/markdown": {
    cat: "data",
    exts: [".md", ".markdown"]
  },
  "text/vnd.dust.attachment.slack.thread": {
    cat: "data",
    exts: [".txt"]
  },
  "text/calendar": {
    cat: "data",
    exts: [".ics"]
  },
  "application/json": {
    cat: "data",
    exts: [".json"]
  },
  "application/msword": {
    cat: "data",
    exts: [".doc", ".docx"]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    cat: "data",
    exts: [".doc", ".docx"]
  },
  "application/vnd.ms-powerpoint": {
    cat: "data",
    exts: [".ppt", ".pptx"]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    cat: "data",
    exts: [".ppt", ".pptx"]
  },
  "application/pdf": {
    cat: "data",
    exts: [".pdf"]
  },
  // Code
  "text/xml": {
    cat: "data",
    exts: [".xml"]
  },
  "application/xml": {
    cat: "data",
    exts: [".xml"]
  },
  "text/html": {
    cat: "data",
    exts: [".html", ".htm", ".xhtml", ".xhtml+xml"]
  },
  "text/css": {
    cat: "code",
    exts: [".css"]
  },
  "text/javascript": {
    cat: "code",
    exts: [".js", ".mjs", "*.jsx"]
  },
  "text/typescript": {
    cat: "code",
    exts: [".ts", ".tsx"]
  },
  "application/x-sh": {
    cat: "code",
    exts: [".sh"]
  },
  "text/x-sh": {
    cat: "code",
    exts: [".sh"]
  },
  "text/x-python": {
    cat: "code",
    exts: [".py"]
  },
  "text/x-python-script": {
    cat: "code",
    exts: [".py"]
  },
  "application/x-yaml": {
    cat: "code",
    exts: [".yaml", ".yml"]
  },
  "text/yaml": {
    cat: "code",
    exts: [".yaml", ".yml"]
  },
  "text/vnd.yaml": {
    cat: "code",
    exts: [".yaml", ".yml"]
  },
  "text/x-c": {
    cat: "code",
    exts: [".c", ".cc", ".cpp", ".cxx", ".dic", ".h", ".hh"]
  },
  "text/x-csharp": {
    cat: "code",
    exts: [".cs"]
  },
  "text/x-java-source": {
    cat: "code",
    exts: [".java"]
  },
  "text/x-php": {
    cat: "code",
    exts: [".php"]
  },
  "text/x-ruby": {
    cat: "code",
    exts: [".rb"]
  },
  "text/x-sql": {
    cat: "code",
    exts: [".sql"]
  },
  "text/x-swift": {
    cat: "code",
    exts: [".swift"]
  },
  "text/x-rust": {
    cat: "code",
    exts: [".rs"]
  },
  "text/x-go": {
    cat: "code",
    exts: [".go"]
  },
  "text/x-kotlin": {
    cat: "code",
    exts: [".kt", ".kts"]
  },
  "text/x-scala": {
    cat: "code",
    exts: [".scala"]
  },
  "text/x-groovy": {
    cat: "code",
    exts: [".groovy"]
  },
  "text/x-perl": {
    cat: "code",
    exts: [".pl", ".pm"]
  },
  "text/x-perl-script": {
    cat: "code",
    exts: [".pl", ".pm"]
  }
  // declare type here using satisfies to allow flexible typing for keys, FileFormat type for values and yet infer the keys of FILE_FORMATS correctly below
};
// All the ones listed above
var supportedUploadableContentType = /*#__PURE__*/Object.keys(FILE_FORMATS);
function isSupportedFileContentType(contentType) {
  return !!FILE_FORMATS[contentType];
}
// UseCases supported on the public API
function isPublicySupportedUseCase(useCase) {
  return ["conversation"].includes(useCase);
}
function isSupportedImageContentType(contentType) {
  var format = getFileFormat(contentType);
  if (format) {
    return format.cat === "image";
  }
  return false;
}
function isSupportedDelimitedTextContentType(contentType) {
  var format = getFileFormat(contentType);
  if (format) {
    return format.cat === "delimited";
  }
  return false;
}
function getFileFormatCategory(contentType) {
  var format = getFileFormat(contentType);
  if (format) {
    return format.cat;
  }
  return null;
}
function getFileFormat(contentType) {
  if (isSupportedFileContentType(contentType)) {
    var format = FILE_FORMATS[contentType];
    if (format) {
      return format;
    }
  }
  return null;
}
function extensionsForContentType(contentType) {
  var format = getFileFormat(contentType);
  if (format) {
    return format.exts;
  }
  return [];
}
function contentTypeForExtension(extension) {
  var _entries$find;
  // Type assertion to handle the entries
  var entries = Object.entries(FILE_FORMATS);
  return (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ((_entries$find = entries.find(function (_ref) {
      var value = _ref[1];
      return value.exts.includes(extension);
    })) == null ? void 0 : _entries$find[0]) || null
  );
}
function getSupportedFileExtensions(cat) {
  if (cat === void 0) {
    cat = undefined;
  }
  return uniq(removeNulls(Object.values(FILE_FORMATS).flatMap(function (format) {
    return !cat || format.cat === cat ? format.exts : [];
  })));
}
function getSupportedNonImageFileExtensions() {
  return uniq(removeNulls(Object.values(FILE_FORMATS).flatMap(function (format) {
    return format.cat !== "image" ? format.exts : [];
  })));
}
function getSupportedNonImageMimeTypes() {
  return uniq(removeNulls(Object.entries(FILE_FORMATS).map(function (_ref2) {
    var key = _ref2[0],
      value = _ref2[1];
    return value.cat !== "image" ? key : null;
  })));
}

var InternalPostMessagesRequestBodySchema = /*#__PURE__*/t__namespace.type({
  content: t__namespace.string,
  mentions: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    configurationId: t__namespace.string
  })),
  context: /*#__PURE__*/t__namespace.type({
    timezone: t__namespace.string,
    profilePictureUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]])
  })
});
var ContentFragmentBaseSchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  title: t__namespace.string
}), /*#__PURE__*/t__namespace.partial({
  url: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]]),
  supersededContentFragmentId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]])
})]);
var getSupportedInlinedContentType = function getSupportedInlinedContentType() {
  var _getSupportedNonImage = getSupportedNonImageMimeTypes(),
    first = _getSupportedNonImage[0],
    second = _getSupportedNonImage[1],
    rest = _getSupportedNonImage.slice(2);
  return t__namespace.union([t__namespace.literal(first), t__namespace.literal(second)].concat(rest.map(function (value) {
    return t__namespace.literal(value);
  })));
};
var ContentFragmentInputWithFileIdSchema = /*#__PURE__*/t__namespace.intersection([ContentFragmentBaseSchema, /*#__PURE__*/t__namespace.type({
  fileId: t__namespace.string
})]);
function isContentFragmentInputWithContentType(fragment) {
  return "contentType" in fragment;
}
var InternalPostContentFragmentRequestBodySchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  context: /*#__PURE__*/t__namespace.type({
    profilePictureUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]])
  })
}), ContentFragmentInputWithFileIdSchema]);
var InternalPostConversationsRequestBodySchema = /*#__PURE__*/t__namespace.type({
  title: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace["null"]]),
  visibility: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("unlisted"), /*#__PURE__*/t__namespace.literal("workspace"), /*#__PURE__*/t__namespace.literal("deleted"), /*#__PURE__*/t__namespace.literal("test")]),
  message: /*#__PURE__*/t__namespace.union([InternalPostMessagesRequestBodySchema, t__namespace["null"]]),
  contentFragments: /*#__PURE__*/t__namespace.array(InternalPostContentFragmentRequestBodySchema)
});
var InternalPostBuilderSuggestionsRequestBodySchema = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("name"),
  inputs: /*#__PURE__*/t__namespace.type({
    instructions: t__namespace.string,
    description: t__namespace.string
  })
}), /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("emoji"),
  inputs: /*#__PURE__*/t__namespace.type({
    instructions: t__namespace.string
  })
}), /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("instructions"),
  inputs: /*#__PURE__*/t__namespace.type({
    current_instructions: t__namespace.string,
    former_suggestions: /*#__PURE__*/t__namespace.array(t__namespace.string)
  })
}), /*#__PURE__*/t__namespace.type({
  type: /*#__PURE__*/t__namespace.literal("description"),
  inputs: /*#__PURE__*/t__namespace.type({
    instructions: t__namespace.string,
    name: t__namespace.string
  })
})]);
var BuilderSuggestionsResponseBodySchema = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
  status: /*#__PURE__*/t__namespace.literal("ok"),
  suggestions: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace["null"], t__namespace.undefined])
}), /*#__PURE__*/t__namespace.type({
  status: /*#__PURE__*/t__namespace.literal("unavailable"),
  reason: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("user_not_finished"),
  /*#__PURE__*/
  // The user has not finished inputing data for suggestions to make sense
  t__namespace.literal("irrelevant")])
})]);
var BuilderEmojiSuggestionsResponseBodySchema = /*#__PURE__*/t__namespace.type({
  suggestions: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
    emoji: t__namespace.string,
    backgroundColor: t__namespace.string
  }))
});
var InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema = /*#__PURE__*/t__namespace.type({
  instructions: t__namespace.string
});

var PostRestrictedSpace = /*#__PURE__*/t__namespace.type({
  memberIds: /*#__PURE__*/t__namespace.array(t__namespace.string),
  isRestricted: /*#__PURE__*/t__namespace.literal(true)
});
var PostUnrestrictedSpace = /*#__PURE__*/t__namespace.type({
  memberIds: t__namespace["null"],
  isRestricted: /*#__PURE__*/t__namespace.literal(false)
});
var PostSpaceRequestBodySchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  name: t__namespace.string
}), /*#__PURE__*/t__namespace.union([PostRestrictedSpace, PostUnrestrictedSpace])]);
var PatchSpaceMembersRequestBodySchema = /*#__PURE__*/t__namespace.union([PostRestrictedSpace, PostUnrestrictedSpace]);
var ContentSchema = /*#__PURE__*/t__namespace.type({
  dataSourceId: t__namespace.string,
  parentsIn: /*#__PURE__*/t__namespace.array(t__namespace.string)
});
var PatchSpaceRequestBodySchema = /*#__PURE__*/t__namespace.type({
  name: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  content: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(ContentSchema), t__namespace.undefined])
});
var PostDataSourceViewSchema = ContentSchema;
var PostNotionSyncPayloadSchema = /*#__PURE__*/t__namespace.type({
  urls: /*#__PURE__*/t__namespace.array(t__namespace.string),
  method: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("sync"), /*#__PURE__*/t__namespace.literal("delete")])
});
var GetPostNotionSyncResponseBodySchema = /*#__PURE__*/t__namespace.type({
  syncResults: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
    url: t__namespace.string,
    method: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("sync"), /*#__PURE__*/t__namespace.literal("delete")]),
    timestamp: t__namespace.number,
    success: t__namespace["boolean"]
  }), /*#__PURE__*/t__namespace.partial({
    error_message: t__namespace.string
  })]))
});

var UpsertContextSchema = /*#__PURE__*/t__namespace.type({
  sync_type: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("batch"), /*#__PURE__*/t__namespace.literal("incremental"), t__namespace.undefined])
});
var FrontDataSourceDocumentSection = /*#__PURE__*/t__namespace.recursion("Section", function () {
  return t__namespace.type({
    prefix: t__namespace.union([t__namespace.string, t__namespace["null"]]),
    content: t__namespace.union([t__namespace.string, t__namespace["null"]]),
    sections: t__namespace.array(FrontDataSourceDocumentSection)
  });
});
var PostDataSourceDocumentRequestBodySchema = /*#__PURE__*/t__namespace.type({
  timestamp: /*#__PURE__*/t__namespace.union([t__namespace.Int, t__namespace.undefined, t__namespace["null"]]),
  tags: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined, t__namespace["null"]]),
  parent_id: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]]),
  parents: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined, t__namespace["null"]]),
  source_url: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]]),
  upsert_context: /*#__PURE__*/t__namespace.union([UpsertContextSchema, t__namespace.undefined, t__namespace["null"]]),
  text: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]]),
  section: /*#__PURE__*/t__namespace.union([FrontDataSourceDocumentSection, t__namespace.undefined, t__namespace["null"]]),
  light_document_output: /*#__PURE__*/t__namespace.union([t__namespace["boolean"], t__namespace.undefined]),
  async: /*#__PURE__*/t__namespace.union([t__namespace["boolean"], t__namespace.undefined, t__namespace["null"]]),
  title: t__namespace.string,
  mime_type: t__namespace.string
});
var PostDataSourceWithNameDocumentRequestBodySchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  name: t__namespace.string
}), PostDataSourceDocumentRequestBodySchema]);
var PatchDataSourceTableRequestBodySchema = /*#__PURE__*/t__namespace.type({
  name: t__namespace.string,
  description: t__namespace.string,
  timestamp: /*#__PURE__*/t__namespace.union([t__namespace.number, t__namespace.undefined, t__namespace["null"]]),
  tags: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined, t__namespace["null"]]),
  parentId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]]),
  parents: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined, t__namespace["null"]]),
  truncate: t__namespace["boolean"],
  async: /*#__PURE__*/t__namespace.union([t__namespace["boolean"], t__namespace.undefined]),
  fileId: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  title: t__namespace.string,
  mimeType: t__namespace.string,
  sourceUrl: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined, t__namespace["null"]])
});

var ParentsToAddRemoveSchema = /*#__PURE__*/t__namespace.type({
  parentsToAdd: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined]),
  parentsToRemove: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.array(t__namespace.string), t__namespace.undefined])
});
var ParentsInSchema = /*#__PURE__*/t__namespace.type({
  parentsIn: /*#__PURE__*/t__namespace.array(t__namespace.string)
});
var PatchDataSourceViewSchema = /*#__PURE__*/t__namespace.union([ParentsToAddRemoveSchema, ParentsInSchema]);
var DATA_SOURCE_VIEW_CATEGORIES = ["managed", "folder", "website", "apps"];
function isValidDataSourceViewCategory(category) {
  return DATA_SOURCE_VIEW_CATEGORIES.includes(category);
}
function isDataSourceViewCategoryWithoutApps(category) {
  return isValidDataSourceViewCategory(category) && category !== "apps";
}
function isWebsiteOrFolderCategory(category) {
  return category === "website" || category === "folder";
}

var APP_NAME_REGEXP = /^[a-zA-Z0-9_-]{1,64}$/;

var BrowseResultSchema = /*#__PURE__*/t__namespace.type({
  requestedUrl: t__namespace.string,
  browsedUrl: t__namespace.string,
  content: t__namespace.string,
  responseCode: t__namespace.string,
  errorMessage: t__namespace.string
});
var BrowseActionOutputSchema = /*#__PURE__*/t__namespace.type({
  results: /*#__PURE__*/t__namespace.array(BrowseResultSchema)
});

function getDustAppRunResultsFileTitle(_ref) {
  var appName = _ref.appName,
    resultsFileContentType = _ref.resultsFileContentType;
  var extension = resultsFileContentType.split("/").pop();
  var title = appName + "_output";
  if (extension) {
    title += "." + extension;
  }
  return title;
}

var BaseAction = /*#__PURE__*/function () {
  function BaseAction(id, type, generatedFiles) {
    if (generatedFiles === void 0) {
      generatedFiles = [];
    }
    this.id = void 0;
    this.type = void 0;
    this.generatedFiles = void 0;
    this.id = id;
    this.type = type;
    this.generatedFiles = generatedFiles;
  }
  var _proto = BaseAction.prototype;
  _proto.getGeneratedFiles = function getGeneratedFiles() {
    return this.generatedFiles;
  };
  return BaseAction;
}();

function isTablesQueryConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "tables_query_configuration";
}
function isTablesQueryActionType(arg) {
  return arg.type === "tables_query_action";
}
function isDustAppRunConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "dust_app_run_configuration";
}
// TODO(2024-05-14 flav) Refactor for better separation of concerns in the front-end.
function isDustAppRunActionType(arg) {
  return arg.type === "dust_app_run_action";
}
// This is temporary until we refactor all action to this class structure.
function isBaseActionClass(action) {
  return action instanceof BaseAction;
}
function isRetrievalConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "retrieval_configuration";
}
function isRetrievalActionType(arg) {
  return arg.type === "retrieval_action";
}
function isProcessConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "process_configuration";
}
function isProcessActionType(arg) {
  return arg.type === "process_action";
}
function isWebsearchConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "websearch_configuration";
}
function isSearchLabelsConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "search_labels_configuration";
}
function isReasoningConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "reasoning_configuration";
}
function isWebsearchActionType(arg) {
  return arg.type === "websearch_action";
}
function isBrowseConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "browse_configuration";
}
function isBrowseActionType(arg) {
  return arg.type === "browse_action";
}
function isConversationIncludeFileConfiguration(arg) {
  return !!arg && typeof arg === "object" && "type" in arg && arg.type === "conversation_include_file_configuration";
}
function isConversationIncludeFileConfigurationActionType(arg) {
  return arg.type === "conversation_include_file_action";
}
function throwIfInvalidAgentConfiguration(configation) {
  configation.actions.forEach(function (action) {
    if (isProcessConfiguration(action)) {
      if (action.relativeTimeFrame === "auto" || action.relativeTimeFrame === "none") {
        /** Should never happen as not permitted for now. */
        throw new Error("Invalid configuration: process must have a definite time frame");
      }
    }
  });
  var templateConfiguration = configation; // Creation
  var agentConfiguration = configation; // Edition
  if (templateConfiguration) {
    if (templateConfiguration.scope === "global") {
      throw new Error("Cannot create global agent");
    }
  }
  if (agentConfiguration) {
    if (agentConfiguration.scope === "global") {
      throw new Error("Cannot edit global agent");
    }
    if (agentConfiguration.status === "archived") {
      throw new Error("Cannot edit archived agent");
    }
  }
}

var PROCESS_SCHEMA_ALLOWED_TYPES = ["string", "number", "boolean"];
function renderSchemaPropertiesAsJSONSchema(schema) {
  var jsonSchema = {};
  if (schema.length > 0) {
    schema.forEach(function (f) {
      jsonSchema[f.name] = {
        type: f.type,
        description: f.description
      };
    });
  } else {
    // Default schema for extraction.
    jsonSchema = {
      required_data: {
        type: "string",
        description: "Minimal (short and concise) piece of information extracted to follow instructions"
      }
    };
  }
  return jsonSchema;
}
// Use top_k of 768 as 512 worked really smoothly during initial tests. Might update to 1024 in the
// future based on user feedback.
var PROCESS_ACTION_TOP_K = 768;

function getTablesQueryResultsFileTitle(_ref) {
  var output = _ref.output;
  return typeof (output == null ? void 0 : output.query_title) === "string" ? output.query_title : "query_results";
}
function getTablesQueryResultsFileAttachments(_ref2) {
  var resultsFileId = _ref2.resultsFileId,
    resultsFileSnippet = _ref2.resultsFileSnippet,
    sectionFileId = _ref2.sectionFileId,
    output = _ref2.output;
  if (!resultsFileId || !resultsFileSnippet) {
    return null;
  }
  var fileTitle = getTablesQueryResultsFileTitle({
    output: output
  });
  var resultsFileAttachment = "<file " + ("id=\"" + resultsFileId + "\" type=\"text/csv\" title=\"" + fileTitle + "\">\n" + resultsFileSnippet + "\n</file>");
  var sectionFileAttachment = "";
  if (sectionFileId) {
    sectionFileAttachment = "\n<file " + ("id=\"" + sectionFileId + "\" type=\"application/vnd.dust.section.json\" title=\"" + fileTitle + " (Results optimized for search)\" />");
  }
  return "" + resultsFileAttachment + sectionFileAttachment;
}

// Type fresh out from the Dust app
var WebsearchAppResultSchema = /*#__PURE__*/t__namespace.type({
  title: t__namespace.string,
  snippet: t__namespace.string,
  link: t__namespace.string
});
var WebsearchAppActionOutputSchema = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
  results: /*#__PURE__*/t__namespace.array(WebsearchAppResultSchema)
}), /*#__PURE__*/t__namespace.type({
  error: t__namespace.string,
  results: /*#__PURE__*/t__namespace.array(WebsearchAppResultSchema)
})]);
// Type after processing in the run loop (to add references)
var WebsearchResultSchema = /*#__PURE__*/t__namespace.type({
  title: t__namespace.string,
  snippet: t__namespace.string,
  link: t__namespace.string,
  reference: t__namespace.string
});
var WebsearchActionOutputSchema = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.type({
  results: /*#__PURE__*/t__namespace.array(WebsearchResultSchema)
}), /*#__PURE__*/t__namespace.type({
  results: /*#__PURE__*/t__namespace.array(WebsearchResultSchema),
  error: t__namespace.string
})]);

/**
 * Agent configuration scope
 * - 'global' scope are Dust agents, not editable, inside-list for all, cannot be overriden
 * - 'workspace' scope are editable by builders only,  inside-list by default but user can change it
 * - 'published' scope are editable by everybody, outside-list by default
 * - 'private' scope are editable by author only, inside-list for author, cannot be overriden (so no
 *   entry in the table
 */
var AGENT_CONFIGURATION_SCOPES = ["global", "workspace", "published", "private"];
var DEFAULT_MAX_STEPS_USE_PER_RUN = 8;
var MAX_STEPS_USE_PER_RUN_LIMIT = 12;

var TAILWIND_COLOR_NAMES = ["pink", "rose", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia"];
var TAILWIND_COLOR_SHADES = ["100", "200", "300", "400", "500", "600", "700", "800"];
var generateTailwindBackgroundColors = function generateTailwindBackgroundColors() {
  var tailwindColors = [];
  TAILWIND_COLOR_NAMES.forEach(function (color) {
    TAILWIND_COLOR_SHADES.forEach(function (shade) {
      tailwindColors.push("bg-" + color + "-" + shade);
    });
  });
  return tailwindColors;
};

var ASSISTANT_CREATIVITY_LEVELS = ["deterministic", "factual", "balanced", "creative"];
var AssistantCreativityLevelCodec = /*#__PURE__*/ioTsEnum(ASSISTANT_CREATIVITY_LEVELS, "AssistantCreativityLevel");
var ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES = {
  deterministic: "Deterministic",
  factual: "Factual",
  balanced: "Balanced",
  creative: "Creative"
};
var ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES = {
  deterministic: 0.0,
  factual: 0.2,
  balanced: 0.7,
  creative: 1.0
};
var ASSISTANT_BUILDER_DRAWER_TABS = ["Template", "Preview", "Performance"];

function isAgentMention(arg) {
  return arg.configurationId !== undefined;
}
function isUserMessageType(arg) {
  return arg.type === "user_message";
}
var ACTION_RUNNING_LABELS = {
  browse_action: "Browsing page",
  conversation_include_file_action: "Reading file",
  conversation_list_files_action: "Listing files",
  dust_app_run_action: "Running App",
  process_action: "Extracting data",
  reasoning_action: "Reasoning",
  retrieval_action: "Searching data",
  search_labels_action: "Searching labels",
  tables_query_action: "Querying tables",
  websearch_action: "Searching the web"
};
function isAgentMessageType(arg) {
  return arg.type === "agent_message";
}
var CONVERSATION_ERROR_TYPES = ["conversation_not_found", "conversation_access_restricted", "conversation_with_unavailable_agent"];
var ConversationError = /*#__PURE__*/function (_Error) {
  function ConversationError(type) {
    var _this;
    _this = _Error.call(this, "Cannot access conversation: " + type) || this;
    _this.type = void 0;
    _this.type = type;
    return _this;
  }
  _inheritsLoose(ConversationError, _Error);
  return ConversationError;
}( /*#__PURE__*/_wrapNativeSuper(Error));

/**
 * Model rendering of conversations.
 */
function isTextContent(content) {
  return content.type === "text";
}
function isContentFragmentMessageTypeModel(contentFragment) {
  return contentFragment.role === "content_fragment";
}
function isUserMessageTypeModel(userMessage) {
  return userMessage.role === "user";
}

// TAGS
var TEMPLATES_TAG_CODES = ["CONTENT", "DATA", "DESIGN", "ENGINEERING", "FINANCE", "HIRING", "KNOWLEDGE", "MARKETING", "OPERATIONS", "PRODUCT", "PRODUCT_MANAGEMENT", "PRODUCTIVITY", "SALES", "UX_DESIGN", "UX_RESEARCH", "WRITING"];
var TEMPLATES_TAGS_CONFIG = {
  CONTENT: {
    label: "Content"
  },
  DATA: {
    label: "Data"
  },
  DESIGN: {
    label: "Design"
  },
  ENGINEERING: {
    label: "Engineering"
  },
  FINANCE: {
    label: "Finance"
  },
  HIRING: {
    label: "Hiring"
  },
  KNOWLEDGE: {
    label: "Knowledge"
  },
  MARKETING: {
    label: "Marketing"
  },
  OPERATIONS: {
    label: "Operations"
  },
  PRODUCT: {
    label: "Product"
  },
  PRODUCT_MANAGEMENT: {
    label: "Product Management"
  },
  PRODUCTIVITY: {
    label: "Productivity"
  },
  SALES: {
    label: "Sales"
  },
  UX_DESIGN: {
    label: "UX Design"
  },
  UX_RESEARCH: {
    label: "UX Research"
  },
  WRITING: {
    label: "Writing"
  }
};
function isTemplateTagCodeArray(value) {
  return Array.isArray(value) && value.every(function (v) {
    return TEMPLATES_TAG_CODES.includes(v);
  });
}
var TemplateTagCodeTypeCodec = /*#__PURE__*/t__namespace.keyof( /*#__PURE__*/_extends({}, TEMPLATES_TAGS_CONFIG));
var MULTI_ACTION_PRESETS = {
  DUST_APP_RUN: "Run Dust app",
  RETRIEVAL_SEARCH: "Search data sources",
  TABLES_QUERY: "Query tables",
  PROCESS: "Extract data",
  WEB_NAVIGATION: "Web navigation"
};
var MultiActionPresetCodec = /*#__PURE__*/ioTsEnum( /*#__PURE__*/Object.keys(MULTI_ACTION_PRESETS), "MultiActionPreset");
var TemplateActionTypePreset = /*#__PURE__*/t__namespace.type({
  type: MultiActionPresetCodec,
  name: NonEmptyString.NonEmptyString,
  description: NonEmptyString.NonEmptyString,
  help: NonEmptyString.NonEmptyString
});
var TemplateActionsPreset = /*#__PURE__*/t__namespace.array(TemplateActionTypePreset);
// VISIBILITY
var TEMPLATE_VISIBILITIES = ["draft", "published", "disabled"];
var TemplateVisibilityCodec = /*#__PURE__*/ioTsEnum(TEMPLATE_VISIBILITIES, "TemplateVisibility");
// FORM SCHEMA
var CreateTemplateFormSchema = /*#__PURE__*/t__namespace.type({
  backgroundColor: NonEmptyString.NonEmptyString,
  description: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  emoji: NonEmptyString.NonEmptyString,
  handle: NonEmptyString.NonEmptyString,
  timeFrameDuration: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  timeFrameUnit: /*#__PURE__*/t__namespace.union([TimeframeUnitCodec, /*#__PURE__*/t__namespace.literal(""), t__namespace.undefined]),
  helpActions: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  helpInstructions: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  presetActions: TemplateActionsPreset,
  presetInstructions: /*#__PURE__*/t__namespace.union([t__namespace.string, t__namespace.undefined]),
  presetModelId: t__namespace.string,
  presetTemperature: AssistantCreativityLevelCodec,
  tags: /*#__PURE__*/nonEmptyArray.nonEmptyArray(TemplateTagCodeTypeCodec),
  visibility: TemplateVisibilityCodec
});

// This defines the commands that the iframe can send to the host window.
var validCommands = ["getFile", "getCodeToExecute", "setContentHeight", "setErrorMessage"];
// TODO(@fontanierh): refactor all these guards to use io-ts instead of manual checks.
// Type guard for getFile.
function isGetFileRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "getFile" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string" && typeof v.params === "object" && v.params !== null && typeof v.params.fileId === "string";
}
// Type guard for getCodeToExecute.
function isGetCodeToExecuteRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "getCodeToExecute" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string";
}
// Type guard for setContentHeight.
function isSetContentHeightRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "setContentHeight" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string" && typeof v.params === "object" && v.params !== null && typeof v.params.height === "number";
}
function isSetErrorMessageRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "setErrorMessage" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string";
}
function isDownloadFileRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "downloadFileRequest" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string" && typeof v.params === "object" && v.params !== null && v.params.blob instanceof Blob;
}
// Type guard for getCodeToExecute.
function isDisplayCodeRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  var v = value;
  return v.command === "displayCode" && typeof v.identifier === "string" && typeof v.messageUniqueId === "string";
}
function isVisualizationRPCRequest(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return isGetCodeToExecuteRequest(value) || isGetFileRequest(value) || isDownloadFileRequest(value) || isSetContentHeightRequest(value) || isSetErrorMessageRequest(value) || isDisplayCodeRequest(value);
}

function isContentFragmentType(arg) {
  return arg.type === "content_fragment";
}

var CONNECTOR_PROVIDERS = ["confluence", "github", "google_drive", "intercom", "notion", "slack", "microsoft", "webcrawler", "snowflake", "zendesk", "bigquery", "salesforce", "gong"];
function isConnectorProvider(val) {
  return CONNECTOR_PROVIDERS.includes(val);
}
function isDataSourceNameValid(name) {
  var trimmed = name.trim();
  if (trimmed.length === 0) {
    return new Err("DataSource name cannot be empty");
  }
  if (name.startsWith("managed-")) {
    return new Err("DataSource name cannot start with the prefix `managed-`");
  }
  return new Ok(undefined);
}

function defaultSelectionConfiguration(dataSourceView) {
  return {
    dataSourceView: dataSourceView,
    isSelectAll: false,
    selectedResources: [],
    tagsFilter: null
  };
}

/**
 * system group:
 * Accessible by no-one other than our system API keys.
 * Has access to the system Space which holds the connected data sources.
 *
 * global group:
 * Contains all users from the workspace.
 * Has access to the global Space which holds all existing datasource created before spaces.
 *
 * regular group:
 * Contains specific users added by workspace admins.
 * Has access to the list of spaces configured by workspace admins.
 */
var GROUP_KINDS = ["regular", "global", "system"];
function isGroupKind(value) {
  return GROUP_KINDS.includes(value);
}
function isSystemGroupKind(value) {
  return value === "system";
}
function isGlobalGroupKind(value) {
  return value === "global";
}
function prettifyGroupName(group) {
  if (group.kind === "global") {
    return "Company Data";
  }
  return group.name.replace("Group for Space ", "");
}
var DustGroupIdsHeader = "X-Dust-Group-Ids";
function getGroupIdsFromHeaders(headers) {
  var groupIds = headers[DustGroupIdsHeader.toLowerCase()];
  if (typeof groupIds === "string" && groupIds.trim().length > 0) {
    return groupIds.split(",").map(function (id) {
      return id.trim();
    });
  } else {
    return undefined;
  }
}
function getHeaderFromGroupIds(groupIds) {
  var _ref;
  if (!groupIds) {
    return undefined;
  }
  return _ref = {}, _ref[DustGroupIdsHeader] = groupIds.join(","), _ref;
}

var ActionResponseBaseSchema = /*#__PURE__*/t__namespace.type({
  run_id: t__namespace.string,
  created: t__namespace.Integer,
  run_type: t__namespace.string,
  config: t__namespace.UnknownRecord,
  status: /*#__PURE__*/t__namespace.type({
    run: t__namespace.string,
    blocks: /*#__PURE__*/t__namespace.array( /*#__PURE__*/t__namespace.type({
      block_type: t__namespace.string,
      name: t__namespace.string,
      status: t__namespace.string,
      success_count: t__namespace.Integer,
      error_count: t__namespace.Integer
    }))
  }),
  traces: t__namespace.UnknownArray,
  specification_hash: t__namespace.string
});
function isActionResponseBase(response) {
  return Either.isRight(ActionResponseBaseSchema.decode(response));
}

var _process$env$1 = process.env,
  _process$env$DUST_MAN = _process$env$1.DUST_MANAGED_ANTHROPIC_API_KEY,
  DUST_MANAGED_ANTHROPIC_API_KEY = _process$env$DUST_MAN === void 0 ? "" : _process$env$DUST_MAN,
  _process$env$DUST_MAN2 = _process$env$1.DUST_MANAGED_AZURE_OPENAI_API_KEY,
  DUST_MANAGED_AZURE_OPENAI_API_KEY = _process$env$DUST_MAN2 === void 0 ? "" : _process$env$DUST_MAN2,
  _process$env$DUST_MAN3 = _process$env$1.DUST_MANAGED_AZURE_OPENAI_ENDPOINT,
  DUST_MANAGED_AZURE_OPENAI_ENDPOINT = _process$env$DUST_MAN3 === void 0 ? "" : _process$env$DUST_MAN3,
  _process$env$DUST_MAN4 = _process$env$1.DUST_MANAGED_OPENAI_API_KEY,
  DUST_MANAGED_OPENAI_API_KEY = _process$env$DUST_MAN4 === void 0 ? "" : _process$env$DUST_MAN4,
  _process$env$DUST_MAN5 = _process$env$1.DUST_MANAGED_TEXTSYNTH_API_KEY,
  DUST_MANAGED_TEXTSYNTH_API_KEY = _process$env$DUST_MAN5 === void 0 ? "" : _process$env$DUST_MAN5,
  _process$env$DUST_MAN6 = _process$env$1.DUST_MANAGED_MISTRAL_API_KEY,
  DUST_MANAGED_MISTRAL_API_KEY = _process$env$DUST_MAN6 === void 0 ? "" : _process$env$DUST_MAN6,
  _process$env$DUST_MAN7 = _process$env$1.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY,
  DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY = _process$env$DUST_MAN7 === void 0 ? "" : _process$env$DUST_MAN7,
  _process$env$DUST_MAN8 = _process$env$1.DUST_MANAGED_SERP_API_KEY,
  DUST_MANAGED_SERP_API_KEY = _process$env$DUST_MAN8 === void 0 ? "" : _process$env$DUST_MAN8,
  _process$env$DUST_MAN9 = _process$env$1.DUST_MANAGED_BROWSERLESS_API_KEY,
  DUST_MANAGED_BROWSERLESS_API_KEY = _process$env$DUST_MAN9 === void 0 ? "" : _process$env$DUST_MAN9,
  _process$env$DUST_MAN10 = _process$env$1.DUST_MANAGED_TOGETHERAI_API_KEY,
  DUST_MANAGED_TOGETHERAI_API_KEY = _process$env$DUST_MAN10 === void 0 ? "" : _process$env$DUST_MAN10,
  _process$env$DUST_MAN11 = _process$env$1.DUST_MANAGED_DEEPSEEK_API_KEY,
  DUST_MANAGED_DEEPSEEK_API_KEY = _process$env$DUST_MAN11 === void 0 ? "" : _process$env$DUST_MAN11,
  _process$env$DUST_MAN12 = _process$env$1.DUST_MANAGED_FIREWORKS_API_KEY,
  DUST_MANAGED_FIREWORKS_API_KEY = _process$env$DUST_MAN12 === void 0 ? "" : _process$env$DUST_MAN12;
var credentialsFromProviders = function credentialsFromProviders(providers) {
  var credentials = {};
  providers.forEach(function (provider) {
    var config = JSON.parse(provider.config);
    switch (provider.providerId) {
      case "openai":
        credentials["OPENAI_API_KEY"] = config.api_key;
        break;
      case "cohere":
        credentials["COHERE_API_KEY"] = config.api_key;
        break;
      case "ai21":
        credentials["AI21_API_KEY"] = config.api_key;
        break;
      case "azure_openai":
        credentials["AZURE_OPENAI_API_KEY"] = config.api_key;
        credentials["AZURE_OPENAI_ENDPOINT"] = config.endpoint;
        break;
      case "anthropic":
        credentials["ANTHROPIC_API_KEY"] = config.api_key;
        break;
      case "mistral":
        credentials["MISTRAL_API_KEY"] = config.api_key;
        break;
      case "textsynth":
        credentials["TEXTSYNTH_API_KEY"] = config.api_key;
        break;
      case "serpapi":
        credentials["SERP_API_KEY"] = config.api_key;
        break;
      case "serper":
        credentials["SERPER_API_KEY"] = config.api_key;
        break;
      case "browserlessapi":
        credentials["BROWSERLESS_API_KEY"] = config.api_key;
        break;
      case "google_ai_studio":
        credentials["GOOGLE_AI_STUDIO_API_KEY"] = config.api_key;
        break;
      case "togetherai":
        credentials["TOGETHERAI_API_KEY"] = config.api_key;
        break;
      case "deepseek":
        credentials["DEEPSEEK_API_KEY"] = config.api_key;
        break;
      case "fireworks":
        credentials["FIREWORKS_API_KEY"] = config.api_key;
        break;
    }
  });
  return credentials;
};
var dustManagedCredentials = function dustManagedCredentials() {
  return {
    ANTHROPIC_API_KEY: DUST_MANAGED_ANTHROPIC_API_KEY,
    AZURE_OPENAI_API_KEY: DUST_MANAGED_AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: DUST_MANAGED_AZURE_OPENAI_ENDPOINT,
    MISTRAL_API_KEY: DUST_MANAGED_MISTRAL_API_KEY,
    OPENAI_API_KEY: DUST_MANAGED_OPENAI_API_KEY,
    TEXTSYNTH_API_KEY: DUST_MANAGED_TEXTSYNTH_API_KEY,
    GOOGLE_AI_STUDIO_API_KEY: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY,
    SERP_API_KEY: DUST_MANAGED_SERP_API_KEY,
    BROWSERLESS_API_KEY: DUST_MANAGED_BROWSERLESS_API_KEY,
    TOGETHERAI_API_KEY: DUST_MANAGED_TOGETHERAI_API_KEY,
    DEEPSEEK_API_KEY: DUST_MANAGED_DEEPSEEK_API_KEY,
    FIREWORKS_API_KEY: DUST_MANAGED_FIREWORKS_API_KEY
  };
};

var CONNECTORS_ERROR_TYPES = ["oauth_token_revoked", "third_party_internal_error", "webcrawling_error", "webcrawling_error_empty_content", "webcrawling_error_content_too_large", "webcrawling_error_blocked", "webcrawling_synchronization_limit_reached", "remote_database_connection_not_readonly", "remote_database_network_error"];
function isConnectorError(val) {
  return CONNECTORS_ERROR_TYPES.includes(val);
}
var ConnectorsAPI = /*#__PURE__*/function () {
  function ConnectorsAPI(config, logger) {
    this._url = void 0;
    this._secret = void 0;
    this._logger = void 0;
    this._url = config.url;
    this._secret = config.secret;
    this._logger = logger;
  }
  var _proto = ConnectorsAPI.prototype;
  _proto.createConnector = /*#__PURE__*/function () {
    var _createConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
      var provider, workspaceId, workspaceAPIKey, dataSourceId, connectionId, configuration, res;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            provider = _ref.provider, workspaceId = _ref.workspaceId, workspaceAPIKey = _ref.workspaceAPIKey, dataSourceId = _ref.dataSourceId, connectionId = _ref.connectionId, configuration = _ref.configuration;
            _context.next = 3;
            return this._fetchWithError(this._url + "/connectors/create/" + encodeURIComponent(provider), {
              method: "POST",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify({
                workspaceId: workspaceId,
                workspaceAPIKey: workspaceAPIKey,
                dataSourceId: dataSourceId,
                connectionId: connectionId,
                configuration: configuration
              })
            });
          case 3:
            res = _context.sent;
            return _context.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context.stop();
        }
      }, _callee, this);
    }));
    function createConnector(_x) {
      return _createConnector.apply(this, arguments);
    }
    return createConnector;
  }();
  _proto.updateConfiguration = /*#__PURE__*/function () {
    var _updateConfiguration = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_ref2) {
      var connectorId, configuration, res;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            connectorId = _ref2.connectorId, configuration = _ref2.configuration;
            _context2.next = 3;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent(connectorId) + "/configuration", {
              method: "PATCH",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify(configuration)
            });
          case 3:
            res = _context2.sent;
            return _context2.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context2.stop();
        }
      }, _callee2, this);
    }));
    function updateConfiguration(_x2) {
      return _updateConfiguration.apply(this, arguments);
    }
    return updateConfiguration;
  }();
  _proto.updateConnector = /*#__PURE__*/function () {
    var _updateConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
      var connectorId, connectionId, res;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            connectorId = _ref3.connectorId, connectionId = _ref3.connectionId;
            _context3.next = 3;
            return this._fetchWithError(this._url + "/connectors/update/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify({
                connectionId: connectionId
              })
            });
          case 3:
            res = _context3.sent;
            return _context3.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context3.stop();
        }
      }, _callee3, this);
    }));
    function updateConnector(_x3) {
      return _updateConnector.apply(this, arguments);
    }
    return updateConnector;
  }();
  _proto.stopConnector = /*#__PURE__*/function () {
    var _stopConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(connectorId) {
      var res;
      return _regeneratorRuntime().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            _context4.next = 2;
            return this._fetchWithError(this._url + "/connectors/stop/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context4.sent;
            return _context4.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context4.stop();
        }
      }, _callee4, this);
    }));
    function stopConnector(_x4) {
      return _stopConnector.apply(this, arguments);
    }
    return stopConnector;
  }();
  _proto.pauseConnector = /*#__PURE__*/function () {
    var _pauseConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(connectorId) {
      var res;
      return _regeneratorRuntime().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            _context5.next = 2;
            return this._fetchWithError(this._url + "/connectors/pause/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context5.sent;
            return _context5.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context5.stop();
        }
      }, _callee5, this);
    }));
    function pauseConnector(_x5) {
      return _pauseConnector.apply(this, arguments);
    }
    return pauseConnector;
  }();
  _proto.unpauseConnector = /*#__PURE__*/function () {
    var _unpauseConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(connectorId) {
      var res;
      return _regeneratorRuntime().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            _context6.next = 2;
            return this._fetchWithError(this._url + "/connectors/unpause/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context6.sent;
            return _context6.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context6.stop();
        }
      }, _callee6, this);
    }));
    function unpauseConnector(_x6) {
      return _unpauseConnector.apply(this, arguments);
    }
    return unpauseConnector;
  }();
  _proto.resumeConnector = /*#__PURE__*/function () {
    var _resumeConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(connectorId) {
      var res;
      return _regeneratorRuntime().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            _context7.next = 2;
            return this._fetchWithError(this._url + "/connectors/resume/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context7.sent;
            return _context7.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context7.stop();
        }
      }, _callee7, this);
    }));
    function resumeConnector(_x7) {
      return _resumeConnector.apply(this, arguments);
    }
    return resumeConnector;
  }();
  _proto.syncConnector = /*#__PURE__*/function () {
    var _syncConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8(connectorId) {
      var res;
      return _regeneratorRuntime().wrap(function _callee8$(_context8) {
        while (1) switch (_context8.prev = _context8.next) {
          case 0:
            _context8.next = 2;
            return this._fetchWithError(this._url + "/connectors/sync/" + encodeURIComponent(connectorId), {
              method: "POST",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context8.sent;
            return _context8.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context8.stop();
        }
      }, _callee8, this);
    }));
    function syncConnector(_x8) {
      return _syncConnector.apply(this, arguments);
    }
    return syncConnector;
  }();
  _proto.deleteConnector = /*#__PURE__*/function () {
    var _deleteConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(connectorId, force) {
      var res;
      return _regeneratorRuntime().wrap(function _callee9$(_context9) {
        while (1) switch (_context9.prev = _context9.next) {
          case 0:
            if (force === void 0) {
              force = false;
            }
            _context9.next = 3;
            return this._fetchWithError(this._url + "/connectors/delete/" + encodeURIComponent(connectorId) + "?force=" + (force ? "true" : "false"), {
              method: "DELETE",
              headers: this.getDefaultHeaders()
            });
          case 3:
            res = _context9.sent;
            return _context9.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context9.stop();
        }
      }, _callee9, this);
    }));
    function deleteConnector(_x9, _x10) {
      return _deleteConnector.apply(this, arguments);
    }
    return deleteConnector;
  }();
  _proto.getConnectorPermissions = /*#__PURE__*/function () {
    var _getConnectorPermissions = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10(_ref4) {
      var connectorId, filterPermission, parentId, _ref4$viewType, viewType, queryParams, qs, url, res;
      return _regeneratorRuntime().wrap(function _callee10$(_context10) {
        while (1) switch (_context10.prev = _context10.next) {
          case 0:
            connectorId = _ref4.connectorId, filterPermission = _ref4.filterPermission, parentId = _ref4.parentId, _ref4$viewType = _ref4.viewType, viewType = _ref4$viewType === void 0 ? "document" : _ref4$viewType;
            queryParams = new URLSearchParams();
            if (parentId) {
              queryParams.append("parentId", parentId);
            }
            if (filterPermission) {
              queryParams.append("filterPermission", filterPermission);
            }
            qs = queryParams.toString();
            url = this._url + "/connectors/" + encodeURIComponent(connectorId) + "/permissions?viewType=" + viewType + "&" + qs;
            _context10.next = 8;
            return this._fetchWithError(url, {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 8:
            res = _context10.sent;
            return _context10.abrupt("return", this._resultFromResponse(res));
          case 10:
          case "end":
            return _context10.stop();
        }
      }, _callee10, this);
    }));
    function getConnectorPermissions(_x11) {
      return _getConnectorPermissions.apply(this, arguments);
    }
    return getConnectorPermissions;
  }();
  _proto.setConnectorPermissions = /*#__PURE__*/function () {
    var _setConnectorPermissions = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee11(_ref5) {
      var connectorId, resources, res;
      return _regeneratorRuntime().wrap(function _callee11$(_context11) {
        while (1) switch (_context11.prev = _context11.next) {
          case 0:
            connectorId = _ref5.connectorId, resources = _ref5.resources;
            // Connector permission changes are logged so user actions can be traced
            this._logger.info({
              connectorId: connectorId,
              resources: resources
            }, "Setting connector permissions");
            _context11.next = 4;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent(connectorId) + "/permissions", {
              method: "POST",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify({
                resources: resources.map(function (_ref6) {
                  var internalId = _ref6.internalId,
                    permission = _ref6.permission;
                  return {
                    internal_id: internalId,
                    permission: permission
                  };
                })
              })
            });
          case 4:
            res = _context11.sent;
            return _context11.abrupt("return", this._resultFromResponse(res));
          case 6:
          case "end":
            return _context11.stop();
        }
      }, _callee11, this);
    }));
    function setConnectorPermissions(_x12) {
      return _setConnectorPermissions.apply(this, arguments);
    }
    return setConnectorPermissions;
  }();
  _proto.getConnector = /*#__PURE__*/function () {
    var _getConnector = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee12(connectorId) {
      var parsedId, err, res;
      return _regeneratorRuntime().wrap(function _callee12$(_context12) {
        while (1) switch (_context12.prev = _context12.next) {
          case 0:
            parsedId = parseInt(connectorId, 10);
            if (!isNaN(parsedId)) {
              _context12.next = 4;
              break;
            }
            err = {
              type: "invalid_request_error",
              message: "Invalid connector ID"
            };
            return _context12.abrupt("return", new Err(err));
          case 4:
            _context12.next = 6;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent(connectorId), {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 6:
            res = _context12.sent;
            return _context12.abrupt("return", this._resultFromResponse(res));
          case 8:
          case "end":
            return _context12.stop();
        }
      }, _callee12, this);
    }));
    function getConnector(_x13) {
      return _getConnector.apply(this, arguments);
    }
    return getConnector;
  }() // TODO(jules): remove after debugging
  ;
  _proto.getConnectorFromDataSource =
  /*#__PURE__*/
  function () {
    var _getConnectorFromDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee13(dataSource) {
      var _dataSource$connector;
      var res;
      return _regeneratorRuntime().wrap(function _callee13$(_context13) {
        while (1) switch (_context13.prev = _context13.next) {
          case 0:
            _context13.next = 2;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent((_dataSource$connector = dataSource.connectorId) != null ? _dataSource$connector : "") + "?origin=" + dataSource.id, {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context13.sent;
            return _context13.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context13.stop();
        }
      }, _callee13, this);
    }));
    function getConnectorFromDataSource(_x14) {
      return _getConnectorFromDataSource.apply(this, arguments);
    }
    return getConnectorFromDataSource;
  }();
  _proto.getConnectors = /*#__PURE__*/function () {
    var _getConnectors = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee14(provider, connectorIds) {
      var res;
      return _regeneratorRuntime().wrap(function _callee14$(_context14) {
        while (1) switch (_context14.prev = _context14.next) {
          case 0:
            if (!(connectorIds.length === 0)) {
              _context14.next = 2;
              break;
            }
            return _context14.abrupt("return", new Ok([]));
          case 2:
            _context14.next = 4;
            return this._fetchWithError(this._url + "/connectors?provider=" + encodeURIComponent(provider) + "&" + connectorIds.map(function (id) {
              return "connector_id=" + encodeURIComponent(id);
            }).join("&"), {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 4:
            res = _context14.sent;
            return _context14.abrupt("return", this._resultFromResponse(res));
          case 6:
          case "end":
            return _context14.stop();
        }
      }, _callee14, this);
    }));
    function getConnectors(_x15, _x16) {
      return _getConnectors.apply(this, arguments);
    }
    return getConnectors;
  }();
  _proto.setConnectorConfig = /*#__PURE__*/function () {
    var _setConnectorConfig = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee15(connectorId, configKey, configValue) {
      var res;
      return _regeneratorRuntime().wrap(function _callee15$(_context15) {
        while (1) switch (_context15.prev = _context15.next) {
          case 0:
            _context15.next = 2;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent(connectorId) + "/config/" + encodeURIComponent(configKey), {
              method: "POST",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify({
                configValue: configValue
              })
            });
          case 2:
            res = _context15.sent;
            return _context15.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context15.stop();
        }
      }, _callee15, this);
    }));
    function setConnectorConfig(_x17, _x18, _x19) {
      return _setConnectorConfig.apply(this, arguments);
    }
    return setConnectorConfig;
  }();
  _proto.getConnectorConfig = /*#__PURE__*/function () {
    var _getConnectorConfig = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee16(connectorId, configKey) {
      var res;
      return _regeneratorRuntime().wrap(function _callee16$(_context16) {
        while (1) switch (_context16.prev = _context16.next) {
          case 0:
            _context16.next = 2;
            return this._fetchWithError(this._url + "/connectors/" + encodeURIComponent(connectorId) + "/config/" + encodeURIComponent(configKey), {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 2:
            res = _context16.sent;
            return _context16.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context16.stop();
        }
      }, _callee16, this);
    }));
    function getConnectorConfig(_x20, _x21) {
      return _getConnectorConfig.apply(this, arguments);
    }
    return getConnectorConfig;
  }();
  _proto.linkSlackChannelsWithAgent = /*#__PURE__*/function () {
    var _linkSlackChannelsWithAgent = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee17(_ref7) {
      var connectorId, slackChannelInternalIds, agentConfigurationId, res;
      return _regeneratorRuntime().wrap(function _callee17$(_context17) {
        while (1) switch (_context17.prev = _context17.next) {
          case 0:
            connectorId = _ref7.connectorId, slackChannelInternalIds = _ref7.slackChannelInternalIds, agentConfigurationId = _ref7.agentConfigurationId;
            _context17.next = 3;
            return this._fetchWithError(this._url + "/slack/channels/linked_with_agent", {
              method: "PATCH",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify({
                connector_id: connectorId,
                agent_configuration_id: agentConfigurationId,
                slack_channel_internal_ids: slackChannelInternalIds
              })
            });
          case 3:
            res = _context17.sent;
            return _context17.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context17.stop();
        }
      }, _callee17, this);
    }));
    function linkSlackChannelsWithAgent(_x22) {
      return _linkSlackChannelsWithAgent.apply(this, arguments);
    }
    return linkSlackChannelsWithAgent;
  }();
  _proto.getSlackChannelsLinkedWithAgent = /*#__PURE__*/function () {
    var _getSlackChannelsLinkedWithAgent = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee18(_ref8) {
      var connectorId, res;
      return _regeneratorRuntime().wrap(function _callee18$(_context18) {
        while (1) switch (_context18.prev = _context18.next) {
          case 0:
            connectorId = _ref8.connectorId;
            _context18.next = 3;
            return this._fetchWithError(this._url + "/slack/channels/linked_with_agent?connector_id=" + encodeURIComponent(connectorId), {
              method: "GET",
              headers: this.getDefaultHeaders()
            });
          case 3:
            res = _context18.sent;
            return _context18.abrupt("return", this._resultFromResponse(res));
          case 5:
          case "end":
            return _context18.stop();
        }
      }, _callee18, this);
    }));
    function getSlackChannelsLinkedWithAgent(_x23) {
      return _getSlackChannelsLinkedWithAgent.apply(this, arguments);
    }
    return getSlackChannelsLinkedWithAgent;
  }();
  _proto.admin = /*#__PURE__*/function () {
    var _admin = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee19(adminCommand) {
      var res;
      return _regeneratorRuntime().wrap(function _callee19$(_context19) {
        while (1) switch (_context19.prev = _context19.next) {
          case 0:
            _context19.next = 2;
            return this._fetchWithError(this._url + "/connectors/admin", {
              method: "POST",
              headers: this.getDefaultHeaders(),
              body: JSON.stringify(adminCommand)
            });
          case 2:
            res = _context19.sent;
            return _context19.abrupt("return", this._resultFromResponse(res));
          case 4:
          case "end":
            return _context19.stop();
        }
      }, _callee19, this);
    }));
    function admin(_x24) {
      return _admin.apply(this, arguments);
    }
    return admin;
  }();
  _proto.getDefaultHeaders = function getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + this._secret
    };
  };
  _proto._fetchWithError = /*#__PURE__*/function () {
    var _fetchWithError2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee20(url, init) {
      var now, res, duration, err;
      return _regeneratorRuntime().wrap(function _callee20$(_context20) {
        while (1) switch (_context20.prev = _context20.next) {
          case 0:
            now = Date.now();
            _context20.prev = 1;
            _context20.next = 4;
            return fetch(url, init);
          case 4:
            res = _context20.sent;
            return _context20.abrupt("return", new Ok({
              response: res,
              duration: Date.now() - now
            }));
          case 8:
            _context20.prev = 8;
            _context20.t0 = _context20["catch"](1);
            duration = Date.now() - now;
            err = {
              type: "unexpected_network_error",
              message: "Unexpected network error from ConnectorsAPI: " + _context20.t0
            };
            this._logger.error({
              url: url,
              duration: duration,
              connectorsError: err,
              error: _context20.t0
            }, "ConnectorsAPI error");
            return _context20.abrupt("return", new Err(err));
          case 14:
          case "end":
            return _context20.stop();
        }
      }, _callee20, this, [[1, 8]]);
    }));
    function _fetchWithError(_x25, _x26) {
      return _fetchWithError2.apply(this, arguments);
    }
    return _fetchWithError;
  }();
  _proto._resultFromResponse = /*#__PURE__*/function () {
    var _resultFromResponse2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee21(res) {
      var text, json, err, _json, _err, _err2;
      return _regeneratorRuntime().wrap(function _callee21$(_context21) {
        while (1) switch (_context21.prev = _context21.next) {
          case 0:
            if (!res.isErr()) {
              _context21.next = 2;
              break;
            }
            return _context21.abrupt("return", res);
          case 2:
            if (!(res.value.response.status === 204)) {
              _context21.next = 4;
              break;
            }
            return _context21.abrupt("return", new Ok(undefined));
          case 4:
            _context21.next = 6;
            return res.value.response.text();
          case 6:
            text = _context21.sent;
            json = null;
            _context21.prev = 8;
            json = JSON.parse(text);
            _context21.next = 17;
            break;
          case 12:
            _context21.prev = 12;
            _context21.t0 = _context21["catch"](8);
            err = {
              type: "unexpected_response_format",
              message: "Unexpected response format from ConnectorsAPI: " + _context21.t0
            };
            this._logger.error({
              connectorsError: err,
              parseError: _context21.t0,
              rawText: text,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "ConnectorsAPI error");
            return _context21.abrupt("return", new Err(err));
          case 17:
            if (res.value.response.ok) {
              _context21.next = 29;
              break;
            }
            _err = (_json = json) == null ? void 0 : _json.error;
            if (!isConnectorsAPIError(_err)) {
              _context21.next = 24;
              break;
            }
            this._logger.error({
              connectorsError: _err,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "ConnectorsAPI error");
            return _context21.abrupt("return", new Err(_err));
          case 24:
            _err2 = {
              type: "unexpected_error_format",
              message: "Unexpected error format from ConnectorAPI"
            };
            this._logger.error({
              connectorsError: _err2,
              json: json,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "ConnectorsAPI error");
            return _context21.abrupt("return", new Err(_err2));
          case 27:
            _context21.next = 30;
            break;
          case 29:
            return _context21.abrupt("return", new Ok(json));
          case 30:
          case "end":
            return _context21.stop();
        }
      }, _callee21, this, [[8, 12]]);
    }));
    function _resultFromResponse(_x27) {
      return _resultFromResponse2.apply(this, arguments);
    }
    return _resultFromResponse;
  }();
  return ConnectorsAPI;
}();

var MAX_CHUNK_SIZE = 512;
var EMBEDDING_CONFIGS = {
  openai: {
    model_id: "text-embedding-3-large-1536",
    provider_id: "openai",
    splitter_id: "base_v0",
    max_chunk_size: MAX_CHUNK_SIZE
  },
  mistral: {
    model_id: "mistral-embed",
    provider_id: "mistral",
    splitter_id: "base_v0",
    max_chunk_size: MAX_CHUNK_SIZE
  }
};
function isCoreAPIError(obj) {
  return typeof obj === "object" && obj !== null && "message" in obj && typeof obj.message === "string" && "code" in obj && typeof obj.code === "string";
}
function isRowMatchingSchema(row, schema) {
  var _loop = function _loop() {
      var _Object$entries$_i = _Object$entries[_i],
        k = _Object$entries$_i[0],
        v = _Object$entries$_i[1];
      if (v === null) {
        return 0; // continue
      }
      if (typeof v === "string" && v.trim().length === 0) {
        return 0; // continue
      }
      var schemaEntry = schema.find(function (s) {
        return s.name === k;
      });
      if (!schemaEntry) {
        return {
          v: false
        };
      }
      if (schemaEntry.value_type === "int" && typeof v !== "number") {
        return {
          v: false
        };
      } else if (schemaEntry.value_type === "float" && typeof v !== "number") {
        return {
          v: false
        };
      } else if (schemaEntry.value_type === "text" && typeof v !== "string") {
        return {
          v: false
        };
      } else if (schemaEntry.value_type === "bool" && typeof v !== "boolean") {
        return {
          v: false
        };
      } else if (schemaEntry.value_type === "datetime" && (typeof v !== "object" || !v || typeof v.epoch !== "number" || v.string_value && typeof v.string_value !== "string")) {
        return {
          v: false
        };
      }
    },
    _ret;
  for (var _i = 0, _Object$entries = Object.entries(row.value); _i < _Object$entries.length; _i++) {
    _ret = _loop();
    if (_ret === 0) continue;
    if (_ret) return _ret.v;
  }
  return true;
}
var CoreAPISearchScopeSchema = /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.literal("nodes_titles"), /*#__PURE__*/t__namespace.literal("data_source_name"), /*#__PURE__*/t__namespace.literal("both")]);
var CoreAPIDatasourceViewFilterSchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  data_source_id: t__namespace.string,
  view_filter: /*#__PURE__*/t__namespace.array(t__namespace.string)
}), /*#__PURE__*/t__namespace.partial({
  search_scope: CoreAPISearchScopeSchema
})]);
// Edge-ngram starts at 2 characters.
var MIN_SEARCH_QUERY_SIZE = 2;
var CoreAPINodesSearchFilterSchema = /*#__PURE__*/t__namespace.intersection([/*#__PURE__*/t__namespace.type({
  data_source_views: /*#__PURE__*/t__namespace.array(CoreAPIDatasourceViewFilterSchema)
}), /*#__PURE__*/t__namespace.partial({
  excluded_node_mime_types: /*#__PURE__*/t__namespace.union([/*#__PURE__*/t__namespace.readonlyArray(t__namespace.string), t__namespace.undefined]),
  node_ids: /*#__PURE__*/t__namespace.array(t__namespace.string),
  node_types: /*#__PURE__*/t__namespace.array(t__namespace.string),
  parent_id: t__namespace.string,
  query: t__namespace.string
})]);
// TODO(keyword-search): Until we remove the `managed-` prefix, we need to
// sanitize the search name.
function formatDataSourceDisplayName(name) {
  return name.replace(/[-_]/g, " ") // Replace both hyphens and underscores with spaces.
  .split(" ").filter(function (part) {
    return part !== "managed";
  }).map(function (word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}
var CoreAPI = /*#__PURE__*/function () {
  function CoreAPI(config, logger) {
    this._url = void 0;
    this._apiKey = void 0;
    this._url = config.url;
    this._logger = logger;
    this._apiKey = config.apiKey;
  }
  var _proto = CoreAPI.prototype;
  _proto.createProject = /*#__PURE__*/function () {
    var _createProject = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
      var response;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return this._fetchWithError(this._url + "/projects", {
              method: "POST"
            });
          case 2:
            response = _context.sent;
            return _context.abrupt("return", this._resultFromResponse(response));
          case 4:
          case "end":
            return _context.stop();
        }
      }, _callee, this);
    }));
    function createProject() {
      return _createProject.apply(this, arguments);
    }
    return createProject;
  }();
  _proto.deleteProject = /*#__PURE__*/function () {
    var _deleteProject = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_ref2) {
      var projectId, response;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            projectId = _ref2.projectId;
            _context2.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId), {
              method: "DELETE"
            });
          case 3:
            response = _context2.sent;
            return _context2.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context2.stop();
        }
      }, _callee2, this);
    }));
    function deleteProject(_x) {
      return _deleteProject.apply(this, arguments);
    }
    return deleteProject;
  }();
  _proto.getDatasets = /*#__PURE__*/function () {
    var _getDatasets = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
      var projectId, response;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            projectId = _ref3.projectId;
            _context3.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/datasets", {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context3.sent;
            return _context3.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context3.stop();
        }
      }, _callee3, this);
    }));
    function getDatasets(_x2) {
      return _getDatasets.apply(this, arguments);
    }
    return getDatasets;
  }();
  _proto.getDataset = /*#__PURE__*/function () {
    var _getDataset = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(_ref4) {
      var projectId, datasetName, datasetHash, response;
      return _regeneratorRuntime().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            projectId = _ref4.projectId, datasetName = _ref4.datasetName, datasetHash = _ref4.datasetHash;
            _context4.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/datasets/" + encodeURIComponent(datasetName) + "/" + encodeURIComponent(datasetHash), {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context4.sent;
            return _context4.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context4.stop();
        }
      }, _callee4, this);
    }));
    function getDataset(_x3) {
      return _getDataset.apply(this, arguments);
    }
    return getDataset;
  }();
  _proto.createDataset = /*#__PURE__*/function () {
    var _createDataset = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(_ref5) {
      var projectId, datasetId, data, response;
      return _regeneratorRuntime().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            projectId = _ref5.projectId, datasetId = _ref5.datasetId, data = _ref5.data;
            _context5.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/datasets", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                dataset_id: datasetId,
                data: data
              })
            });
          case 3:
            response = _context5.sent;
            return _context5.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context5.stop();
        }
      }, _callee5, this);
    }));
    function createDataset(_x4) {
      return _createDataset.apply(this, arguments);
    }
    return createDataset;
  }();
  _proto.cloneProject = /*#__PURE__*/function () {
    var _cloneProject = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(_ref6) {
      var projectId, response;
      return _regeneratorRuntime().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            projectId = _ref6.projectId;
            _context6.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/clone", {
              method: "POST"
            });
          case 3:
            response = _context6.sent;
            return _context6.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context6.stop();
        }
      }, _callee6, this);
    }));
    function cloneProject(_x5) {
      return _cloneProject.apply(this, arguments);
    }
    return cloneProject;
  }();
  _proto.createRun = /*#__PURE__*/function () {
    var _createRun = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(workspace, groups, _ref7) {
      var projectId, runType, specification, specificationHash, datasetId, inputs, config, credentials, secrets, isSystemKey, _ref7$storeBlocksResu, storeBlocksResults, response;
      return _regeneratorRuntime().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            projectId = _ref7.projectId, runType = _ref7.runType, specification = _ref7.specification, specificationHash = _ref7.specificationHash, datasetId = _ref7.datasetId, inputs = _ref7.inputs, config = _ref7.config, credentials = _ref7.credentials, secrets = _ref7.secrets, isSystemKey = _ref7.isSystemKey, _ref7$storeBlocksResu = _ref7.storeBlocksResults, storeBlocksResults = _ref7$storeBlocksResu === void 0 ? true : _ref7$storeBlocksResu;
            _context7.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Dust-Workspace-Id": workspace.sId,
                "X-Dust-Group-Ids": groups.map(function (g) {
                  return g.sId;
                }).join(","),
                "X-Dust-IsSystemRun": isSystemKey ? "true" : "false"
              },
              body: JSON.stringify({
                run_type: runType,
                specification: specification,
                specification_hash: specificationHash,
                dataset_id: datasetId,
                inputs: inputs,
                config: config,
                credentials: credentials,
                secrets: secrets,
                store_blocks_results: storeBlocksResults
              })
            });
          case 3:
            response = _context7.sent;
            return _context7.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context7.stop();
        }
      }, _callee7, this);
    }));
    function createRun(_x6, _x7, _x8) {
      return _createRun.apply(this, arguments);
    }
    return createRun;
  }();
  _proto.createRunStream = /*#__PURE__*/function () {
    var _createRunStream = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(workspace, groups, _ref8) {
      var _this = this;
      var projectId, runType, specification, specificationHash, datasetId, inputs, config, credentials, secrets, isSystemKey, _ref8$storeBlocksResu, storeBlocksResults, res, response, hasRunId, rejectDustRunIdPromise, resolveDustRunIdPromise, dustRunIdPromise, parser, reader, logger, streamChunks;
      return _regeneratorRuntime().wrap(function _callee9$(_context9) {
        while (1) switch (_context9.prev = _context9.next) {
          case 0:
            projectId = _ref8.projectId, runType = _ref8.runType, specification = _ref8.specification, specificationHash = _ref8.specificationHash, datasetId = _ref8.datasetId, inputs = _ref8.inputs, config = _ref8.config, credentials = _ref8.credentials, secrets = _ref8.secrets, isSystemKey = _ref8.isSystemKey, _ref8$storeBlocksResu = _ref8.storeBlocksResults, storeBlocksResults = _ref8$storeBlocksResu === void 0 ? true : _ref8$storeBlocksResu;
            _context9.next = 3;
            return this._fetchWithError(this._url + "/projects/" + projectId + "/runs/stream", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Dust-Workspace-Id": workspace.sId,
                "X-Dust-Group-Ids": groups.map(function (g) {
                  return g.sId;
                }).join(","),
                "X-Dust-IsSystemRun": isSystemKey ? "true" : "false"
              },
              body: JSON.stringify({
                run_type: runType,
                specification: specification,
                specification_hash: specificationHash,
                dataset_id: datasetId,
                inputs: inputs,
                config: config,
                credentials: credentials,
                secrets: secrets,
                store_blocks_results: storeBlocksResults
              })
            });
          case 3:
            res = _context9.sent;
            if (!res.isErr()) {
              _context9.next = 6;
              break;
            }
            return _context9.abrupt("return", res);
          case 6:
            response = res.value.response;
            if (!(!response.ok || !response.body)) {
              _context9.next = 9;
              break;
            }
            return _context9.abrupt("return", this._resultFromResponse(res));
          case 9:
            hasRunId = false;
            dustRunIdPromise = new Promise(function (resolve, reject) {
              rejectDustRunIdPromise = reject;
              resolveDustRunIdPromise = resolve;
            });
            parser = eventsourceParser.createParser(function (event) {
              if (event.type === "event") {
                if (event.data) {
                  try {
                    var _data$content;
                    var data = JSON.parse(event.data);
                    if ((_data$content = data.content) != null && _data$content.run_id && !hasRunId) {
                      hasRunId = true;
                      resolveDustRunIdPromise(data.content.run_id);
                    }
                  } catch (err) {
                    _this._logger.error({
                      error: err
                    }, "Failed parsing chunk from Core API");
                  }
                }
              }
            });
            reader = response.body.getReader();
            logger = this._logger;
            streamChunks = /*#__PURE__*/function () {
              var _ref = _wrapAsyncGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8() {
                var _yield$_awaitAsyncGen, done, value;
                return _regeneratorRuntime().wrap(function _callee8$(_context8) {
                  while (1) switch (_context8.prev = _context8.next) {
                    case 0:
                      _context8.prev = 0;
                    case 1:
                      _context8.next = 4;
                      return _awaitAsyncGenerator(reader.read());
                    case 4:
                      _yield$_awaitAsyncGen = _context8.sent;
                      done = _yield$_awaitAsyncGen.done;
                      value = _yield$_awaitAsyncGen.value;
                      if (!done) {
                        _context8.next = 9;
                        break;
                      }
                      return _context8.abrupt("break", 14);
                    case 9:
                      parser.feed(new TextDecoder().decode(value));
                      _context8.next = 12;
                      return value;
                    case 12:
                      _context8.next = 1;
                      break;
                    case 14:
                      _context8.next = 19;
                      break;
                    case 16:
                      _context8.prev = 16;
                      _context8.t0 = _context8["catch"](0);
                      logger.error({
                        error: _context8.t0,
                        errorStr: JSON.stringify(_context8.t0),
                        errorSource: "createRunStream"
                      }, "Error streaming chunks");
                    case 19:
                      _context8.prev = 19;
                      if (!hasRunId) {
                        // once the stream is entirely consumed, if we haven't received a run id, reject the promise
                        setImmediate(function () {
                          logger.error({
                            projectId: projectId,
                            runType: runType,
                            specificationHash: specificationHash
                          }, "No run id received");
                          rejectDustRunIdPromise(new Error("No run id received"));
                        });
                      }
                      reader.releaseLock();
                      return _context8.finish(19);
                    case 23:
                    case "end":
                      return _context8.stop();
                  }
                }, _callee8, null, [[0, 16, 19, 23]]);
              }));
              return function streamChunks() {
                return _ref.apply(this, arguments);
              };
            }();
            return _context9.abrupt("return", new Ok({
              chunkStream: streamChunks(),
              dustRunId: dustRunIdPromise
            }));
          case 16:
          case "end":
            return _context9.stop();
        }
      }, _callee9, this);
    }));
    function createRunStream(_x9, _x10, _x11) {
      return _createRunStream.apply(this, arguments);
    }
    return createRunStream;
  }();
  _proto.deleteRun = /*#__PURE__*/function () {
    var _deleteRun = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10(_ref9) {
      var projectId, runId, response;
      return _regeneratorRuntime().wrap(function _callee10$(_context10) {
        while (1) switch (_context10.prev = _context10.next) {
          case 0:
            projectId = _ref9.projectId, runId = _ref9.runId;
            _context10.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs/" + encodeURIComponent(runId), {
              method: "DELETE"
            });
          case 3:
            response = _context10.sent;
            return _context10.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context10.stop();
        }
      }, _callee10, this);
    }));
    function deleteRun(_x12) {
      return _deleteRun.apply(this, arguments);
    }
    return deleteRun;
  }();
  _proto.getRunsBatch = /*#__PURE__*/function () {
    var _getRunsBatch = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee11(_ref10) {
      var projectId, dustRunIds, response;
      return _regeneratorRuntime().wrap(function _callee11$(_context11) {
        while (1) switch (_context11.prev = _context11.next) {
          case 0:
            projectId = _ref10.projectId, dustRunIds = _ref10.dustRunIds;
            _context11.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs/batch", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                run_ids: dustRunIds
              })
            });
          case 3:
            response = _context11.sent;
            return _context11.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context11.stop();
        }
      }, _callee11, this);
    }));
    function getRunsBatch(_x13) {
      return _getRunsBatch.apply(this, arguments);
    }
    return getRunsBatch;
  }();
  _proto.getRun = /*#__PURE__*/function () {
    var _getRun = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee12(_ref11) {
      var projectId, runId, response;
      return _regeneratorRuntime().wrap(function _callee12$(_context12) {
        while (1) switch (_context12.prev = _context12.next) {
          case 0:
            projectId = _ref11.projectId, runId = _ref11.runId;
            _context12.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs/" + encodeURIComponent(runId), {
              method: "GET"
            });
          case 3:
            response = _context12.sent;
            return _context12.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context12.stop();
        }
      }, _callee12, this);
    }));
    function getRun(_x14) {
      return _getRun.apply(this, arguments);
    }
    return getRun;
  }();
  _proto.getRunStatus = /*#__PURE__*/function () {
    var _getRunStatus = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee13(_ref12) {
      var projectId, runId, response;
      return _regeneratorRuntime().wrap(function _callee13$(_context13) {
        while (1) switch (_context13.prev = _context13.next) {
          case 0:
            projectId = _ref12.projectId, runId = _ref12.runId;
            _context13.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs/" + encodeURIComponent(runId) + "/status", {
              method: "GET"
            });
          case 3:
            response = _context13.sent;
            return _context13.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context13.stop();
        }
      }, _callee13, this);
    }));
    function getRunStatus(_x15) {
      return _getRunStatus.apply(this, arguments);
    }
    return getRunStatus;
  }();
  _proto.getSpecificationHashes = /*#__PURE__*/function () {
    var _getSpecificationHashes = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee14(_ref13) {
      var projectId, response;
      return _regeneratorRuntime().wrap(function _callee14$(_context14) {
        while (1) switch (_context14.prev = _context14.next) {
          case 0:
            projectId = _ref13.projectId;
            _context14.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/specifications", {
              method: "GET"
            });
          case 3:
            response = _context14.sent;
            return _context14.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context14.stop();
        }
      }, _callee14, this);
    }));
    function getSpecificationHashes(_x16) {
      return _getSpecificationHashes.apply(this, arguments);
    }
    return getSpecificationHashes;
  }();
  _proto.getSpecification = /*#__PURE__*/function () {
    var _getSpecification = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee15(_ref14) {
      var projectId, specificationHash, response;
      return _regeneratorRuntime().wrap(function _callee15$(_context15) {
        while (1) switch (_context15.prev = _context15.next) {
          case 0:
            projectId = _ref14.projectId, specificationHash = _ref14.specificationHash;
            _context15.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/specifications/" + encodeURIComponent(specificationHash), {
              method: "GET"
            });
          case 3:
            response = _context15.sent;
            return _context15.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context15.stop();
        }
      }, _callee15, this);
    }));
    function getSpecification(_x17) {
      return _getSpecification.apply(this, arguments);
    }
    return getSpecification;
  }();
  _proto.saveSpecification = /*#__PURE__*/function () {
    var _saveSpecification = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee16(_ref15) {
      var projectId, specification, response;
      return _regeneratorRuntime().wrap(function _callee16$(_context16) {
        while (1) switch (_context16.prev = _context16.next) {
          case 0:
            projectId = _ref15.projectId, specification = _ref15.specification;
            _context16.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/specifications", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                specification: specification
              })
            });
          case 3:
            response = _context16.sent;
            return _context16.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context16.stop();
        }
      }, _callee16, this);
    }));
    function saveSpecification(_x18) {
      return _saveSpecification.apply(this, arguments);
    }
    return saveSpecification;
  }();
  _proto.getRunBlock = /*#__PURE__*/function () {
    var _getRunBlock = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee17(_ref16) {
      var projectId, runId, blockType, blockName, response;
      return _regeneratorRuntime().wrap(function _callee17$(_context17) {
        while (1) switch (_context17.prev = _context17.next) {
          case 0:
            projectId = _ref16.projectId, runId = _ref16.runId, blockType = _ref16.blockType, blockName = _ref16.blockName;
            _context17.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/runs/" + encodeURIComponent(runId) + "/blocks/" + encodeURIComponent(blockType) + "/" + encodeURIComponent(blockName), {
              method: "GET"
            });
          case 3:
            response = _context17.sent;
            return _context17.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context17.stop();
        }
      }, _callee17, this);
    }));
    function getRunBlock(_x19) {
      return _getRunBlock.apply(this, arguments);
    }
    return getRunBlock;
  }();
  _proto.createDataSource = /*#__PURE__*/function () {
    var _createDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee18(_ref17) {
      var projectId, config, credentials, name, response;
      return _regeneratorRuntime().wrap(function _callee18$(_context18) {
        while (1) switch (_context18.prev = _context18.next) {
          case 0:
            projectId = _ref17.projectId, config = _ref17.config, credentials = _ref17.credentials, name = _ref17.name;
            _context18.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                config: config,
                credentials: credentials,
                name: formatDataSourceDisplayName(name)
              })
            });
          case 3:
            response = _context18.sent;
            return _context18.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context18.stop();
        }
      }, _callee18, this);
    }));
    function createDataSource(_x20) {
      return _createDataSource.apply(this, arguments);
    }
    return createDataSource;
  }();
  _proto.updateDataSource = /*#__PURE__*/function () {
    var _updateDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee19(_ref18) {
      var projectId, dataSourceId, name, response;
      return _regeneratorRuntime().wrap(function _callee19$(_context19) {
        while (1) switch (_context19.prev = _context19.next) {
          case 0:
            projectId = _ref18.projectId, dataSourceId = _ref18.dataSourceId, name = _ref18.name;
            _context19.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId), {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                name: formatDataSourceDisplayName(name)
              })
            });
          case 3:
            response = _context19.sent;
            return _context19.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context19.stop();
        }
      }, _callee19, this);
    }));
    function updateDataSource(_x21) {
      return _updateDataSource.apply(this, arguments);
    }
    return updateDataSource;
  }();
  _proto.getDataSource = /*#__PURE__*/function () {
    var _getDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee20(_ref19) {
      var projectId, dataSourceId, response;
      return _regeneratorRuntime().wrap(function _callee20$(_context20) {
        while (1) switch (_context20.prev = _context20.next) {
          case 0:
            projectId = _ref19.projectId, dataSourceId = _ref19.dataSourceId;
            _context20.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId), {
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context20.sent;
            return _context20.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context20.stop();
        }
      }, _callee20, this);
    }));
    function getDataSource(_x22) {
      return _getDataSource.apply(this, arguments);
    }
    return getDataSource;
  }();
  _proto.deleteDataSource = /*#__PURE__*/function () {
    var _deleteDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee21(_ref20) {
      var projectId, dataSourceId, response;
      return _regeneratorRuntime().wrap(function _callee21$(_context21) {
        while (1) switch (_context21.prev = _context21.next) {
          case 0:
            projectId = _ref20.projectId, dataSourceId = _ref20.dataSourceId;
            _context21.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId), {
              method: "DELETE"
            });
          case 3:
            response = _context21.sent;
            return _context21.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context21.stop();
        }
      }, _callee21, this);
    }));
    function deleteDataSource(_x23) {
      return _deleteDataSource.apply(this, arguments);
    }
    return deleteDataSource;
  }();
  _proto.searchDataSource = /*#__PURE__*/function () {
    var _searchDataSource = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee22(projectId, dataSourceId, payload) {
      var response;
      return _regeneratorRuntime().wrap(function _callee22$(_context22) {
        while (1) switch (_context22.prev = _context22.next) {
          case 0:
            _context22.next = 2;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                query: payload.query,
                top_k: payload.topK,
                filter: payload.filter,
                view_filter: payload.view_filter,
                full_text: payload.fullText,
                credentials: payload.credentials,
                target_document_tokens: payload.target_document_tokens
              })
            });
          case 2:
            response = _context22.sent;
            return _context22.abrupt("return", this._resultFromResponse(response));
          case 4:
          case "end":
            return _context22.stop();
        }
      }, _callee22, this);
    }));
    function searchDataSource(_x24, _x25, _x26) {
      return _searchDataSource.apply(this, arguments);
    }
    return searchDataSource;
  }();
  _proto.getDataSourceDocuments = /*#__PURE__*/function () {
    var _getDataSourceDocuments = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee23(_ref21, pagination) {
      var dataSourceId, documentIds, projectId, viewFilter, queryParams, response;
      return _regeneratorRuntime().wrap(function _callee23$(_context23) {
        while (1) switch (_context23.prev = _context23.next) {
          case 0:
            dataSourceId = _ref21.dataSourceId, documentIds = _ref21.documentIds, projectId = _ref21.projectId, viewFilter = _ref21.viewFilter;
            queryParams = new URLSearchParams();
            if (pagination) {
              queryParams.append("limit", String(pagination.limit));
              queryParams.append("offset", String(pagination.offset));
            }
            if (viewFilter) {
              queryParams.append("view_filter", JSON.stringify(viewFilter));
            }
            if (documentIds && documentIds.length > 0) {
              queryParams.append("document_ids", JSON.stringify(documentIds));
            }
            _context23.next = 7;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents?" + queryParams.toString(), {
              method: "GET"
            });
          case 7:
            response = _context23.sent;
            return _context23.abrupt("return", this._resultFromResponse(response));
          case 9:
          case "end":
            return _context23.stop();
        }
      }, _callee23, this);
    }));
    function getDataSourceDocuments(_x27, _x28) {
      return _getDataSourceDocuments.apply(this, arguments);
    }
    return getDataSourceDocuments;
  }();
  _proto.getDataSourceDocument = /*#__PURE__*/function () {
    var _getDataSourceDocument = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee24(_ref22) {
      var dataSourceId, documentId, projectId, versionHash, viewFilter, queryParams, qs, response;
      return _regeneratorRuntime().wrap(function _callee24$(_context24) {
        while (1) switch (_context24.prev = _context24.next) {
          case 0:
            dataSourceId = _ref22.dataSourceId, documentId = _ref22.documentId, projectId = _ref22.projectId, versionHash = _ref22.versionHash, viewFilter = _ref22.viewFilter;
            queryParams = new URLSearchParams();
            if (versionHash) {
              queryParams.append("version_hash", versionHash);
            }
            if (viewFilter) {
              queryParams.append("view_filter", JSON.stringify(viewFilter));
            }
            qs = queryParams.toString();
            _context24.next = 7;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + (qs ? "?" + qs : ""), {
              method: "GET"
            });
          case 7:
            response = _context24.sent;
            return _context24.abrupt("return", this._resultFromResponse(response));
          case 9:
          case "end":
            return _context24.stop();
        }
      }, _callee24, this);
    }));
    function getDataSourceDocument(_x29) {
      return _getDataSourceDocument.apply(this, arguments);
    }
    return getDataSourceDocument;
  }();
  _proto.getDataSourceDocumentVersions = /*#__PURE__*/function () {
    var _getDataSourceDocumentVersions = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee25(_ref23) {
      var projectId, dataSourceId, documentId, latest_hash, _ref23$limit, limit, _ref23$offset, offset, params, response;
      return _regeneratorRuntime().wrap(function _callee25$(_context25) {
        while (1) switch (_context25.prev = _context25.next) {
          case 0:
            projectId = _ref23.projectId, dataSourceId = _ref23.dataSourceId, documentId = _ref23.documentId, latest_hash = _ref23.latest_hash, _ref23$limit = _ref23.limit, limit = _ref23$limit === void 0 ? 10 : _ref23$limit, _ref23$offset = _ref23.offset, offset = _ref23$offset === void 0 ? 0 : _ref23$offset;
            params = new URLSearchParams({
              limit: String(limit),
              offset: String(offset)
            });
            if (latest_hash) {
              params.append("latest_hash", latest_hash);
            }
            _context25.next = 5;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + "/versions?" + params.toString(), {
              method: "GET"
            });
          case 5:
            response = _context25.sent;
            return _context25.abrupt("return", this._resultFromResponse(response));
          case 7:
          case "end":
            return _context25.stop();
        }
      }, _callee25, this);
    }));
    function getDataSourceDocumentVersions(_x30) {
      return _getDataSourceDocumentVersions.apply(this, arguments);
    }
    return getDataSourceDocumentVersions;
  }();
  _proto.upsertDataSourceDocument = /*#__PURE__*/function () {
    var _upsertDataSourceDocument = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee26(_ref24) {
      var projectId, dataSourceId, documentId, timestamp, tags, parentId, parents, sourceUrl, section, credentials, _ref24$lightDocumentO, lightDocumentOutput, title, mimeType, response;
      return _regeneratorRuntime().wrap(function _callee26$(_context26) {
        while (1) switch (_context26.prev = _context26.next) {
          case 0:
            projectId = _ref24.projectId, dataSourceId = _ref24.dataSourceId, documentId = _ref24.documentId, timestamp = _ref24.timestamp, tags = _ref24.tags, parentId = _ref24.parentId, parents = _ref24.parents, sourceUrl = _ref24.sourceUrl, section = _ref24.section, credentials = _ref24.credentials, _ref24$lightDocumentO = _ref24.lightDocumentOutput, lightDocumentOutput = _ref24$lightDocumentO === void 0 ? false : _ref24$lightDocumentO, title = _ref24.title, mimeType = _ref24.mimeType;
            _context26.next = 3;
            return this._fetchWithError(this._url + "/projects/" + projectId + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                document_id: documentId,
                timestamp: timestamp,
                section: section,
                tags: tags,
                parent_id: parentId,
                parents: parents,
                source_url: sourceUrl,
                credentials: credentials,
                light_document_output: lightDocumentOutput,
                title: title,
                mime_type: mimeType
              })
            });
          case 3:
            response = _context26.sent;
            return _context26.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context26.stop();
        }
      }, _callee26, this);
    }));
    function upsertDataSourceDocument(_x31) {
      return _upsertDataSourceDocument.apply(this, arguments);
    }
    return upsertDataSourceDocument;
  }();
  _proto.getDataSourceDocumentBlob = /*#__PURE__*/function () {
    var _getDataSourceDocumentBlob = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee27(_ref25) {
      var projectId, dataSourceId, documentId, response;
      return _regeneratorRuntime().wrap(function _callee27$(_context27) {
        while (1) switch (_context27.prev = _context27.next) {
          case 0:
            projectId = _ref25.projectId, dataSourceId = _ref25.dataSourceId, documentId = _ref25.documentId;
            _context27.next = 3;
            return this._fetchWithError(this._url + "/projects/" + projectId + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + "/blob", {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context27.sent;
            return _context27.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context27.stop();
        }
      }, _callee27, this);
    }));
    function getDataSourceDocumentBlob(_x32) {
      return _getDataSourceDocumentBlob.apply(this, arguments);
    }
    return getDataSourceDocumentBlob;
  }();
  _proto.updateDataSourceDocumentTags = /*#__PURE__*/function () {
    var _updateDataSourceDocumentTags = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee28(_ref26) {
      var projectId, dataSourceId, documentId, addTags, removeTags, response;
      return _regeneratorRuntime().wrap(function _callee28$(_context28) {
        while (1) switch (_context28.prev = _context28.next) {
          case 0:
            projectId = _ref26.projectId, dataSourceId = _ref26.dataSourceId, documentId = _ref26.documentId, addTags = _ref26.addTags, removeTags = _ref26.removeTags;
            _context28.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + "/tags", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                add_tags: addTags,
                remove_tags: removeTags
              })
            });
          case 3:
            response = _context28.sent;
            return _context28.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context28.stop();
        }
      }, _callee28, this);
    }));
    function updateDataSourceDocumentTags(_x33) {
      return _updateDataSourceDocumentTags.apply(this, arguments);
    }
    return updateDataSourceDocumentTags;
  }();
  _proto.updateDataSourceDocumentParents = /*#__PURE__*/function () {
    var _updateDataSourceDocumentParents = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee29(_ref27) {
      var projectId, dataSourceId, documentId, parentId, parents, response;
      return _regeneratorRuntime().wrap(function _callee29$(_context29) {
        while (1) switch (_context29.prev = _context29.next) {
          case 0:
            projectId = _ref27.projectId, dataSourceId = _ref27.dataSourceId, documentId = _ref27.documentId, parentId = _ref27.parentId, parents = _ref27.parents;
            _context29.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + "/parents", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                parents: parents,
                parent_id: parentId
              })
            });
          case 3:
            response = _context29.sent;
            return _context29.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context29.stop();
        }
      }, _callee29, this);
    }));
    function updateDataSourceDocumentParents(_x34) {
      return _updateDataSourceDocumentParents.apply(this, arguments);
    }
    return updateDataSourceDocumentParents;
  }();
  _proto.deleteDataSourceDocument = /*#__PURE__*/function () {
    var _deleteDataSourceDocument = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee30(_ref28) {
      var projectId, dataSourceId, documentId, response;
      return _regeneratorRuntime().wrap(function _callee30$(_context30) {
        while (1) switch (_context30.prev = _context30.next) {
          case 0:
            projectId = _ref28.projectId, dataSourceId = _ref28.dataSourceId, documentId = _ref28.documentId;
            _context30.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId), {
              method: "DELETE"
            });
          case 3:
            response = _context30.sent;
            return _context30.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context30.stop();
        }
      }, _callee30, this);
    }));
    function deleteDataSourceDocument(_x35) {
      return _deleteDataSourceDocument.apply(this, arguments);
    }
    return deleteDataSourceDocument;
  }();
  _proto.scrubDataSourceDocumentDeletedVersions = /*#__PURE__*/function () {
    var _scrubDataSourceDocumentDeletedVersions = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee31(_ref29) {
      var projectId, dataSourceId, documentId, response;
      return _regeneratorRuntime().wrap(function _callee31$(_context31) {
        while (1) switch (_context31.prev = _context31.next) {
          case 0:
            projectId = _ref29.projectId, dataSourceId = _ref29.dataSourceId, documentId = _ref29.documentId;
            _context31.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/documents/" + encodeURIComponent(documentId) + "/scrub_deleted_versions", {
              method: "POST"
            });
          case 3:
            response = _context31.sent;
            return _context31.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context31.stop();
        }
      }, _callee31, this);
    }));
    function scrubDataSourceDocumentDeletedVersions(_x36) {
      return _scrubDataSourceDocumentDeletedVersions.apply(this, arguments);
    }
    return scrubDataSourceDocumentDeletedVersions;
  }();
  _proto.tokenize = /*#__PURE__*/function () {
    var _tokenize = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee32(_ref30) {
      var text, modelId, providerId, credentials, response;
      return _regeneratorRuntime().wrap(function _callee32$(_context32) {
        while (1) switch (_context32.prev = _context32.next) {
          case 0:
            text = _ref30.text, modelId = _ref30.modelId, providerId = _ref30.providerId;
            credentials = dustManagedCredentials();
            _context32.next = 4;
            return this._fetchWithError(this._url + "/tokenize", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              keepalive: false,
              body: JSON.stringify({
                text: text,
                model_id: modelId,
                provider_id: providerId,
                credentials: credentials
              })
            });
          case 4:
            response = _context32.sent;
            return _context32.abrupt("return", this._resultFromResponse(response));
          case 6:
          case "end":
            return _context32.stop();
        }
      }, _callee32, this);
    }));
    function tokenize(_x37) {
      return _tokenize.apply(this, arguments);
    }
    return tokenize;
  }();
  _proto.tokenizeBatch = /*#__PURE__*/function () {
    var _tokenizeBatch = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee33(_ref31) {
      var texts, modelId, providerId, credentials, response;
      return _regeneratorRuntime().wrap(function _callee33$(_context33) {
        while (1) switch (_context33.prev = _context33.next) {
          case 0:
            texts = _ref31.texts, modelId = _ref31.modelId, providerId = _ref31.providerId;
            credentials = dustManagedCredentials();
            _context33.next = 4;
            return this._fetchWithError(this._url + "/tokenize/batch", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              keepalive: false,
              body: JSON.stringify({
                texts: texts,
                model_id: modelId,
                provider_id: providerId,
                credentials: credentials
              })
            });
          case 4:
            response = _context33.sent;
            return _context33.abrupt("return", this._resultFromResponse(response));
          case 6:
          case "end":
            return _context33.stop();
        }
      }, _callee33, this);
    }));
    function tokenizeBatch(_x38) {
      return _tokenizeBatch.apply(this, arguments);
    }
    return tokenizeBatch;
  }();
  _proto.dataSourceTokenize = /*#__PURE__*/function () {
    var _dataSourceTokenize = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee34(_ref32) {
      var text, projectId, dataSourceId, response;
      return _regeneratorRuntime().wrap(function _callee34$(_context34) {
        while (1) switch (_context34.prev = _context34.next) {
          case 0:
            text = _ref32.text, projectId = _ref32.projectId, dataSourceId = _ref32.dataSourceId;
            _context34.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tokenize", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                text: text
              })
            });
          case 3:
            response = _context34.sent;
            return _context34.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context34.stop();
        }
      }, _callee34, this);
    }));
    function dataSourceTokenize(_x39) {
      return _dataSourceTokenize.apply(this, arguments);
    }
    return dataSourceTokenize;
  }();
  _proto.tableValidateCSVContent = /*#__PURE__*/function () {
    var _tableValidateCSVContent = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee35(_ref33) {
      var projectId, dataSourceId, bucket, bucketCSVPath, response;
      return _regeneratorRuntime().wrap(function _callee35$(_context35) {
        while (1) switch (_context35.prev = _context35.next) {
          case 0:
            projectId = _ref33.projectId, dataSourceId = _ref33.dataSourceId, bucket = _ref33.bucket, bucketCSVPath = _ref33.bucketCSVPath;
            _context35.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/validate_csv_content", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                bucket: bucket,
                bucket_csv_path: bucketCSVPath
              })
            });
          case 3:
            response = _context35.sent;
            return _context35.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context35.stop();
        }
      }, _callee35, this);
    }));
    function tableValidateCSVContent(_x40) {
      return _tableValidateCSVContent.apply(this, arguments);
    }
    return tableValidateCSVContent;
  }();
  _proto.upsertTable = /*#__PURE__*/function () {
    var _upsertTable = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee36(_ref34) {
      var projectId, dataSourceId, tableId, name, description, timestamp, tags, parentId, parents, remoteDatabaseTableId, remoteDatabaseSecretId, title, mimeType, sourceUrl, response;
      return _regeneratorRuntime().wrap(function _callee36$(_context36) {
        while (1) switch (_context36.prev = _context36.next) {
          case 0:
            projectId = _ref34.projectId, dataSourceId = _ref34.dataSourceId, tableId = _ref34.tableId, name = _ref34.name, description = _ref34.description, timestamp = _ref34.timestamp, tags = _ref34.tags, parentId = _ref34.parentId, parents = _ref34.parents, remoteDatabaseTableId = _ref34.remoteDatabaseTableId, remoteDatabaseSecretId = _ref34.remoteDatabaseSecretId, title = _ref34.title, mimeType = _ref34.mimeType, sourceUrl = _ref34.sourceUrl;
            _context36.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                table_id: tableId,
                name: name,
                description: description,
                timestamp: timestamp,
                tags: tags,
                parent_id: parentId,
                parents: parents,
                remote_database_table_id: remoteDatabaseTableId != null ? remoteDatabaseTableId : null,
                remote_database_secret_id: remoteDatabaseSecretId != null ? remoteDatabaseSecretId : null,
                title: title,
                mime_type: mimeType,
                source_url: sourceUrl
              })
            });
          case 3:
            response = _context36.sent;
            return _context36.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context36.stop();
        }
      }, _callee36, this);
    }));
    function upsertTable(_x41) {
      return _upsertTable.apply(this, arguments);
    }
    return upsertTable;
  }();
  _proto.getTable = /*#__PURE__*/function () {
    var _getTable = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee37(_ref35) {
      var projectId, dataSourceId, tableId, viewFilter, queryParams, response;
      return _regeneratorRuntime().wrap(function _callee37$(_context37) {
        while (1) switch (_context37.prev = _context37.next) {
          case 0:
            projectId = _ref35.projectId, dataSourceId = _ref35.dataSourceId, tableId = _ref35.tableId, viewFilter = _ref35.viewFilter;
            queryParams = new URLSearchParams();
            if (viewFilter) {
              queryParams.append("view_filter", JSON.stringify(viewFilter));
            }
            _context37.next = 5;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "?" + queryParams.toString(), {
              method: "GET"
            });
          case 5:
            response = _context37.sent;
            return _context37.abrupt("return", this._resultFromResponse(response));
          case 7:
          case "end":
            return _context37.stop();
        }
      }, _callee37, this);
    }));
    function getTable(_x42) {
      return _getTable.apply(this, arguments);
    }
    return getTable;
  }();
  _proto.getTables = /*#__PURE__*/function () {
    var _getTables = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee38(_ref36, pagination) {
      var dataSourceId, projectId, tableIds, viewFilter, queryParams, response;
      return _regeneratorRuntime().wrap(function _callee38$(_context38) {
        while (1) switch (_context38.prev = _context38.next) {
          case 0:
            dataSourceId = _ref36.dataSourceId, projectId = _ref36.projectId, tableIds = _ref36.tableIds, viewFilter = _ref36.viewFilter;
            queryParams = new URLSearchParams();
            if (viewFilter) {
              queryParams.append("view_filter", JSON.stringify(viewFilter));
            }
            if (tableIds && tableIds.length > 0) {
              queryParams.append("table_ids", JSON.stringify(tableIds));
            }
            if (pagination) {
              queryParams.append("limit", String(pagination.limit));
              queryParams.append("offset", String(pagination.offset));
            }
            _context38.next = 7;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables?" + queryParams.toString(), {
              method: "GET"
            });
          case 7:
            response = _context38.sent;
            return _context38.abrupt("return", this._resultFromResponse(response));
          case 9:
          case "end":
            return _context38.stop();
        }
      }, _callee38, this);
    }));
    function getTables(_x43, _x44) {
      return _getTables.apply(this, arguments);
    }
    return getTables;
  }();
  _proto.deleteTable = /*#__PURE__*/function () {
    var _deleteTable = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee39(_ref37) {
      var projectId, dataSourceId, tableId, response;
      return _regeneratorRuntime().wrap(function _callee39$(_context39) {
        while (1) switch (_context39.prev = _context39.next) {
          case 0:
            projectId = _ref37.projectId, dataSourceId = _ref37.dataSourceId, tableId = _ref37.tableId;
            _context39.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId), {
              method: "DELETE"
            });
          case 3:
            response = _context39.sent;
            return _context39.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context39.stop();
        }
      }, _callee39, this);
    }));
    function deleteTable(_x45) {
      return _deleteTable.apply(this, arguments);
    }
    return deleteTable;
  }();
  _proto.updateTableParents = /*#__PURE__*/function () {
    var _updateTableParents = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee40(_ref38) {
      var projectId, dataSourceId, tableId, parentId, parents, response;
      return _regeneratorRuntime().wrap(function _callee40$(_context40) {
        while (1) switch (_context40.prev = _context40.next) {
          case 0:
            projectId = _ref38.projectId, dataSourceId = _ref38.dataSourceId, tableId = _ref38.tableId, parentId = _ref38.parentId, parents = _ref38.parents;
            _context40.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/parents", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                parent_id: parentId,
                parents: parents
              })
            });
          case 3:
            response = _context40.sent;
            return _context40.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context40.stop();
        }
      }, _callee40, this);
    }));
    function updateTableParents(_x46) {
      return _updateTableParents.apply(this, arguments);
    }
    return updateTableParents;
  }();
  _proto.upsertTableRows = /*#__PURE__*/function () {
    var _upsertTableRows = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee41(_ref39) {
      var projectId, dataSourceId, tableId, rows, truncate, response;
      return _regeneratorRuntime().wrap(function _callee41$(_context41) {
        while (1) switch (_context41.prev = _context41.next) {
          case 0:
            projectId = _ref39.projectId, dataSourceId = _ref39.dataSourceId, tableId = _ref39.tableId, rows = _ref39.rows, truncate = _ref39.truncate;
            _context41.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/rows", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                rows: rows,
                truncate: truncate || false
              })
            });
          case 3:
            response = _context41.sent;
            return _context41.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context41.stop();
        }
      }, _callee41, this);
    }));
    function upsertTableRows(_x47) {
      return _upsertTableRows.apply(this, arguments);
    }
    return upsertTableRows;
  }();
  _proto.tableUpsertCSVContent = /*#__PURE__*/function () {
    var _tableUpsertCSVContent = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee42(_ref40) {
      var projectId, dataSourceId, tableId, bucket, bucketCSVPath, truncate, response;
      return _regeneratorRuntime().wrap(function _callee42$(_context42) {
        while (1) switch (_context42.prev = _context42.next) {
          case 0:
            projectId = _ref40.projectId, dataSourceId = _ref40.dataSourceId, tableId = _ref40.tableId, bucket = _ref40.bucket, bucketCSVPath = _ref40.bucketCSVPath, truncate = _ref40.truncate;
            _context42.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/csv", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                bucket: bucket,
                bucket_csv_path: bucketCSVPath,
                truncate: truncate || false
              })
            });
          case 3:
            response = _context42.sent;
            return _context42.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context42.stop();
        }
      }, _callee42, this);
    }));
    function tableUpsertCSVContent(_x48) {
      return _tableUpsertCSVContent.apply(this, arguments);
    }
    return tableUpsertCSVContent;
  }();
  _proto.getTableRow = /*#__PURE__*/function () {
    var _getTableRow = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee43(_ref41) {
      var projectId, dataSourceId, tableId, rowId, filter, qs, response;
      return _regeneratorRuntime().wrap(function _callee43$(_context43) {
        while (1) switch (_context43.prev = _context43.next) {
          case 0:
            projectId = _ref41.projectId, dataSourceId = _ref41.dataSourceId, tableId = _ref41.tableId, rowId = _ref41.rowId, filter = _ref41.filter;
            qs = filter ? "?view_filter=" + encodeURIComponent(JSON.stringify(filter)) : "";
            _context43.next = 4;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/rows/" + encodeURIComponent(rowId) + qs, {
              method: "GET"
            });
          case 4:
            response = _context43.sent;
            return _context43.abrupt("return", this._resultFromResponse(response));
          case 6:
          case "end":
            return _context43.stop();
        }
      }, _callee43, this);
    }));
    function getTableRow(_x49) {
      return _getTableRow.apply(this, arguments);
    }
    return getTableRow;
  }();
  _proto.getTableRows = /*#__PURE__*/function () {
    var _getTableRows = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee44(_ref42) {
      var projectId, dataSourceId, tableId, limit, offset, filter, qs, response;
      return _regeneratorRuntime().wrap(function _callee44$(_context44) {
        while (1) switch (_context44.prev = _context44.next) {
          case 0:
            projectId = _ref42.projectId, dataSourceId = _ref42.dataSourceId, tableId = _ref42.tableId, limit = _ref42.limit, offset = _ref42.offset, filter = _ref42.filter;
            qs = filter ? "&view_filter=" + encodeURIComponent(JSON.stringify(filter)) : "";
            _context44.next = 4;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/rows?limit=" + limit + "&offset=" + offset + qs, {
              method: "GET"
            });
          case 4:
            response = _context44.sent;
            return _context44.abrupt("return", this._resultFromResponse(response));
          case 6:
          case "end":
            return _context44.stop();
        }
      }, _callee44, this);
    }));
    function getTableRows(_x50) {
      return _getTableRows.apply(this, arguments);
    }
    return getTableRows;
  }();
  _proto.getDataSourceTableBlob = /*#__PURE__*/function () {
    var _getDataSourceTableBlob = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee45(_ref43) {
      var projectId, dataSourceId, tableId, response;
      return _regeneratorRuntime().wrap(function _callee45$(_context45) {
        while (1) switch (_context45.prev = _context45.next) {
          case 0:
            projectId = _ref43.projectId, dataSourceId = _ref43.dataSourceId, tableId = _ref43.tableId;
            _context45.next = 3;
            return this._fetchWithError(this._url + "/projects/" + projectId + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/blob", {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context45.sent;
            return _context45.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context45.stop();
        }
      }, _callee45, this);
    }));
    function getDataSourceTableBlob(_x51) {
      return _getDataSourceTableBlob.apply(this, arguments);
    }
    return getDataSourceTableBlob;
  }();
  _proto.deleteTableRow = /*#__PURE__*/function () {
    var _deleteTableRow = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee46(_ref44) {
      var projectId, dataSourceId, tableId, rowId, response;
      return _regeneratorRuntime().wrap(function _callee46$(_context46) {
        while (1) switch (_context46.prev = _context46.next) {
          case 0:
            projectId = _ref44.projectId, dataSourceId = _ref44.dataSourceId, tableId = _ref44.tableId, rowId = _ref44.rowId;
            _context46.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/tables/" + encodeURIComponent(tableId) + "/rows/" + encodeURIComponent(rowId), {
              method: "DELETE"
            });
          case 3:
            response = _context46.sent;
            return _context46.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context46.stop();
        }
      }, _callee46, this);
    }));
    function deleteTableRow(_x52) {
      return _deleteTableRow.apply(this, arguments);
    }
    return deleteTableRow;
  }();
  _proto.queryDatabase = /*#__PURE__*/function () {
    var _queryDatabase = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee47(_ref45) {
      var tables, query, filter, response;
      return _regeneratorRuntime().wrap(function _callee47$(_context47) {
        while (1) switch (_context47.prev = _context47.next) {
          case 0:
            tables = _ref45.tables, query = _ref45.query, filter = _ref45.filter;
            _context47.next = 3;
            return this._fetchWithError(this._url + "/query_database", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                query: query,
                tables: tables,
                filter: filter
              })
            });
          case 3:
            response = _context47.sent;
            return _context47.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context47.stop();
        }
      }, _callee47, this);
    }));
    function queryDatabase(_x53) {
      return _queryDatabase.apply(this, arguments);
    }
    return queryDatabase;
  }();
  _proto.getDataSourceFolders = /*#__PURE__*/function () {
    var _getDataSourceFolders = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee48(_ref46, pagination) {
      var projectId, dataSourceId, folderIds, viewFilter, queryParams, response;
      return _regeneratorRuntime().wrap(function _callee48$(_context48) {
        while (1) switch (_context48.prev = _context48.next) {
          case 0:
            projectId = _ref46.projectId, dataSourceId = _ref46.dataSourceId, folderIds = _ref46.folderIds, viewFilter = _ref46.viewFilter;
            queryParams = new URLSearchParams();
            if (pagination) {
              queryParams.append("limit", String(pagination.limit));
              queryParams.append("offset", String(pagination.offset));
            }
            if (viewFilter) {
              queryParams.append("view_filter", JSON.stringify(viewFilter));
            }
            if (folderIds && folderIds.length > 0) {
              queryParams.append("document_ids", JSON.stringify(folderIds));
            }
            _context48.next = 7;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/folders?" + queryParams.toString(), {
              method: "GET"
            });
          case 7:
            response = _context48.sent;
            return _context48.abrupt("return", this._resultFromResponse(response));
          case 9:
          case "end":
            return _context48.stop();
        }
      }, _callee48, this);
    }));
    function getDataSourceFolders(_x54, _x55) {
      return _getDataSourceFolders.apply(this, arguments);
    }
    return getDataSourceFolders;
  }();
  _proto.searchNodes = /*#__PURE__*/function () {
    var _searchNodes = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee49(_ref47) {
      var query, filter, options, response;
      return _regeneratorRuntime().wrap(function _callee49$(_context49) {
        while (1) switch (_context49.prev = _context49.next) {
          case 0:
            query = _ref47.query, filter = _ref47.filter, options = _ref47.options;
            _context49.next = 3;
            return this._fetchWithError(this._url + "/nodes/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                query: query,
                filter: filter,
                options: options
              })
            });
          case 3:
            response = _context49.sent;
            return _context49.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context49.stop();
        }
      }, _callee49, this);
    }));
    function searchNodes(_x56) {
      return _searchNodes.apply(this, arguments);
    }
    return searchNodes;
  }();
  _proto.getDataSourceStats = /*#__PURE__*/function () {
    var _getDataSourceStats = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee50(_ref48) {
      var projectId, dataSourceId, response;
      return _regeneratorRuntime().wrap(function _callee50$(_context50) {
        while (1) switch (_context50.prev = _context50.next) {
          case 0:
            projectId = _ref48.projectId, dataSourceId = _ref48.dataSourceId;
            _context50.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/stats", {
              method: "GET",
              headers: {
                "Content-Type": "application/json"
              }
            });
          case 3:
            response = _context50.sent;
            return _context50.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context50.stop();
        }
      }, _callee50, this);
    }));
    function getDataSourceStats(_x57) {
      return _getDataSourceStats.apply(this, arguments);
    }
    return getDataSourceStats;
  }();
  _proto.searchTags = /*#__PURE__*/function () {
    var _searchTags = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee51(_ref49) {
      var query, queryType, dataSourceViews, limit, dataSourceViewsFilter, response;
      return _regeneratorRuntime().wrap(function _callee51$(_context51) {
        while (1) switch (_context51.prev = _context51.next) {
          case 0:
            query = _ref49.query, queryType = _ref49.queryType, dataSourceViews = _ref49.dataSourceViews, limit = _ref49.limit;
            dataSourceViewsFilter = dataSourceViews.map(function (dsv) {
              var _dsv$parentsIn;
              return {
                data_source_id: dsv.dataSource.dustAPIDataSourceId,
                view_filter: (_dsv$parentsIn = dsv.parentsIn) != null ? _dsv$parentsIn : []
              };
            });
            _context51.next = 4;
            return this._fetchWithError(this._url + "/tags/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                data_source_views: dataSourceViewsFilter,
                query: query,
                query_type: queryType,
                limit: limit
              })
            });
          case 4:
            response = _context51.sent;
            return _context51.abrupt("return", this._resultFromResponse(response));
          case 6:
          case "end":
            return _context51.stop();
        }
      }, _callee51, this);
    }));
    function searchTags(_x58) {
      return _searchTags.apply(this, arguments);
    }
    return searchTags;
  }();
  _proto.getDataSourceFolder = /*#__PURE__*/function () {
    var _getDataSourceFolder = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee52(_ref50) {
      var projectId, dataSourceId, folderId, response;
      return _regeneratorRuntime().wrap(function _callee52$(_context52) {
        while (1) switch (_context52.prev = _context52.next) {
          case 0:
            projectId = _ref50.projectId, dataSourceId = _ref50.dataSourceId, folderId = _ref50.folderId;
            _context52.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/folders/" + encodeURIComponent(folderId), {
              method: "GET"
            });
          case 3:
            response = _context52.sent;
            return _context52.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context52.stop();
        }
      }, _callee52, this);
    }));
    function getDataSourceFolder(_x59) {
      return _getDataSourceFolder.apply(this, arguments);
    }
    return getDataSourceFolder;
  }();
  _proto.upsertDataSourceFolder = /*#__PURE__*/function () {
    var _upsertDataSourceFolder = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee53(_ref51) {
      var projectId, dataSourceId, folderId, timestamp, parentId, parents, title, mimeType, sourceUrl, providerVisibility, response;
      return _regeneratorRuntime().wrap(function _callee53$(_context53) {
        while (1) switch (_context53.prev = _context53.next) {
          case 0:
            projectId = _ref51.projectId, dataSourceId = _ref51.dataSourceId, folderId = _ref51.folderId, timestamp = _ref51.timestamp, parentId = _ref51.parentId, parents = _ref51.parents, title = _ref51.title, mimeType = _ref51.mimeType, sourceUrl = _ref51.sourceUrl, providerVisibility = _ref51.providerVisibility;
            _context53.next = 3;
            return this._fetchWithError(this._url + "/projects/" + projectId + "/data_sources/" + encodeURIComponent(dataSourceId) + "/folders", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                folder_id: folderId,
                timestamp: timestamp,
                title: title,
                parent_id: parentId,
                parents: parents,
                mime_type: mimeType,
                source_url: sourceUrl,
                provider_visibility: providerVisibility
              })
            });
          case 3:
            response = _context53.sent;
            return _context53.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context53.stop();
        }
      }, _callee53, this);
    }));
    function upsertDataSourceFolder(_x60) {
      return _upsertDataSourceFolder.apply(this, arguments);
    }
    return upsertDataSourceFolder;
  }();
  _proto.deleteDataSourceFolder = /*#__PURE__*/function () {
    var _deleteDataSourceFolder = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee54(_ref52) {
      var projectId, dataSourceId, folderId, response;
      return _regeneratorRuntime().wrap(function _callee54$(_context54) {
        while (1) switch (_context54.prev = _context54.next) {
          case 0:
            projectId = _ref52.projectId, dataSourceId = _ref52.dataSourceId, folderId = _ref52.folderId;
            _context54.next = 3;
            return this._fetchWithError(this._url + "/projects/" + encodeURIComponent(projectId) + "/data_sources/" + encodeURIComponent(dataSourceId) + "/folders/" + encodeURIComponent(folderId), {
              method: "DELETE"
            });
          case 3:
            response = _context54.sent;
            return _context54.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context54.stop();
        }
      }, _callee54, this);
    }));
    function deleteDataSourceFolder(_x61) {
      return _deleteDataSourceFolder.apply(this, arguments);
    }
    return deleteDataSourceFolder;
  }();
  _proto._fetchWithError = /*#__PURE__*/function () {
    var _fetchWithError2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee55(url, init) {
      var now, params, res, duration, err;
      return _regeneratorRuntime().wrap(function _callee55$(_context55) {
        while (1) switch (_context55.prev = _context55.next) {
          case 0:
            now = Date.now();
            _context55.prev = 1;
            params = _extends({}, init);
            if (this._apiKey) {
              params.headers = _extends({}, params.headers, {
                Authorization: "Bearer " + this._apiKey
              });
            }
            _context55.next = 6;
            return fetch(url, params);
          case 6:
            res = _context55.sent;
            return _context55.abrupt("return", new Ok({
              response: res,
              duration: Date.now() - now
            }));
          case 10:
            _context55.prev = 10;
            _context55.t0 = _context55["catch"](1);
            duration = Date.now() - now;
            err = {
              code: "unexpected_network_error",
              message: "Unexpected network error from CoreAPI: " + _context55.t0
            };
            this._logger.error({
              url: url,
              duration: duration,
              coreError: err,
              error: _context55.t0
            }, "CoreAPI error");
            return _context55.abrupt("return", new Err(err));
          case 16:
          case "end":
            return _context55.stop();
        }
      }, _callee55, this, [[1, 10]]);
    }));
    function _fetchWithError(_x62, _x63) {
      return _fetchWithError2.apply(this, arguments);
    }
    return _fetchWithError;
  }();
  _proto._resultFromResponse = /*#__PURE__*/function () {
    var _resultFromResponse2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee56(res) {
      var text, json, err, _json, _err, _err2, _json2, _json3, _err3, _res, _err4;
      return _regeneratorRuntime().wrap(function _callee56$(_context56) {
        while (1) switch (_context56.prev = _context56.next) {
          case 0:
            if (!res.isErr()) {
              _context56.next = 2;
              break;
            }
            return _context56.abrupt("return", res);
          case 2:
            _context56.next = 4;
            return res.value.response.text();
          case 4:
            text = _context56.sent;
            json = null;
            _context56.prev = 6;
            json = JSON.parse(text);
            _context56.next = 15;
            break;
          case 10:
            _context56.prev = 10;
            _context56.t0 = _context56["catch"](6);
            err = {
              code: "unexpected_response_format",
              message: "Unexpected response format from CoreAPI: " + _context56.t0
            };
            this._logger.error({
              coreError: err,
              parseError: _context56.t0,
              rawText: text,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "CoreAPI error");
            return _context56.abrupt("return", new Err(err));
          case 15:
            if (res.value.response.ok) {
              _context56.next = 27;
              break;
            }
            _err = (_json = json) == null ? void 0 : _json.error;
            if (!isCoreAPIError(_err)) {
              _context56.next = 22;
              break;
            }
            this._logger.error({
              coreError: _err,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "CoreAPI error");
            return _context56.abrupt("return", new Err(_err));
          case 22:
            _err2 = {
              code: "unexpected_error_format",
              message: "Unexpected error format from CoreAPI"
            };
            this._logger.error({
              coreError: _err2,
              json: json,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "CoreAPI error");
            return _context56.abrupt("return", new Err(_err2));
          case 25:
            _context56.next = 41;
            break;
          case 27:
            _err3 = (_json2 = json) == null ? void 0 : _json2.error;
            _res = (_json3 = json) == null ? void 0 : _json3.response;
            if (!(_err3 && isCoreAPIError(_err3))) {
              _context56.next = 34;
              break;
            }
            this._logger.error({
              coreError: _err3,
              json: json,
              status: _res.value.response.status,
              url: _res.value.response.url,
              duration: _res.value.duration
            }, "CoreAPI error");
            return _context56.abrupt("return", new Err(_err3));
          case 34:
            if (!_res) {
              _context56.next = 38;
              break;
            }
            return _context56.abrupt("return", new Ok(_res));
          case 38:
            _err4 = {
              code: "unexpected_response_format",
              message: "Unexpected response format from CoreAPI"
            };
            this._logger.error({
              coreError: _err4,
              json: json,
              status: _res.value.response.status,
              url: _res.value.response.url,
              duration: _res.value.duration
            }, "CoreAPI error");
            return _context56.abrupt("return", new Err(_err4));
          case 41:
          case "end":
            return _context56.stop();
        }
      }, _callee56, this, [[6, 10]]);
    }));
    function _resultFromResponse(_x64) {
      return _resultFromResponse2.apply(this, arguments);
    }
    return _resultFromResponse;
  }();
  return CoreAPI;
}();

var API_ERROR_TYPES = /*#__PURE__*/["not_authenticated", "sso_enforced", "missing_authorization_header_error", "malformed_authorization_header_error", "invalid_basic_authorization_error", "invalid_oauth_token_error", "expired_oauth_token_error", "invalid_api_key_error", "internal_server_error", "invalid_request_error", "invalid_rows_request_error", "user_not_found", "content_too_large", "data_source_error", "data_source_not_found", "data_source_view_not_found", "data_source_auth_error", "data_source_quota_error", "data_source_document_not_found", "data_source_not_managed", "run_error", "app_not_found", "app_auth_error", "provider_auth_error", "provider_not_found", "dataset_not_found", "workspace_not_found", "workspace_auth_error", "workspace_user_not_found", "method_not_supported_error", "personal_workspace_not_found", "action_unknown_error", "action_api_error", "membership_not_found", "invitation_not_found", "plan_limit_error", "template_not_found", "chat_message_not_found", "connector_not_found_error", "connector_update_error", "connector_update_unauthorized", "connector_oauth_target_mismatch", "connector_oauth_user_missing_rights", "connector_provider_not_supported", "connector_credentials_error", "agent_configuration_not_found", "agent_message_error", "message_not_found", "plan_message_limit_exceeded", "global_agent_error", "stripe_invalid_product_id_error", "rate_limit_error", "subscription_payment_failed", "subscription_not_found", "subscription_state_invalid", "service_unavailable",
// Use by agent creation / update
"assistant_saving_error",
// Used in the DustAPI client:
"unexpected_error_format", "unexpected_response_format", "unexpected_network_error",
// Used by callAction client:
"action_failed", "unexpected_action_response", "feature_flag_not_found", "feature_flag_already_exists",
// Pagination:
"invalid_pagination_parameters", "table_not_found",
// Templates:
"template_not_found",
// Invitations:
"invitation_already_sent_recently",
// DustAppSecrets:
"dust_app_secret_not_found",
// Key:
"key_not_found",
// Labs:
"transcripts_configuration_not_found", "transcripts_configuration_default_not_allowed", "transcripts_configuration_already_exists",
// Files:
"file_not_found", "file_too_large", "file_type_not_supported", "file_is_empty",
// Runs:
"run_not_found",
// Spaces:
"space_already_exists", "space_not_found",
// Groups:
"group_not_found",
// Plugins:
"plugin_not_found", "plugin_execution_failed",
// Trackers:
"tracker_not_found"].concat(CONVERSATION_ERROR_TYPES);
function isAPIError(obj) {
  return typeof obj === "object" && obj !== null && "message" in obj && typeof obj.message === "string" && "type" in obj && typeof obj.type === "string" && API_ERROR_TYPES.includes(obj.type);
}
function isAPIErrorResponse(obj) {
  return typeof obj === "object" && obj !== null && "error" in obj && isAPIError(obj.error);
}

// TRANSCRIPTS
var labsTranscriptsProviders = ["google_drive", "gong", "modjo"];

function createIoTsCodecFromArgs(args) {
  var codecProps = {};
  for (var _i = 0, _Object$entries = Object.entries(args); _i < _Object$entries.length; _i++) {
    var _Object$entries$_i = _Object$entries[_i],
      key = _Object$entries$_i[0],
      arg = _Object$entries$_i[1];
    switch (arg.type) {
      case "text":
        codecProps[key] = t__namespace.string;
        break;
      case "string":
        codecProps[key] = t__namespace.string;
        break;
      case "number":
        codecProps[key] = t__namespace.number;
        break;
      case "boolean":
        codecProps[key] = t__namespace["boolean"];
        break;
      case "enum":
        if (!Array.isArray(arg.values) || arg.values.length < 2) {
          throw new Error("Enum argument \"" + key + "\" must have at least two values");
        }
        codecProps[key] = t__namespace.union([t__namespace.literal(arg.values[0]), t__namespace.literal(arg.values[1])].concat(arg.values.slice(2).map(function (v) {
          return t__namespace.literal(v);
        })));
    }
  }
  return t__namespace.type(codecProps);
}
var supportedResourceTypes = ["apps", "data_source_views", "data_sources", "spaces", "workspaces",
// Special case for global operations.
"global"];
function isSupportedResourceType(resourceType) {
  return supportedResourceTypes.includes(resourceType);
}

function assertNever(x) {
  throw new Error((typeof x === "object" ? JSON.stringify(x) : x) + " is not of type never. This should never happen.");
}

var ROLES = ["admin", "builder", "user", "none"];
var ACTIVE_ROLES = ["admin", "builder", "user"];
function keyObject(arr) {
  return Object.fromEntries(arr.map(function (v) {
    return [v, null];
  }));
}
var RoleSchema = /*#__PURE__*/t__namespace.keyof( /*#__PURE__*/keyObject(ROLES));
var ActiveRoleSchema = /*#__PURE__*/t__namespace.keyof( /*#__PURE__*/keyObject(ACTIVE_ROLES));
function isActiveRoleType(role) {
  return ACTIVE_ROLES.includes(role);
}
function formatUserFullName(user) {
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : null;
}
function isAdmin(owner) {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
      return true;
    case "builder":
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}
function isBuilder(owner) {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "builder":
      return true;
    case "user":
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}
function isUser(owner) {
  if (!owner) {
    return false;
  }
  switch (owner.role) {
    case "admin":
    case "builder":
    case "user":
      return true;
    case "none":
      return false;
    default:
      assertNever(owner.role);
  }
}
function isOnlyUser(owner) {
  if (!owner) {
    return false;
  }
  return owner.role === "user";
}
function isOnlyBuilder(owner) {
  if (!owner) {
    return false;
  }
  return owner.role === "builder";
}
function isOnlyAdmin(owner) {
  if (!owner) {
    return false;
  }
  return owner.role === "admin";
}
var DustUserEmailHeader = "x-api-user-email";
function getUserEmailFromHeaders(headers) {
  var email = headers[DustUserEmailHeader];
  if (typeof email === "string") {
    return email;
  }
  return undefined;
}
function getHeaderFromUserEmail(email) {
  var _ref;
  if (!email) {
    return undefined;
  }
  return _ref = {}, _ref[DustUserEmailHeader] = email, _ref;
}

// Types for the invite form in Poke.
var InviteMemberFormSchema = /*#__PURE__*/t__namespace.type({
  email: ioTsTypes.NonEmptyString,
  role: ActiveRoleSchema
});

var MEMBERSHIP_ROLE_TYPES = ["admin", "builder", "user"];
function isMembershipRoleType(value) {
  return MEMBERSHIP_ROLE_TYPES.includes(value);
}

var MAX_MESSAGE_TIMEFRAMES = ["day", "lifetime"];
function isMaxMessagesTimeframeType(value) {
  return MAX_MESSAGE_TIMEFRAMES.includes(value);
}
var SUBSCRIPTION_STATUSES = ["active", "ended", "ended_backend_only" // Ended on the backend but not yet propagated to Stripe
];
var CreatePlanFormSchema = /*#__PURE__*/t__namespace.type({
  code: NonEmptyString.NonEmptyString,
  name: NonEmptyString.NonEmptyString,
  isSlackbotAllowed: t__namespace["boolean"],
  isSlackAllowed: t__namespace["boolean"],
  isNotionAllowed: t__namespace["boolean"],
  isGoogleDriveAllowed: t__namespace["boolean"],
  isGithubAllowed: t__namespace["boolean"],
  isIntercomAllowed: t__namespace["boolean"],
  isConfluenceAllowed: t__namespace["boolean"],
  isWebCrawlerAllowed: t__namespace["boolean"],
  maxMessages: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString]),
  maxMessagesTimeframe: /*#__PURE__*/t__namespace.keyof({
    day: null,
    lifetime: null
  }),
  dataSourcesCount: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString]),
  dataSourcesDocumentsCount: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString]),
  dataSourcesDocumentsSizeMb: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString]),
  maxUsers: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString]),
  maxVaults: /*#__PURE__*/t__namespace.union([t__namespace.number, NumberFromString.NumberFromString])
});
var EnterpriseUpgradeFormSchema = /*#__PURE__*/t__namespace.type({
  stripeSubscriptionId: NonEmptyString.NonEmptyString,
  planCode: NonEmptyString.NonEmptyString
});

// Supported operations for resource permissions.
var SUPPORTED_OPERATIONS = ["admin", "read", "write"];
/**
 * Type guard to determine if a permission configuration includes role-based access control.
 *
 * @param resourcePermission - The resource permission configuration to check
 * @returns True if the configuration includes role-based permissions
 */
function hasRolePermissions(resourcePermission) {
  return "roles" in resourcePermission;
}

var DocumentViewRawContentKey = "viewRawContent";
var DocumentDeletionKey = "deleteDocumentOrTable";

var UNIQUE_SPACE_KINDS = ["global", "system", "conversations"];
function isUniqueSpaceKind(kind) {
  return UNIQUE_SPACE_KINDS.includes(kind);
}

var TRACKER_FREQUENCIES = [{
  label: "Daily (Mon-Fri)",
  value: "0 17 * * 1-5"
}, {
  label: "Weekly on Monday",
  value: "0 17 * * 1"
}, {
  label: "Weekly on Tuesday",
  value: "0 17 * * 2"
}, {
  label: "Weekly on Wednesday",
  value: "0 17 * * 3"
}, {
  label: "Weekly on Thursday",
  value: "0 17 * * 4"
}, {
  label: "Weekly on Friday",
  value: "0 17 * * 5"
}];

var FREQUENCY_DISPLAY_TEXT = {
  never: "Never",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month"
};
var DEPTH_DISPLAY_TEXT = {
  0: "0 level",
  1: "1 level",
  2: "2 levels",
  3: "3 levels",
  4: "4 levels",
  5: "5 levels"
};

var supportedEnterpriseConnectionStrategies = ["okta", "samlp", "waad"];
var isSupportedEnterpriseConnectionStrategy = function isSupportedEnterpriseConnectionStrategy(strategy) {
  return supportedEnterpriseConnectionStrategies.includes(strategy);
};
function connectionStrategyToHumanReadable(strategy) {
  switch (strategy) {
    case "okta":
      return "Okta";
    case "samlp":
      return "SAML";
    case "waad":
      return "Microsoft Entra ID";
    default:
      assertNever(strategy);
  }
}

function isOAuthAPIError(obj) {
  return typeof obj === "object" && obj !== null && "message" in obj && typeof obj.message === "string" && "code" in obj && typeof obj.code === "string";
}
var OAuthAPI = /*#__PURE__*/function () {
  function OAuthAPI(config, logger) {
    this._logger = void 0;
    this._url = void 0;
    this._apiKey = void 0;
    this._url = config.url;
    this._logger = logger;
    this._apiKey = config.apiKey;
  }
  var _proto = OAuthAPI.prototype;
  _proto.apiUrl = function apiUrl() {
    return this._url;
  };
  _proto.createConnection = /*#__PURE__*/function () {
    var _createConnection = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
      var provider, metadata, migratedCredentials, relatedCredential, body, response;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            provider = _ref.provider, metadata = _ref.metadata, migratedCredentials = _ref.migratedCredentials, relatedCredential = _ref.relatedCredential;
            body = {
              provider: provider,
              metadata: metadata
            };
            if (migratedCredentials) {
              body.migrated_credentials = migratedCredentials;
            }
            if (relatedCredential) {
              body.related_credential = relatedCredential;
            }
            _context.next = 6;
            return this._fetchWithError(this._url + "/connections", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(body)
            });
          case 6:
            response = _context.sent;
            return _context.abrupt("return", this._resultFromResponse(response));
          case 8:
          case "end":
            return _context.stop();
        }
      }, _callee, this);
    }));
    function createConnection(_x) {
      return _createConnection.apply(this, arguments);
    }
    return createConnection;
  }();
  _proto.finalizeConnection = /*#__PURE__*/function () {
    var _finalizeConnection = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_ref2) {
      var provider, connectionId, code, redirectUri, response;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            provider = _ref2.provider, connectionId = _ref2.connectionId, code = _ref2.code, redirectUri = _ref2.redirectUri;
            _context2.next = 3;
            return this._fetchWithError(this._url + "/connections/" + connectionId + "/finalize", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                provider: provider,
                code: code,
                redirect_uri: redirectUri
              })
            });
          case 3:
            response = _context2.sent;
            return _context2.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context2.stop();
        }
      }, _callee2, this);
    }));
    function finalizeConnection(_x2) {
      return _finalizeConnection.apply(this, arguments);
    }
    return finalizeConnection;
  }();
  _proto.getAccessToken = /*#__PURE__*/function () {
    var _getAccessToken = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
      var provider, connectionId, response;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            provider = _ref3.provider, connectionId = _ref3.connectionId;
            _context3.next = 3;
            return this._fetchWithError(this._url + "/connections/" + connectionId + "/access_token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                provider: provider
              })
            });
          case 3:
            response = _context3.sent;
            return _context3.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context3.stop();
        }
      }, _callee3, this);
    }));
    function getAccessToken(_x3) {
      return _getAccessToken.apply(this, arguments);
    }
    return getAccessToken;
  }();
  _proto.postCredentials = /*#__PURE__*/function () {
    var _postCredentials = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(_ref4) {
      var provider, userId, workspaceId, credentials, response;
      return _regeneratorRuntime().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            provider = _ref4.provider, userId = _ref4.userId, workspaceId = _ref4.workspaceId, credentials = _ref4.credentials;
            _context4.next = 3;
            return this._fetchWithError(this._url + "/credentials", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                provider: provider,
                metadata: {
                  user_id: userId,
                  workspace_id: workspaceId
                },
                content: credentials
              })
            });
          case 3:
            response = _context4.sent;
            return _context4.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context4.stop();
        }
      }, _callee4, this);
    }));
    function postCredentials(_x4) {
      return _postCredentials.apply(this, arguments);
    }
    return postCredentials;
  }();
  _proto.getCredentials = /*#__PURE__*/function () {
    var _getCredentials = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(_ref5) {
      var credentialsId, response;
      return _regeneratorRuntime().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            credentialsId = _ref5.credentialsId;
            _context5.next = 3;
            return this._fetchWithError(this._url + "/credentials/" + credentialsId);
          case 3:
            response = _context5.sent;
            return _context5.abrupt("return", this._resultFromResponse(response));
          case 5:
          case "end":
            return _context5.stop();
        }
      }, _callee5, this);
    }));
    function getCredentials(_x5) {
      return _getCredentials.apply(this, arguments);
    }
    return getCredentials;
  }();
  _proto._fetchWithError = /*#__PURE__*/function () {
    var _fetchWithError2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(url, init) {
      var now, params, res, duration, err;
      return _regeneratorRuntime().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            now = Date.now();
            params = _extends({}, init);
            if (this._apiKey) {
              params.headers = _extends({}, params.headers, {
                Authorization: "Bearer " + this._apiKey
              });
            }
            _context6.prev = 3;
            _context6.next = 6;
            return fetch(url, params);
          case 6:
            res = _context6.sent;
            return _context6.abrupt("return", new Ok({
              response: res,
              duration: Date.now() - now
            }));
          case 10:
            _context6.prev = 10;
            _context6.t0 = _context6["catch"](3);
            duration = Date.now() - now;
            err = {
              code: "unexpected_network_error",
              message: "Unexpected network error from OAuthAPI: " + _context6.t0
            };
            this._logger.error({
              url: url,
              duration: duration,
              oAuthError: err,
              error: _context6.t0
            }, "OAuthAPI error");
            return _context6.abrupt("return", new Err(err));
          case 16:
          case "end":
            return _context6.stop();
        }
      }, _callee6, this, [[3, 10]]);
    }));
    function _fetchWithError(_x6, _x7) {
      return _fetchWithError2.apply(this, arguments);
    }
    return _fetchWithError;
  }();
  _proto._resultFromResponse = /*#__PURE__*/function () {
    var _resultFromResponse2 = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(res) {
      var text, json, err, _json, _err, _err2, _json2, _json3, _err3, _res, _err4;
      return _regeneratorRuntime().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            if (!res.isErr()) {
              _context7.next = 2;
              break;
            }
            return _context7.abrupt("return", res);
          case 2:
            _context7.next = 4;
            return res.value.response.text();
          case 4:
            text = _context7.sent;
            json = null;
            _context7.prev = 6;
            json = JSON.parse(text);
            _context7.next = 15;
            break;
          case 10:
            _context7.prev = 10;
            _context7.t0 = _context7["catch"](6);
            err = {
              code: "unexpected_response_format",
              message: "Unexpected response format from OAuthAPI: " + _context7.t0
            };
            this._logger.error({
              oAuthError: err,
              parseError: _context7.t0,
              rawText: text,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "OAuthAPI error");
            return _context7.abrupt("return", new Err(err));
          case 15:
            if (res.value.response.ok) {
              _context7.next = 27;
              break;
            }
            _err = (_json = json) == null ? void 0 : _json.error;
            if (!isOAuthAPIError(_err)) {
              _context7.next = 22;
              break;
            }
            this._logger.error({
              oAuthError: _err,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "OAuthAPI error");
            return _context7.abrupt("return", new Err(_err));
          case 22:
            _err2 = {
              code: "unexpected_error_format",
              message: "Unexpected error format from OAuthAPI"
            };
            this._logger.error({
              oAuthError: _err2,
              json: json,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration
            }, "OAuthAPI error");
            return _context7.abrupt("return", new Err(_err2));
          case 25:
            _context7.next = 41;
            break;
          case 27:
            _err3 = (_json2 = json) == null ? void 0 : _json2.error;
            _res = (_json3 = json) == null ? void 0 : _json3.response;
            if (!(_err3 && isOAuthAPIError(_err3))) {
              _context7.next = 34;
              break;
            }
            this._logger.error({
              oauthError: _err3,
              json: json,
              status: _res.value.response.status,
              url: _res.value.response.url,
              duration: _res.value.duration
            }, "OAuthAPI error");
            return _context7.abrupt("return", new Err(_err3));
          case 34:
            if (!_res) {
              _context7.next = 38;
              break;
            }
            return _context7.abrupt("return", new Ok(_res));
          case 38:
            _err4 = {
              code: "unexpected_response_format",
              message: "Unexpected response format from OAuthAPI"
            };
            this._logger.error({
              oAuthError: _err4,
              json: json,
              status: _res.value.response.status,
              url: _res.value.response.url,
              duration: _res.value.duration
            }, "OAuthAPI error");
            return _context7.abrupt("return", new Err(_err4));
          case 41:
          case "end":
            return _context7.stop();
        }
      }, _callee7, this, [[6, 10]]);
    }));
    function _resultFromResponse(_x8) {
      return _resultFromResponse2.apply(this, arguments);
    }
    return _resultFromResponse;
  }();
  return OAuthAPI;
}();

var OAUTH_ACCESS_TOKEN_CACHE_TTL = 1000 * 60 * 5;
var CACHE = /*#__PURE__*/new Map();
function getOAuthConnectionAccessToken(_x) {
  return _getOAuthConnectionAccessToken.apply(this, arguments);
}
function _getOAuthConnectionAccessToken() {
  _getOAuthConnectionAccessToken = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var config, logger, provider, connectionId, cached, res;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          config = _ref.config, logger = _ref.logger, provider = _ref.provider, connectionId = _ref.connectionId;
          cached = CACHE.get(connectionId);
          if (!(cached && cached.local_expiry > Date.now())) {
            _context.next = 4;
            break;
          }
          return _context.abrupt("return", new Ok(cached));
        case 4:
          _context.next = 6;
          return new OAuthAPI(config, logger).getAccessToken({
            provider: provider,
            connectionId: connectionId
          });
        case 6:
          res = _context.sent;
          if (!res.isErr()) {
            _context.next = 9;
            break;
          }
          return _context.abrupt("return", res);
        case 9:
          CACHE.set(connectionId, _extends({
            local_expiry: Date.now() + OAUTH_ACCESS_TOKEN_CACHE_TTL
          }, res.value));
          return _context.abrupt("return", res);
        case 11:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _getOAuthConnectionAccessToken.apply(this, arguments);
}

function getConnectionCredentials(_x) {
  return _getConnectionCredentials.apply(this, arguments);
}
function _getConnectionCredentials() {
  _getConnectionCredentials = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var config, logger, credentialsId, res;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          config = _ref.config, logger = _ref.logger, credentialsId = _ref.credentialsId;
          _context.next = 3;
          return new OAuthAPI(config, logger).getCredentials({
            credentialsId: credentialsId
          });
        case 3:
          res = _context.sent;
          if (!res.isErr()) {
            _context.next = 6;
            break;
          }
          return _context.abrupt("return", res);
        case 6:
          return _context.abrupt("return", res);
        case 7:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _getConnectionCredentials.apply(this, arguments);
}

var OAUTH_USE_CASES = ["connection", "labs_transcripts", "platform_actions"];
function isOAuthUseCase(obj) {
  return OAUTH_USE_CASES.includes(obj);
}
var OAUTH_PROVIDERS = ["confluence", "github", "google_drive", "intercom", "notion", "slack", "gong", "microsoft", "zendesk", "salesforce"];
function isOAuthProvider(obj) {
  return OAUTH_PROVIDERS.includes(obj);
}
function isOAuthConnectionType(obj) {
  var connection = obj;
  return typeof connection.connection_id === "string" && typeof connection.created === "number" && isOAuthProvider(connection.provider) && (connection.status === "pending" || connection.status === "finalized");
}
// OAuth Providers utils
function isValidZendeskSubdomain(s) {
  return typeof s === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s);
}
function isValidSalesforceDomain(s) {
  return typeof s === "string" && s.startsWith("https://") && s.endsWith(".salesforce.com");
}
function isValidSalesforceClientId(s) {
  return typeof s === "string" && s.trim().length > 0;
}
function isValidSalesforceClientSecret(s) {
  return typeof s === "string" && s.trim().length > 0;
}
// Credentials Providers
var PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = ["gong", "modjo"];
var CREDENTIALS_PROVIDERS = ["snowflake", "modjo", "bigquery", "salesforce"];
function isCredentialProvider(obj) {
  return CREDENTIALS_PROVIDERS.includes(obj);
}
function isProviderWithWorkspaceConfiguration(obj) {
  return PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS.includes(obj);
}
// Credentials
var SnowflakeCredentialsSchema = /*#__PURE__*/t__namespace.type({
  username: t__namespace.string,
  password: t__namespace.string,
  account: t__namespace.string,
  role: t__namespace.string,
  warehouse: t__namespace.string
});
var CheckBigQueryCredentialsSchema = /*#__PURE__*/t__namespace.type({
  type: t__namespace.string,
  project_id: t__namespace.string,
  private_key_id: t__namespace.string,
  private_key: t__namespace.string,
  client_email: t__namespace.string,
  client_id: t__namespace.string,
  auth_uri: t__namespace.string,
  token_uri: t__namespace.string,
  auth_provider_x509_cert_url: t__namespace.string,
  client_x509_cert_url: t__namespace.string,
  universe_domain: t__namespace.string
});
var BigQueryCredentialsWithLocationSchema = /*#__PURE__*/t__namespace.type({
  type: t__namespace.string,
  project_id: t__namespace.string,
  private_key_id: t__namespace.string,
  private_key: t__namespace.string,
  client_email: t__namespace.string,
  client_id: t__namespace.string,
  auth_uri: t__namespace.string,
  token_uri: t__namespace.string,
  auth_provider_x509_cert_url: t__namespace.string,
  client_x509_cert_url: t__namespace.string,
  universe_domain: t__namespace.string,
  location: t__namespace.string
});
var ApiKeyCredentialsSchema = /*#__PURE__*/t__namespace.type({
  api_key: t__namespace.string
});
var SalesforceCredentialsSchema = /*#__PURE__*/t__namespace.type({
  client_id: t__namespace.string,
  client_secret: t__namespace.string
});
function isSnowflakeCredentials(credentials) {
  return "username" in credentials && "password" in credentials;
}
function isModjoCredentials(credentials) {
  return "api_key" in credentials;
}
function isBigQueryWithLocationCredentials(credentials) {
  return "type" in credentials && "project_id" in credentials && "location" in credentials;
}
function isSalesforceCredentials(credentials) {
  return "client_id" in credentials && "client_secret" in credentials;
}

function setupOAuthConnection(_x) {
  return _setupOAuthConnection.apply(this, arguments);
}
function _setupOAuthConnection() {
  _setupOAuthConnection = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var dustClientFacingUrl, owner, provider, useCase, extraConfig;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          dustClientFacingUrl = _ref.dustClientFacingUrl, owner = _ref.owner, provider = _ref.provider, useCase = _ref.useCase, extraConfig = _ref.extraConfig;
          return _context.abrupt("return", new Promise(function (resolve) {
            var url = dustClientFacingUrl + "/w/" + owner.sId + "/oauth/" + provider + "/setup?useCase=" + useCase;
            if (extraConfig) {
              url += "&extraConfig=" + encodeURIComponent(JSON.stringify(extraConfig));
            }
            var oauthPopup = window.open(url);
            var authComplete = false;
            var popupMessageEventListener = function popupMessageEventListener(event) {
              if (event.origin !== window.location.origin) {
                return;
              }
              if (event.data.type === "connection_finalized") {
                authComplete = true;
                var _event$data = event.data,
                  error = _event$data.error,
                  connection = _event$data.connection;
                if (error) {
                  resolve(new Err(new Error(error)));
                } else if (connection && isOAuthConnectionType(connection)) {
                  resolve(new Ok(connection));
                } else {
                  resolve(new Err(new Error("Invalid connection data received from auth window")));
                }
                window.removeEventListener("message", popupMessageEventListener);
                oauthPopup == null || oauthPopup.close();
              }
            };
            window.addEventListener("message", popupMessageEventListener);
            var checkPopupStatus = setInterval(function () {
              if (oauthPopup && oauthPopup.closed) {
                window.removeEventListener("message", popupMessageEventListener);
                clearInterval(checkPopupStatus);
                setTimeout(function () {
                  if (!authComplete) {
                    resolve(new Err(new Error("User closed the window before auth completed")));
                  }
                }, 100);
              }
            }, 100);
          }));
        case 2:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _setupOAuthConnection.apply(this, arguments);
}

var statsDClient = undefined;
function getStatsDClient() {
  if (!statsDClient) {
    statsDClient = new hotShots.StatsD();
  }
  return statsDClient;
}

function redisClient(_x) {
  return _redisClient.apply(this, arguments);
}
function _redisClient() {
  _redisClient = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var origin, redisUri, statsDClient, client;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          origin = _ref.origin, redisUri = _ref.redisUri;
          statsDClient = getStatsDClient();
          client = redis.createClient({
            url: redisUri
          });
          client.on("error", function (err) {
            return console.log("Redis Client Error", err);
          });
          client.on("connect", function () {
            statsDClient.increment("redis.connection.count", 1, [origin]);
          });
          client.on("end", function () {
            statsDClient.decrement("redis.connection.count", 1, [origin]);
          });
          _context.next = 8;
          return client.connect();
        case 8:
          return _context.abrupt("return", client);
        case 9:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _redisClient.apply(this, arguments);
}

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// if caching big objects, there is a possible race condition (mulitple calls to
// caching), therefore, we use a lock
function cacheWithRedis(fn, resolver, ttlMs, redisUri) {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }
  return /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
    var REDIS_CACHE_URI,
      redisCli,
      key,
      cacheVal,
      result,
      _args = arguments;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          if (redisUri) {
            _context.next = 5;
            break;
          }
          REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
          if (REDIS_CACHE_URI) {
            _context.next = 4;
            break;
          }
          throw new Error("REDIS_CACHE_URI is not set");
        case 4:
          redisUri = REDIS_CACHE_URI;
        case 5:
          redisCli = undefined;
          key = "cacheWithRedis-" + fn.name + "-" + resolver.apply(void 0, _args);
          _context.prev = 7;
          _context.next = 10;
          return redisClient({
            origin: "cache_with_redis",
            redisUri: redisUri
          });
        case 10:
          redisCli = _context.sent;
          _context.next = 13;
          return redisCli.get(key);
        case 13:
          cacheVal = _context.sent;
          if (!cacheVal) {
            _context.next = 16;
            break;
          }
          return _context.abrupt("return", JSON.parse(cacheVal));
        case 16:
          _context.prev = 16;
          _context.next = 19;
          return lock(key);
        case 19:
          _context.next = 21;
          return redisCli.get(key);
        case 21:
          cacheVal = _context.sent;
          if (!cacheVal) {
            _context.next = 24;
            break;
          }
          return _context.abrupt("return", JSON.parse(cacheVal));
        case 24:
          _context.next = 26;
          return fn.apply(void 0, _args);
        case 26:
          result = _context.sent;
          _context.next = 29;
          return redisCli.set(key, JSON.stringify(result), {
            PX: ttlMs
          });
        case 29:
          return _context.abrupt("return", result);
        case 30:
          _context.prev = 30;
          unlock(key);
          return _context.finish(30);
        case 33:
          _context.prev = 33;
          if (!redisCli) {
            _context.next = 37;
            break;
          }
          _context.next = 37;
          return redisCli.quit();
        case 37:
          return _context.finish(33);
        case 38:
        case "end":
          return _context.stop();
      }
    }, _callee, null, [[7,, 33, 38], [16,, 30, 33]]);
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
var locks = {};
function lock(_x) {
  return _lock.apply(this, arguments);
}
function _lock() {
  _lock = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(key) {
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          return _context2.abrupt("return", new Promise(function (resolve) {
            if (locks[key]) {
              locks[key].push(resolve);
            } else {
              // use array to allow multiple locks
              // array set to empty indicates first lock
              locks[key] = [];
              resolve();
            }
          }));
        case 1:
        case "end":
          return _context2.stop();
      }
    }, _callee2);
  }));
  return _lock.apply(this, arguments);
}
function unlock(key) {
  if (locks[key] === undefined) {
    throw new Error("Unreachable: unlock called without lock");
  }
  if (locks[key].length === 0) {
    delete locks[key];
    return;
  }
  var unlockFn = locks[key].pop();
  if (!unlockFn) {
    throw new Error("Unreachable: unlock called without lock");
  }
  unlockFn();
}

var _process$env = process.env,
  SLACK_USER_OPERATION_BOT_TOKEN = _process$env.SLACK_USER_OPERATION_BOT_TOKEN,
  NODE_ENV = _process$env.NODE_ENV;
// We might want to delete this, once we make progress out of Sequelize synchronisation.
function sendInitDbMessage(_x) {
  return _sendInitDbMessage.apply(this, arguments);
}
function _sendInitDbMessage() {
  _sendInitDbMessage = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var service, logger, commitId, message, res, jsonRes;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          service = _ref.service, logger = _ref.logger;
          if (!(NODE_ENV !== "production")) {
            _context.next = 3;
            break;
          }
          return _context.abrupt("return");
        case 3:
          if (SLACK_USER_OPERATION_BOT_TOKEN) {
            _context.next = 6;
            break;
          }
          logger.info({}, "SLACK_USER_OPERATION_BOT_TOKEN is not set");
          return _context.abrupt("return");
        case 6:
          // get the current commit id
          commitId = "unknown";
          try {
            commitId = child_process__namespace.execSync("git rev-parse HEAD").toString().trim();
          } catch (error) {
            logger.error({}, "Failed to get commit id");
          }
          message = "papertrail: `initdb` has been initiated. Service: `" + service + "`. CommitId: `" + commitId + "`";
          _context.prev = 9;
          _context.next = 12;
          return fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + SLACK_USER_OPERATION_BOT_TOKEN
            },
            body: JSON.stringify({
              channel: "deployments",
              text: "",
              blocks: [{
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: message
                }
              }],
              mrkdown: true
            })
          });
        case 12:
          res = _context.sent;
          _context.next = 15;
          return res.json();
        case 15:
          jsonRes = _context.sent;
          if (!jsonRes.ok) {
            logger.error({
              error: jsonRes.error
            }, "Failed to send slack message(1).");
          }
          _context.next = 22;
          break;
        case 19:
          _context.prev = 19;
          _context.t0 = _context["catch"](9);
          logger.error({
            error: _context.t0
          }, "Failed to send slack message(2).");
        case 22:
        case "end":
          return _context.stop();
      }
    }, _callee, null, [[9, 19]]);
  }));
  return _sendInitDbMessage.apply(this, arguments);
}

function isDevelopment() {
  return "development" === "development";
}
function isDustWorkspace(w) {
  return w.sId === process.env.PRODUCTION_DUST_WORKSPACE_ID;
}

var WHITELISTABLE_FEATURES = ["usage_data_api", "okta_enterprise_connection", "labs_transcripts", "labs_transcripts_full_storage", "document_tracker", "openai_o1_feature", "openai_o1_mini_feature", "openai_o1_high_reasoning_feature", "openai_o1_custom_assistants_feature", "openai_o1_high_reasoning_custom_assistants_feature", "deepseek_feature", "google_ai_studio_experimental_models_feature", "index_private_slack_channel", "disable_run_logs", "labs_trackers", "show_debug_tools", "labs_github_actions", "deepseek_r1_global_agent_feature", "salesforce_feature", "advanced_notion_management", "attach_from_datasources", "force_gdrive_labels_scope"];
function isWhitelistableFeature(feature) {
  return WHITELISTABLE_FEATURES.includes(feature);
}

/**
 * This function generates mime types for a given provider and resource types.
 * The mime types are in the format `application/vnd.dust.PROVIDER.RESOURCE_TYPE`.
 * Notes:
 * - The underscores in the provider name are stripped in the generated mime type.
 * - The underscores in the resource type are replaced with dashes in the generated mime type.
 */
function generateMimeTypes(_ref) {
  var provider = _ref.provider,
    resourceTypes = _ref.resourceTypes;
  return resourceTypes.reduce(function (acc, s) {
    var _extends2;
    return _extends({}, acc, (_extends2 = {}, _extends2[s] = "application/vnd.dust." + provider.replace("_", "") + "." + s.replace("_", "-").toLowerCase(), _extends2));
  }, {});
}
var MIME_TYPES = {
  CONFLUENCE: /*#__PURE__*/generateMimeTypes({
    provider: "confluence",
    resourceTypes: ["SPACE", "PAGE"]
  }),
  GITHUB: /*#__PURE__*/generateMimeTypes({
    provider: "github",
    resourceTypes: ["REPOSITORY", "CODE_ROOT", "CODE_DIRECTORY", "CODE_FILE",
    // ISSUES is the folder containing all issues.
    "ISSUES",
    // ISSUE is a single issue.
    "ISSUE",
    // DISCUSSIONS is the folder containing all discussions.
    "DISCUSSIONS",
    // DISCUSSION is a single discussion.
    "DISCUSSION"]
  }),
  GOOGLE_DRIVE: /*#__PURE__*/generateMimeTypes({
    provider: "google_drive",
    // Spreadsheets may contain many sheets, thus resemble folders and are
    // stored as such, but with the special mimeType below.
    // For files and sheets, we keep Google's mime types.
    resourceTypes: ["SHARED_WITH_ME", "FOLDER", "SPREADSHEET"]
  }),
  INTERCOM: /*#__PURE__*/generateMimeTypes({
    provider: "intercom",
    resourceTypes: ["COLLECTION", "TEAMS_FOLDER", "CONVERSATION", "TEAM", "ARTICLE", "HELP_CENTER"]
  }),
  MICROSOFT: /*#__PURE__*/generateMimeTypes({
    provider: "microsoft",
    // Spreadsheets may contain many sheets, thus resemble folders and are
    // stored as such, but with the special mimeType below.
    // For files and sheets, we keep Microsoft's mime types.
    resourceTypes: ["FOLDER", "SPREADSHEET"]
  }),
  NOTION: /*#__PURE__*/generateMimeTypes({
    provider: "notion",
    resourceTypes: ["UNKNOWN_FOLDER", "SYNCING_FOLDER", "DATABASE", "PAGE"]
  }),
  SLACK: /*#__PURE__*/generateMimeTypes({
    provider: "slack",
    resourceTypes: ["CHANNEL", "THREAD", "MESSAGES"]
  }),
  SNOWFLAKE: /*#__PURE__*/generateMimeTypes({
    provider: "snowflake",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"]
  }),
  WEBCRAWLER: /*#__PURE__*/generateMimeTypes({
    provider: "webcrawler",
    resourceTypes: ["FOLDER"] // pages are upserted as text/html, not an internal mime type
  }),
  ZENDESK: /*#__PURE__*/generateMimeTypes({
    provider: "zendesk",
    resourceTypes: ["BRAND", "HELP_CENTER", "CATEGORY", "ARTICLE",
    // TICKETS is the folder containing all tickets.
    "TICKETS",
    // TICKET is a single ticket.
    "TICKET"]
  }),
  BIGQUERY: /*#__PURE__*/generateMimeTypes({
    provider: "bigquery",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"]
  }),
  SALESFORCE: /*#__PURE__*/generateMimeTypes({
    provider: "salesforce",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"]
  }),
  GONG: /*#__PURE__*/generateMimeTypes({
    provider: "gong",
    resourceTypes: ["TRANSCRIPT", "TRANSCRIPT_FOLDER"]
  })
};

var RateLimitError = /*#__PURE__*/function (_Error) {
  function RateLimitError() {
    return _Error.apply(this, arguments) || this;
  }
  _inheritsLoose(RateLimitError, _Error);
  return RateLimitError;
}( /*#__PURE__*/_wrapNativeSuper(Error));
var rateLimiterRedisClient;
function getRedisClient(_x) {
  return _getRedisClient.apply(this, arguments);
}
function _getRedisClient() {
  _getRedisClient = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var origin, redisUri, REDIS_URI;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          origin = _ref.origin, redisUri = _ref.redisUri;
          REDIS_URI = redisUri || process.env.REDIS_URI;
          if (REDIS_URI) {
            _context.next = 4;
            break;
          }
          throw new Error("REDIS_URI is not defined");
        case 4:
          if (rateLimiterRedisClient) {
            _context.next = 8;
            break;
          }
          _context.next = 7;
          return redisClient({
            origin: origin,
            redisUri: REDIS_URI
          });
        case 7:
          rateLimiterRedisClient = _context.sent;
        case 8:
          return _context.abrupt("return", rateLimiterRedisClient);
        case 9:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _getRedisClient.apply(this, arguments);
}
var RATE_LIMITER_PREFIX = "rate_limiter";
var makeRateLimiterKey = function makeRateLimiterKey(key) {
  return RATE_LIMITER_PREFIX + ":" + key;
};
function rateLimiter(_x2) {
  return _rateLimiter.apply(this, arguments);
}
function _rateLimiter() {
  _rateLimiter = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(_ref2) {
    var key, maxPerTimeframe, timeframeSeconds, logger, redisUri, statsDClient, now, redisKey, tags, redis, zcountRes, remaining, totalTimeMs;
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          key = _ref2.key, maxPerTimeframe = _ref2.maxPerTimeframe, timeframeSeconds = _ref2.timeframeSeconds, logger = _ref2.logger, redisUri = _ref2.redisUri;
          statsDClient = getStatsDClient();
          now = new Date();
          redisKey = makeRateLimiterKey(key);
          tags = [];
          redis = undefined;
          _context2.prev = 6;
          _context2.next = 9;
          return getRedisClient({
            origin: "rate_limiter",
            redisUri: redisUri
          });
        case 9:
          redis = _context2.sent;
          _context2.next = 12;
          return redis.zCount(redisKey, new Date().getTime() - timeframeSeconds * 1000, "+inf");
        case 12:
          zcountRes = _context2.sent;
          remaining = maxPerTimeframe - zcountRes;
          if (!(remaining > 0)) {
            _context2.next = 21;
            break;
          }
          _context2.next = 17;
          return redis.zAdd(redisKey, {
            score: new Date().getTime(),
            value: uuid.v4()
          });
        case 17:
          _context2.next = 19;
          return redis.expire(redisKey, timeframeSeconds * 2);
        case 19:
          _context2.next = 22;
          break;
        case 21:
          statsDClient.increment("ratelimiter.exceeded.count", 1, tags);
        case 22:
          totalTimeMs = new Date().getTime() - now.getTime();
          statsDClient.distribution("ratelimiter.latency.distribution", totalTimeMs, tags);
          return _context2.abrupt("return", remaining > 0 ? remaining : 0);
        case 27:
          _context2.prev = 27;
          _context2.t0 = _context2["catch"](6);
          statsDClient.increment("ratelimiter.error.count", 1, tags);
          logger.error({
            key: key,
            maxPerTimeframe: maxPerTimeframe,
            timeframeSeconds: timeframeSeconds,
            error: _context2.t0
          }, "RateLimiter error");
          // In case of error on our side, we allow the request.
          return _context2.abrupt("return", 1);
        case 32:
        case "end":
          return _context2.stop();
      }
    }, _callee2, null, [[6, 27]]);
  }));
  return _rateLimiter.apply(this, arguments);
}
function expireRateLimiterKey(_x3) {
  return _expireRateLimiterKey.apply(this, arguments);
}
function _expireRateLimiterKey() {
  _expireRateLimiterKey = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
    var key, redisUri, redis, redisKey, isExpired;
    return _regeneratorRuntime().wrap(function _callee3$(_context3) {
      while (1) switch (_context3.prev = _context3.next) {
        case 0:
          key = _ref3.key, redisUri = _ref3.redisUri;
          redis = undefined;
          _context3.prev = 2;
          _context3.next = 5;
          return getRedisClient({
            origin: "rate_limiter",
            redisUri: redisUri
          });
        case 5:
          redis = _context3.sent;
          redisKey = makeRateLimiterKey(key);
          _context3.next = 9;
          return redis.expire(redisKey, 0);
        case 9:
          isExpired = _context3.sent;
          return _context3.abrupt("return", new Ok(isExpired));
        case 13:
          _context3.prev = 13;
          _context3.t0 = _context3["catch"](2);
          return _context3.abrupt("return", new Err(_context3.t0));
        case 16:
        case "end":
          return _context3.stop();
      }
    }, _callee3, null, [[2, 13]]);
  }));
  return _expireRateLimiterKey.apply(this, arguments);
}
function getTimeframeSecondsFromLiteral(timeframeLiteral) {
  switch (timeframeLiteral) {
    case "day":
      return 60 * 60 * 24;
    // 1 day.
    // Lifetime is intentionally mapped to a 30-day period.
    case "lifetime":
      return 60 * 60 * 24 * 30;
    // 30 days.
    default:
      return 0;
  }
}

function withRetries(logger, fn, _temp) {
  var _ref = _temp === void 0 ? {} : _temp,
    _ref$retries = _ref.retries,
    retries = _ref$retries === void 0 ? 10 : _ref$retries,
    _ref$delayBetweenRetr = _ref.delayBetweenRetriesMs,
    delayBetweenRetriesMs = _ref$delayBetweenRetr === void 0 ? 1000 : _ref$delayBetweenRetr;
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }
  return /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(arg) {
      var errors, _loop, _ret, i;
      return _regeneratorRuntime().wrap(function _callee$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            errors = [];
            _loop = /*#__PURE__*/_regeneratorRuntime().mark(function _loop() {
              var sleepTime;
              return _regeneratorRuntime().wrap(function _loop$(_context) {
                while (1) switch (_context.prev = _context.next) {
                  case 0:
                    _context.prev = 0;
                    _context.next = 3;
                    return fn(arg);
                  case 3:
                    _context.t0 = _context.sent;
                    return _context.abrupt("return", {
                      v: _context.t0
                    });
                  case 7:
                    _context.prev = 7;
                    _context.t1 = _context["catch"](0);
                    sleepTime = delayBetweenRetriesMs * Math.pow(i + 1, 2);
                    logger.warn({
                      error: _context.t1,
                      attempt: i + 1,
                      retries: retries,
                      sleepTime: sleepTime
                    }, "Error while executing retriable function. Retrying...");
                    _context.next = 13;
                    return new Promise(function (resolve) {
                      return setTimeout(resolve, sleepTime);
                    });
                  case 13:
                    errors.push(_context.t1);
                  case 14:
                  case "end":
                    return _context.stop();
                }
              }, _loop, null, [[0, 7]]);
            });
            i = 0;
          case 3:
            if (!(i < retries)) {
              _context2.next = 11;
              break;
            }
            return _context2.delegateYield(_loop(), "t0", 5);
          case 5:
            _ret = _context2.t0;
            if (!_ret) {
              _context2.next = 8;
              break;
            }
            return _context2.abrupt("return", _ret.v);
          case 8:
            i++;
            _context2.next = 3;
            break;
          case 11:
            throw new Error(errors.join("\n"));
          case 12:
          case "end":
            return _context2.stop();
        }
      }, _callee);
    }));
    return function (_x) {
      return _ref2.apply(this, arguments);
    };
  }();
}

function readableStreamToReadable(webStream) {
  return stream.Readable.fromWeb(webStream);
}

function createPageMetadataPrefix(_ref) {
  var pageNumber = _ref.pageNumber,
    prefix = _ref.prefix;
  return prefix + ": " + pageNumber;
}
/**
 * A Transform stream that processes HTML data from a Readable stream, extracts text from specific
 * "page" <div> elements (identified by a known CSS class), and prefixes each extracted page's text
 * with some custom metadata. Each complete page is pushed downstream as it is encountered.
 *
 * @param input - A Node.js Readable stream containing HTML
 * @param prefix - A prefix string included in the page metadata
 * @param pageSelector - The CSS class on <div> that identifies a page boundary
 * @returns A new Readable stream that emits text for each page, prefixed by metadata
 *
 * How it works:
 * 1. We create a single HTML parser (Parser) instance that listens to events:
 *    - onopentag: Detects when we enter a <div class="pageSelector"> (or nested)
 *    - ontext: Accumulates text if we are currently inside a page div
 *    - onclosetag: Detects when we leave a page div; if that ends the page div,
 *      we emit the stored text plus metadata
 *    - onerror: Destroys the transform if a parsing error occurs
 *
 * 2. We wrap this parser in a Node Transform stream so we can:
 *    - pipe HTML input into it (input.pipe(htmlParsingTransform))
 *    - feed data chunks into the parser
 *    - flush final content in _flush if the stream ends while still inside a page
 *
 * 3. Each completed page is emitted downstream in text form with a custom prefix block
 */
function transformStream(input, prefix, pageSelector) {
  // Track parser state.
  var state = {
    insidePage: false,
    pageDepth: 0,
    pageNumber: 0,
    currentPageBuffer: ""
  };
  // Create a single parser instance for the entire stream.
  var parser = new htmlparser2.Parser({
    onopentag: function onopentag(name, attribs) {
      // If this open tag is <div class="pageSelector">, we've encountered a new page.
      // We'll track nested divs in case they exist inside the page container.
      if (name === "div" && attribs["class"] === pageSelector) {
        if (!state.insidePage) {
          state.insidePage = true;
          state.pageDepth = 1;
        } else {
          state.pageDepth++;
        }
      } else if (state.insidePage) {
        // If we're already inside a page, any new tag increases the nesting depth.
        state.pageDepth++;
      }
    },
    ontext: function ontext(text) {
      // If in the page region, accumulate the text, removing or replacing artifacts
      if (state.insidePage) {
        // Replaces &#13; (carriage return) with nothing, and trims the text.
        // Append a space to keep some spacing between tokens
        state.currentPageBuffer += text.replace("&#13;", "").trim() + " ";
      }
    },
    onclosetag: function onclosetag() {
      // If we're inside a page, decrement the nesting depth each time a tag closes.
      if (state.insidePage) {
        state.pageDepth--;
        // If pageDepth==0, we've closed the outermost page div => a page is complete.
        if (state.pageDepth === 0) {
          state.insidePage = false;
          // If there's any text in the buffer, emit it as a new chunk prefixed with metadata.
          if (state.currentPageBuffer.trim()) {
            htmlParsingTransform.push("\n" + createPageMetadataPrefix({
              pageNumber: state.pageNumber,
              prefix: prefix
            }) + "\n" + state.currentPageBuffer.trim() + "\n");
          }
          // Reset for next page.
          state.pageNumber++;
          state.currentPageBuffer = "";
        }
      }
    },
    onerror: function onerror(err) {
      // If we encounter a parser error, destroy the transform with that error.
      htmlParsingTransform.destroy(err);
    }
  }, {
    decodeEntities: true
  } // Instruct parser to decode HTML entities like &amp.
  );
  // Create transform stream.
  var htmlParsingTransform = new stream.Transform({
    objectMode: true,
    transform: function transform(chunk, _encoding, callback) {
      try {
        parser.write(chunk.toString());
        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(new Error(typeof error === "string" ? error : "Unknown error in htmlParsingTransform.transform()"));
        }
      }
    },
    flush: function flush(callback) {
      try {
        // Signal to the parser that we're done (end of the HTML input).
        parser.end();
        // If we ended the stream while still inside a page, emit any leftover text.
        if (state.insidePage && state.currentPageBuffer.trim()) {
          this.push("\n" + createPageMetadataPrefix({
            pageNumber: state.pageNumber,
            prefix: prefix
          }) + "\n" + state.currentPageBuffer.trim() + "\n");
        }
        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(new Error(typeof error === "string" ? error : "Unknown error in htmlParsingTransform.flush()"));
        }
      }
    }
  });
  // Handle errors on both streams.
  input.on("error", function (error) {
    return htmlParsingTransform.destroy(error);
  });
  htmlParsingTransform.on("error", function (error) {
    return input.destroy(error);
  });
  // Pipe the input HTML stream through our transform and return the result
  return input.pipe(htmlParsingTransform);
}

var HTML_TAGS = {
  ROW: "tr",
  CELL: "td"
};
/**
 * A Transform stream that processes HTML data from a Readable stream, extracts text from tables
 * and converts it to CSV format. It handles two specific cases:
 * 1. Text within elements matching the selector, which gets prefixed with TABLE_PREFIX
 * 2. Content within table cells (<td>), which gets converted to CSV format
 *
 * @param input - A Node.js Readable stream containing HTML
 * @param selector - A tag name to match for direct text extraction (prefixed with TABLE_PREFIX)
 * @returns A new Readable stream that emits the processed text in CSV format
 *
 * How it works:
 * 1. We create a single HTML parser (Parser) instance that listens to events:
 *    - onopentag: Tracks the current tag stack
 *    - ontext:
 *      * If inside selector-matched element: adds text with TABLE_PREFIX
 *      * If inside <td>: collects text for current row
 *    - onclosetag: When a </tr> is encountered, converts the collected row to CSV
 *    - onerror: Destroys the transform if a parsing error occurs
 *
 * 2. We wrap this parser in a Node Transform stream to:
 *    - pipe HTML input into it
 *    - process data chunks through the parser
 *    - handle proper stream cleanup in flush
 */
function transformStreamToCSV(input, selector) {
  // Track parser state.
  var state = {
    tags: [],
    currentRow: []
  };
  // Create a single parser instance for the entire stream.
  var parser = new htmlparser2.Parser({
    onopentag: function onopentag(name) {
      state.tags.push(name);
    },
    ontext: function ontext(text) {
      var currentTag = state.tags[state.tags.length - 1];
      if (currentTag === selector) {
        htmlParsingTransform.push("" + TABLE_PREFIX + text + "\n");
      } else if (currentTag === HTML_TAGS.CELL) {
        state.currentRow.push(text);
      }
    },
    onclosetag: function onclosetag(name) {
      var lastTag = state.tags.pop();
      if (name !== lastTag) {
        throw new Error("Invalid tag order");
      } else {
        if (lastTag === HTML_TAGS.ROW) {
          var csv = sync.stringify([state.currentRow]);
          htmlParsingTransform.push(csv);
          state.currentRow = [];
        }
      }
    },
    onerror: function onerror(err) {
      // If we encounter a parser error, destroy the transform with that error.
      htmlParsingTransform.destroy(err);
    }
  }, {
    decodeEntities: true
  } // Instruct parser to decode HTML entities like &amp.
  );
  // Create transform stream.
  var htmlParsingTransform = new stream.Transform({
    objectMode: true,
    transform: function transform(chunk, _encoding, callback) {
      try {
        parser.write(chunk.toString());
        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(new Error(typeof error === "string" ? error : "Unknown error in htmlParsingTransform.transform()"));
        }
      }
    },
    flush: function flush(callback) {
      try {
        // Signal to the parser that we're done (end of the HTML input).
        parser.end();
        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(new Error(typeof error === "string" ? error : "Unknown error in htmlParsingTransform.flush()"));
        }
      }
    }
  });
  // Handle errors on both streams.
  input.on("error", function (error) {
    return htmlParsingTransform.destroy(error);
  });
  htmlParsingTransform.on("error", function (error) {
    return input.destroy(error);
  });
  // Pipe the input HTML stream through our transform and return the result
  return input.pipe(htmlParsingTransform);
}

// Define the codec for the response.
var TikaResponseCodec = /*#__PURE__*/t__namespace.type({
  "Content-Type": t__namespace.string,
  "X-TIKA:content": t__namespace.string
});
var pagePrefixesPerMimeType = {
  "application/pdf": "$pdfPage",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "$slideNumber"
};
// All those content types are supported by the Tika server.
// Before adding a new content type, make sure to test it.
var supportedContentTypes = ["application/pdf", "application/msword", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
var contentTypeConfig = {
  "application/pdf": {
    handler: "html",
    selector: "page",
    transformer: "document"
  },
  "application/vnd.ms-powerpoint": {
    handler: "html",
    selector: "slide-content",
    transformer: "document"
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    handler: "html",
    selector: "slide-content",
    transformer: "document"
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    handler: "html",
    selector: "h1",
    transformer: "csv"
  },
  "application/vnd.ms-excel": {
    handler: "html",
    selector: "h1",
    transformer: "csv"
  }
};
function isTextExtractionSupportedContentType(contentType) {
  return supportedContentTypes.includes(contentType);
}
var DEFAULT_HANDLER = "text";
var DEFAULT_TIMEOUT_IN_MS = 60000;
var TextExtraction = /*#__PURE__*/function () {
  function TextExtraction(url, options) {
    this.url = void 0;
    this.options = void 0;
    this.url = url;
    this.options = options;
  }
  var _proto = TextExtraction.prototype;
  _proto.getAdditionalHeaders = function getAdditionalHeaders() {
    return {
      "X-Tika-PDFOcrStrategy": this.options.enableOcr ? "auto" : "no_ocr",
      "X-Tika-Timeout-Millis": DEFAULT_TIMEOUT_IN_MS.toString()
    };
  }
  // Method to extract text from a buffer.
  ;
  _proto.fromBuffer =
  /*#__PURE__*/
  function () {
    var _fromBuffer = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(fileBuffer, contentType) {
      var response;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return this.queryTika(fileBuffer, contentType);
          case 2:
            response = _context.sent;
            if (!response.isErr()) {
              _context.next = 5;
              break;
            }
            return _context.abrupt("return", response);
          case 5:
            return _context.abrupt("return", this.processResponse(response.value));
          case 6:
          case "end":
            return _context.stop();
        }
      }, _callee, this);
    }));
    function fromBuffer(_x, _x2) {
      return _fromBuffer.apply(this, arguments);
    }
    return fromBuffer;
  }() // Method to extract text from a stream.
  ;
  _proto.fromStream =
  /*#__PURE__*/
  function () {
    var _fromStream = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(fileStream, contentType) {
      var response, responseStream, config, transformer, selector, prefix;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            _context2.next = 2;
            return withRetries(this.options.logger, function (_ref) {
              var url = _ref.url,
                additionalHeaders = _ref.additionalHeaders,
                contentType = _ref.contentType,
                fileStream = _ref.fileStream;
              return fetch(url + "/tika/", {
                method: "PUT",
                headers: _extends({
                  "Content-Type": contentType
                }, additionalHeaders),
                body: stream.Readable.toWeb(fileStream),
                duplex: "half"
              });
            }, {
              retries: 3,
              delayBetweenRetriesMs: 1000
            })({
              url: this.url,
              additionalHeaders: this.getAdditionalHeaders(),
              contentType: contentType,
              fileStream: fileStream
            });
          case 2:
            response = _context2.sent;
            if (response.body) {
              _context2.next = 5;
              break;
            }
            throw new Error("Response body is null");
          case 5:
            responseStream = readableStreamToReadable(response.body);
            config = contentTypeConfig[contentType];
            if (!config) {
              _context2.next = 16;
              break;
            }
            transformer = config.transformer, selector = config.selector;
            _context2.t0 = transformer;
            _context2.next = _context2.t0 === "document" ? 12 : _context2.t0 === "csv" ? 14 : 15;
            break;
          case 12:
            prefix = pagePrefixesPerMimeType[contentType];
            return _context2.abrupt("return", transformStream(responseStream, prefix, selector));
          case 14:
            return _context2.abrupt("return", transformStreamToCSV(responseStream, selector));
          case 15:
            assertNever(transformer);
          case 16:
            return _context2.abrupt("return", responseStream);
          case 17:
          case "end":
            return _context2.stop();
        }
      }, _callee2, this);
    }));
    function fromStream(_x3, _x4) {
      return _fromStream.apply(this, arguments);
    }
    return fromStream;
  }() // Query the Tika server and return the response data.
  ;
  _proto.queryTika =
  /*#__PURE__*/
  function () {
    var _queryTika = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(fileBuffer, contentType) {
      var _contentTypeConfig$co, _contentTypeConfig$co2;
      var handlerType, response, data, decodedReponse, pathError, errorMessage;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            // Determine the handler type based on the content type.
            // The HTML handler preserves the structural information of the document
            // like page structure, etc. The text handler does not.
            handlerType = (_contentTypeConfig$co = (_contentTypeConfig$co2 = contentTypeConfig[contentType]) == null ? void 0 : _contentTypeConfig$co2.handler) != null ? _contentTypeConfig$co : DEFAULT_HANDLER;
            _context3.prev = 1;
            _context3.next = 4;
            return withRetries(this.options.logger, function (_ref2) {
              var url = _ref2.url,
                additionalHeaders = _ref2.additionalHeaders,
                handlerType = _ref2.handlerType,
                contentType = _ref2.contentType,
                fileBuffer = _ref2.fileBuffer;
              return fetch(url + "/tika/" + handlerType, {
                method: "PUT",
                headers: _extends({
                  Accept: "application/json",
                  "Content-Type": contentType
                }, additionalHeaders),
                body: fileBuffer
              });
            }, {
              retries: 3,
              delayBetweenRetriesMs: 1000
            })({
              url: this.url,
              additionalHeaders: this.getAdditionalHeaders(),
              handlerType: handlerType,
              contentType: contentType,
              fileBuffer: fileBuffer
            });
          case 4:
            response = _context3.sent;
            if (response.ok) {
              _context3.next = 7;
              break;
            }
            return _context3.abrupt("return", new Err(new Error("HTTP error status: " + response.status)));
          case 7:
            _context3.next = 9;
            return response.json();
          case 9:
            data = _context3.sent;
            decodedReponse = TikaResponseCodec.decode(data);
            if (!Either$1.isLeft(decodedReponse)) {
              _context3.next = 14;
              break;
            }
            pathError = reporter__namespace.formatValidationErrors(decodedReponse.left);
            return _context3.abrupt("return", new Err(new Error("Invalid response format: " + pathError)));
          case 14:
            return _context3.abrupt("return", new Ok(decodedReponse.right));
          case 17:
            _context3.prev = 17;
            _context3.t0 = _context3["catch"](1);
            this.options.logger.error({
              error: _context3.t0
            }, "Error while extracting text");
            errorMessage = _context3.t0 instanceof Error ? _context3.t0.message : "Unexpected error";
            return _context3.abrupt("return", new Err(new Error("Failed extracting text: " + errorMessage)));
          case 22:
          case "end":
            return _context3.stop();
        }
      }, _callee3, this, [[1, 17]]);
    }));
    function queryTika(_x5, _x6) {
      return _queryTika.apply(this, arguments);
    }
    return queryTika;
  }() // Process the Tika response and return an array of PageContent.
  ;
  _proto.processResponse = function processResponse(response) {
    var _contentTypeConfig$co3;
    var contentType = response["Content-Type"];
    var pageSelector = (_contentTypeConfig$co3 = contentTypeConfig[contentType]) == null ? void 0 : _contentTypeConfig$co3.selector;
    if (pageSelector) {
      return this.processContentBySelector(response, pageSelector);
    }
    return this.processDefaultResponse(response);
  }
  // Generic function to process response using a page selector.
  ;
  _proto.processContentBySelector = function processContentBySelector(response, contentSelector) {
    var html = response["X-TIKA:content"];
    var stream$1 = stream.Readable.from(html);
    // This logic extract the content of the page based on the selector.
    // We use a streaming parser to avoid loading the entire content in memory.
    return new Promise(function (resolve) {
      var contentDivs = [];
      var currentPageContent = "";
      var insidePage = false;
      var pageNumber = 0;
      var pageDepth = 0;
      var parser = new htmlparser2.Parser({
        onopentag: function onopentag(name, attribs) {
          // Check if the current tag is the page selector.
          // If it is, we are inside a page.
          // This assumes that we don't have nested pages.
          if (name === "div" && attribs["class"] === contentSelector) {
            insidePage = true;
            pageNumber++;
            currentPageContent = "";
            pageDepth = 1;
          } else if (insidePage) {
            // If we are inside a page, increment the page depth to handle nested divs.
            // This is required to know when we are done with the page.
            pageDepth++;
          }
        },
        ontext: function ontext(text) {
          // If we are inside a page, append the text to the current page content.
          if (insidePage) {
            currentPageContent += text.trim() + " ";
          }
        },
        onclosetag: function onclosetag() {
          // If we are inside a page, decrement the page depth.
          if (insidePage) {
            pageDepth--;
            // If the page depth is 0, we are done with the page.
            if (pageDepth === 0) {
              insidePage = false;
              if (currentPageContent.trim()) {
                contentDivs.push({
                  pageNumber: pageNumber,
                  content: currentPageContent.trim()
                });
              }
              currentPageContent = "";
            }
          }
        },
        onerror: function onerror(err) {
          return resolve(new Err(err));
        }
      }, {
        decodeEntities: true
      });
      stream$1.on("data", function (chunk) {
        parser.write(chunk.toString());
      });
      stream$1.on("end", function () {
        parser.end();
        return resolve(new Ok(contentDivs));
      });
      stream$1.on("error", function (err) {
        return resolve(new Err(err));
      });
    });
  }
  // Process default response.
  ;
  _proto.processDefaultResponse = function processDefaultResponse(response) {
    var content = response["X-TIKA:content"];
    // Treat the entire content as a single page.
    return Promise.resolve(new Ok([{
      pageNumber: 1,
      content: content.trim()
    }]));
  };
  return TextExtraction;
}();

function sendUserOperationMessage(_x) {
  return _sendUserOperationMessage.apply(this, arguments);
}
function _sendUserOperationMessage() {
  _sendUserOperationMessage = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref) {
    var message, logger, channel, _process$env, SLACK_USER_OPERATION_BOT_TOKEN, SLACK_USER_OPERATION_CHANNEL_ID, res, jsonRes;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          message = _ref.message, logger = _ref.logger, channel = _ref.channel;
          _process$env = process.env, SLACK_USER_OPERATION_BOT_TOKEN = _process$env.SLACK_USER_OPERATION_BOT_TOKEN, SLACK_USER_OPERATION_CHANNEL_ID = _process$env.SLACK_USER_OPERATION_CHANNEL_ID;
          if (!(!SLACK_USER_OPERATION_BOT_TOKEN || !SLACK_USER_OPERATION_CHANNEL_ID)) {
            _context.next = 5;
            break;
          }
          logger.info({}, "SLACK_USER_OPERATION_BOT_TOKEN or SLACK_USER_OPERATION_CHANNEL_ID is not set");
          return _context.abrupt("return");
        case 5:
          _context.prev = 5;
          _context.next = 8;
          return fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + SLACK_USER_OPERATION_BOT_TOKEN
            },
            body: JSON.stringify({
              channel: channel != null ? channel : SLACK_USER_OPERATION_CHANNEL_ID,
              text: message
            })
          });
        case 8:
          res = _context.sent;
          _context.next = 11;
          return res.json();
        case 11:
          jsonRes = _context.sent;
          if (!jsonRes.ok) {
            logger.error({
              error: jsonRes.error
            }, "Failed to send slack message to user operation channel (1).");
          }
          // Log the result
          _context.next = 18;
          break;
        case 15:
          _context.prev = 15;
          _context.t0 = _context["catch"](5);
          logger.error({
            error: _context.t0
          }, "Failed to send slack message to user operation channel (2).");
        case 18:
        case "end":
          return _context.stop();
      }
    }, _callee, null, [[5, 15]]);
  }));
  return _sendUserOperationMessage.apply(this, arguments);
}

/**
 * Executes an array of tasks concurrently with controlled parallelism.
 *
 * This function processes a list of items concurrently while maintaining a maximum
 * number of parallel executions. It uses a shared queue approach where multiple
 * workers pull items to process, ensuring each item is processed exactly once
 * and results are maintained in the original order.
 *
 * @param items - Array of items to be processed
 * @param iterator - Async function that processes each item. Receives the item and its index
 * @param options.concurrency - Maximum number of parallel executions (default: 8)
 * @returns Promise resolving to array of results in the same order as input items.
 */
function concurrentExecutor(_x, _x2, _x3) {
  return _concurrentExecutor.apply(this, arguments);
}
function _concurrentExecutor() {
  _concurrentExecutor = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(items, iterator, _ref) {
    var _ref$concurrency, concurrency, results, queue, worker, _worker;
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          _worker = function _worker3() {
            _worker = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
              var work, result;
              return _regeneratorRuntime().wrap(function _callee$(_context) {
                while (1) switch (_context.prev = _context.next) {
                  case 0:
                    if (!(work = queue.shift())) {
                      _context.next = 7;
                      break;
                    }
                    _context.next = 3;
                    return iterator(work.item, work.index);
                  case 3:
                    result = _context.sent;
                    results[work.index] = result;
                    _context.next = 0;
                    break;
                  case 7:
                  case "end":
                    return _context.stop();
                }
              }, _callee);
            }));
            return _worker.apply(this, arguments);
          };
          worker = function _worker2() {
            return _worker.apply(this, arguments);
          };
          _ref$concurrency = _ref.concurrency, concurrency = _ref$concurrency === void 0 ? 8 : _ref$concurrency;
          results = new Array(items.length); // Initialize queue with work items, preserving original index.
          // This queue is shared between all workers.
          queue = items.map(function (item, index) {
            return {
              item: item,
              index: index
            };
          });
          /**
           * Worker function that continuously processes items from the shared queue.
           * Multiple instances of this worker run concurrently, each competing
           * for the next available item in the queue. When the queue is empty,
           * the worker terminates.
           *
           * The queue.shift() operation is atomic in JavaScript, ensuring
           * each item is processed exactly once across all workers.
           */
          // Create and start workers, limiting the number to either the concurrency
          // limit or the number of items, whichever is smaller. All workers share
          // the same queue and results array.
          _context2.next = 7;
          return Promise.all(Array.from({
            length: Math.min(concurrency, items.length)
          }, function () {
            return worker();
          }));
        case 7:
          return _context2.abrupt("return", results);
        case 8:
        case "end":
          return _context2.stop();
      }
    }, _callee2);
  }));
  return _concurrentExecutor.apply(this, arguments);
}

var EnvironmentConfig = /*#__PURE__*/function () {
  function EnvironmentConfig() {}
  EnvironmentConfig.getEnvVariable = function getEnvVariable(key) {
    var cachedValue = this.cache[key];
    if (!cachedValue) {
      var value = process.env[key];
      if (value === undefined) {
        throw new Error(key + " is required but not set");
      }
      this.cache[key] = value;
      return value;
    }
    return cachedValue;
  };
  EnvironmentConfig.getOptionalEnvVariable = function getOptionalEnvVariable(key) {
    if (!this.cache[key]) {
      var value = process.env[key];
      if (value) {
        this.cache[key] = value;
      }
    }
    return this.cache[key];
  };
  return EnvironmentConfig;
}();
EnvironmentConfig.cache = {};

function isValidDate(date) {
  return !isNaN(date.valueOf());
}

function errorToString(error) {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}
function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(errorToString(error));
}

var once = false;
function setupGlobalErrorHandler(logger) {
  if (once) {
    logger.info({}, "Global error handler already setup");
    return;
  }
  once = true;
  process.on("unhandledRejection", function (reason, promise) {
    // uuid here serves as a correlation id for the console.error and the logger.error.
    var uuid$1 = uuid.v4();
    // console.log here is important because the promise.catch() below could fail.
    console.error("unhandledRejection", promise, reason, uuid$1);
    promise["catch"](function (error) {
      // We'll get the call stack from error only if the promise was rejected with an error object.
      // Example: new Promise((_, reject) => reject(new Error("Some error")))
      logger.error({
        error: error,
        panic: true,
        uuid: uuid$1,
        reason: reason
      }, "Unhandled Rejection");
    });
  });
  process.on("uncaughtException", function (error) {
    logger.error({
      error: error,
      panic: true
    }, "Uncaught Exception");
  });
}

function md5(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}
function saltedKey(key, size) {
  if (size === void 0) {
    size = 32;
  }
  var DUST_DEVELOPERS_SECRETS_SECRET = process.env.DUST_DEVELOPERS_SECRETS_SECRET;
  return crypto.createHash("sha256").update(DUST_DEVELOPERS_SECRETS_SECRET + key).digest("base64").substring(0, size);
}
function encrypt(text, key) {
  var iv = md5(key).substring(0, 16);
  var cipher = crypto.createCipheriv("aes-256-cbc", saltedKey(key), iv);
  var encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher["final"]("hex");
  return encrypted;
}
function decrypt(encrypted, key) {
  var iv = md5(key).substring(0, 16);
  var decipher = crypto.createDecipheriv("aes-256-cbc", saltedKey(key), iv);
  var decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher["final"]("utf8");
  return decrypted;
}

/**
 * Substring that ensures we don't cut a string in the middle of a unicode
 * character.
 *
 * The split characters are removed from the result. As such the
 * result may be shorter than the requested length. As a consequence,
 * safeSubstring(0,K) + safeSubstring(K) may not be equal to the original
 * string.
 *
 * Read more:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#utf-16_characters_unicode_code_points_and_grapheme_clusters
 */
function safeSubstring(str, start, end) {
  while (isTrailingLoneSurrogate(str.charCodeAt(start))) {
    start++;
  }
  if (end === undefined) {
    end = str.length;
  }
  while (isLeadingLoneSurrogate(str.charCodeAt(end - 1))) {
    end--;
  }
  return str.substring(start, end);
}
function isLeadingLoneSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}
function isTrailingLoneSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}
function pluralize(count) {
  return count !== 1 ? "s" : "";
}
function sanitizeString(rawString) {
  return rawString.trim().toLowerCase();
}
function slugify(text) {
  return text.normalize("NFKD") // Normalize to decomposed form.
  .replace(/[\u0300-\u036f]/g, "") // Remove diacritics.
  .replace(/([a-z])([A-Z0-9])/g, "$1_$2") // Get all lowercase letters that are near to uppercase ones and replace with _.
  .toLowerCase().trim().replace(/\s+/g, "_") // Replace spaces with _.
  .replace(/[\W]+/g, "_") // Replace all non-word characters with _.
  .replace(/__+/g, "_"); // Replace multiple _ with single _.
}
function isSlugified(text) {
  return /^[a-z0-9_]+$/.test(text);
}
function redactString(str, n) {
  if (typeof str !== "string") {
    return str;
  }
  if (str.length <= n) {
    return str;
  }
  var redacted = "•".repeat(str.length - n) + str.slice(-n);
  return redacted;
}
function truncate(text, length, omission) {
  if (omission === void 0) {
    omission = "...";
  }
  return text.length > length ? "" + text.substring(0, length - omission.length) + omission : text;
}
function safeParseJSON(str) {
  try {
    var res = JSON.parse(str);
    return new Ok(res);
  } catch (err) {
    if (err instanceof Error) {
      return new Err(err);
    }
    return new Err(new Error("Unexpected error: JSON parsing failed."));
  }
}
function stripNullBytes(text) {
  return text.replace(/\0/g, "");
}

var InvalidStructuredDataHeaderError = /*#__PURE__*/function (_Error) {
  function InvalidStructuredDataHeaderError() {
    return _Error.apply(this, arguments) || this;
  }
  _inheritsLoose(InvalidStructuredDataHeaderError, _Error);
  return InvalidStructuredDataHeaderError;
}( /*#__PURE__*/_wrapNativeSuper(Error));
var ParsingCsvError = /*#__PURE__*/function (_Error2) {
  function ParsingCsvError() {
    return _Error2.apply(this, arguments) || this;
  }
  _inheritsLoose(ParsingCsvError, _Error2);
  return ParsingCsvError;
}( /*#__PURE__*/_wrapNativeSuper(Error));
function getSanitizedHeaders(rawHeaders) {
  try {
    var value = rawHeaders.reduce(function (acc, curr) {
      // Special case for __dust_id, which is a reserved header name that we use
      // to assign unique row_id to make incremental row updates possible.
      var slugifiedName = curr === "__dust_id" ? curr : slugify(curr);
      if (!acc.includes(slugifiedName) || !slugifiedName.length) {
        acc.push(slugifiedName);
      } else {
        var conflictResolved = false;
        for (var i = 2; i < 64; i++) {
          if (!acc.includes(slugify(slugifiedName + "_" + i))) {
            acc.push(slugify(slugifiedName + "_" + i));
            conflictResolved = true;
            break;
          }
        }
        if (!conflictResolved) {
          throw new InvalidStructuredDataHeaderError("Failed to generate unique slugified name for header \"" + curr + "\" after multiple attempts.");
        }
      }
      return acc;
    }, []);
    return new Ok(value);
  } catch (e) {
    if (e instanceof Error) {
      return new Err(e);
    } else {
      return new Err(new Error("An unknown error occurred"));
    }
  }
}
function guessDelimiter(_x) {
  return _guessDelimiter.apply(this, arguments);
}
// This function is used by connectors to turn a , ; \t separated file into a comma separated file.
// It also will raise if the file can't be parsed.
function _guessDelimiter() {
  _guessDelimiter = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(csv) {
    var delimiter, delimiterColsCount, _i, _arr, d, records, parser, _iteratorAbruptCompletion, _didIteratorError, _iteratorError, _iterator, _step, record, firstRecord, secondRecord;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          // Detect the delimiter: try to parse the first 2 lines with different delimiters,
          // keep the one that works for both lines and has the most columns.
          delimiter = undefined;
          delimiterColsCount = 0;
          _i = 0, _arr = [",", ";", "\t"];
        case 3:
          if (!(_i < _arr.length)) {
            _context.next = 50;
            break;
          }
          d = _arr[_i];
          records = [];
          _context.prev = 6;
          // We parse at most 8 lines with skipEmptyLines with the goal of getting 2 valid ones,
          // otherwise let's consider the file as broken beyond repair.
          parser = csvParse.parse(csv, {
            delimiter: d,
            to: 8,
            skipEmptyLines: true
          });
          _iteratorAbruptCompletion = false;
          _didIteratorError = false;
          _context.prev = 10;
          _iterator = _asyncIterator(parser);
        case 12:
          _context.next = 14;
          return _iterator.next();
        case 14:
          if (!(_iteratorAbruptCompletion = !(_step = _context.sent).done)) {
            _context.next = 22;
            break;
          }
          record = _step.value;
          records.push(record);
          if (!(records.length === 2)) {
            _context.next = 19;
            break;
          }
          return _context.abrupt("break", 22);
        case 19:
          _iteratorAbruptCompletion = false;
          _context.next = 12;
          break;
        case 22:
          _context.next = 28;
          break;
        case 24:
          _context.prev = 24;
          _context.t0 = _context["catch"](10);
          _didIteratorError = true;
          _iteratorError = _context.t0;
        case 28:
          _context.prev = 28;
          _context.prev = 29;
          if (!(_iteratorAbruptCompletion && _iterator["return"] != null)) {
            _context.next = 33;
            break;
          }
          _context.next = 33;
          return _iterator["return"]();
        case 33:
          _context.prev = 33;
          if (!_didIteratorError) {
            _context.next = 36;
            break;
          }
          throw _iteratorError;
        case 36:
          return _context.finish(33);
        case 37:
          return _context.finish(28);
        case 38:
          _context.next = 43;
          break;
        case 40:
          _context.prev = 40;
          _context.t1 = _context["catch"](6);
          return _context.abrupt("continue", 47);
        case 43:
          firstRecord = records[0], secondRecord = records[1]; // Check for more than one line to ensure sufficient data for accurate delimiter detection.
          if (secondRecord) {
            _context.next = 46;
            break;
          }
          return _context.abrupt("continue", 47);
        case 46:
          if (!!firstRecord.length && firstRecord.length === secondRecord.length) {
            if (firstRecord.length > delimiterColsCount) {
              delimiterColsCount = firstRecord.length;
              delimiter = d;
            }
          }
        case 47:
          _i++;
          _context.next = 3;
          break;
        case 50:
          return _context.abrupt("return", delimiter);
        case 51:
        case "end":
          return _context.stop();
      }
    }, _callee, null, [[6, 40], [10, 24, 28, 38], [29,, 33, 37]]);
  }));
  return _guessDelimiter.apply(this, arguments);
}
function parseAndStringifyCsv(_x2) {
  return _parseAndStringifyCsv.apply(this, arguments);
}
function _parseAndStringifyCsv() {
  _parseAndStringifyCsv = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(tableCsv) {
    var delimiter, records, parser, _iteratorAbruptCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, record;
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          _context2.next = 2;
          return guessDelimiter(tableCsv);
        case 2:
          delimiter = _context2.sent;
          records = [];
          _context2.prev = 4;
          parser = csvParse.parse(tableCsv, {
            delimiter: delimiter,
            skipEmptyLines: true,
            columns: function columns(c) {
              return c;
            }
          });
          _iteratorAbruptCompletion2 = false;
          _didIteratorError2 = false;
          _context2.prev = 8;
          _iterator2 = _asyncIterator(parser);
        case 10:
          _context2.next = 12;
          return _iterator2.next();
        case 12:
          if (!(_iteratorAbruptCompletion2 = !(_step2 = _context2.sent).done)) {
            _context2.next = 18;
            break;
          }
          record = _step2.value;
          records.push(record);
        case 15:
          _iteratorAbruptCompletion2 = false;
          _context2.next = 10;
          break;
        case 18:
          _context2.next = 24;
          break;
        case 20:
          _context2.prev = 20;
          _context2.t0 = _context2["catch"](8);
          _didIteratorError2 = true;
          _iteratorError2 = _context2.t0;
        case 24:
          _context2.prev = 24;
          _context2.prev = 25;
          if (!(_iteratorAbruptCompletion2 && _iterator2["return"] != null)) {
            _context2.next = 29;
            break;
          }
          _context2.next = 29;
          return _iterator2["return"]();
        case 29:
          _context2.prev = 29;
          if (!_didIteratorError2) {
            _context2.next = 32;
            break;
          }
          throw _iteratorError2;
        case 32:
          return _context2.finish(29);
        case 33:
          return _context2.finish(24);
        case 34:
          _context2.next = 39;
          break;
        case 36:
          _context2.prev = 36;
          _context2.t1 = _context2["catch"](4);
          throw new ParsingCsvError(_context2.t1 instanceof csvParse.CsvError ? "Unable to parse CSV string : " + _context2.t1.message : "Unable to parse CSV string");
        case 39:
          return _context2.abrupt("return", new Promise(function (resolve, reject) {
            csvStringify.stringify(records, {
              header: true
            }, function (err, output) {
              if (err) {
                reject(new ParsingCsvError("Unable to stringify parsed CSV data"));
              } else {
                resolve(output);
              }
            });
          }));
        case 40:
        case "end":
          return _context2.stop();
      }
    }, _callee2, null, [[4, 36], [8, 20, 24, 34], [25,, 29, 33]]);
  }));
  return _parseAndStringifyCsv.apply(this, arguments);
}

exports.ACTION_RUNNING_LABELS = ACTION_RUNNING_LABELS;
exports.ACTIVE_ROLES = ACTIVE_ROLES;
exports.AGENT_CONFIGURATION_SCOPES = AGENT_CONFIGURATION_SCOPES;
exports.APP_NAME_REGEXP = APP_NAME_REGEXP;
exports.ASSISTANT_BUILDER_DRAWER_TABS = ASSISTANT_BUILDER_DRAWER_TABS;
exports.ASSISTANT_CREATIVITY_LEVELS = ASSISTANT_CREATIVITY_LEVELS;
exports.ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES = ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES;
exports.ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES = ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES;
exports.ActionResponseBaseSchema = ActionResponseBaseSchema;
exports.ActiveRoleSchema = ActiveRoleSchema;
exports.AdminCommandSchema = AdminCommandSchema;
exports.AdminResponseSchema = AdminResponseSchema;
exports.AdminSuccessResponseSchema = AdminSuccessResponseSchema;
exports.ApiKeyCredentialsSchema = ApiKeyCredentialsSchema;
exports.AssistantCreativityLevelCodec = AssistantCreativityLevelCodec;
exports.BaseAction = BaseAction;
exports.BatchAllResponseSchema = BatchAllResponseSchema;
exports.BatchCommandSchema = BatchCommandSchema;
exports.BigQueryCredentialsWithLocationSchema = BigQueryCredentialsWithLocationSchema;
exports.BrowseActionOutputSchema = BrowseActionOutputSchema;
exports.BrowseResultSchema = BrowseResultSchema;
exports.BuilderEmojiSuggestionsResponseBodySchema = BuilderEmojiSuggestionsResponseBodySchema;
exports.BuilderSuggestionsResponseBodySchema = BuilderSuggestionsResponseBodySchema;
exports.CLAUDE_2_1_MODEL_ID = CLAUDE_2_1_MODEL_ID;
exports.CLAUDE_2_DEFAULT_MODEL_CONFIG = CLAUDE_2_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_3_5_HAIKU_20241022_MODEL_ID = CLAUDE_3_5_HAIKU_20241022_MODEL_ID;
exports.CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG = CLAUDE_3_5_HAIKU_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG = CLAUDE_3_5_SONNET_20240620_DEPRECATED_MODEL_CONFIG;
exports.CLAUDE_3_5_SONNET_20240620_MODEL_ID = CLAUDE_3_5_SONNET_20240620_MODEL_ID;
exports.CLAUDE_3_5_SONNET_20241022_MODEL_ID = CLAUDE_3_5_SONNET_20241022_MODEL_ID;
exports.CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG = CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_3_7_SONNET_20250219_MODEL_ID = CLAUDE_3_7_SONNET_20250219_MODEL_ID;
exports.CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG = CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_3_HAIKU_20240307_MODEL_ID = CLAUDE_3_HAIKU_20240307_MODEL_ID;
exports.CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG = CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_3_OPUS_2024029_MODEL_ID = CLAUDE_3_OPUS_2024029_MODEL_ID;
exports.CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG = CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG;
exports.CLAUDE_INSTANT_1_2_MODEL_ID = CLAUDE_INSTANT_1_2_MODEL_ID;
exports.CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG = CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG;
exports.CONNECTORS_ERROR_TYPES = CONNECTORS_ERROR_TYPES;
exports.CONNECTOR_PROVIDERS = CONNECTOR_PROVIDERS;
exports.CONVERSATION_ERROR_TYPES = CONVERSATION_ERROR_TYPES;
exports.CREDENTIALS_PROVIDERS = CREDENTIALS_PROVIDERS;
exports.CheckBigQueryCredentialsSchema = CheckBigQueryCredentialsSchema;
exports.CheckFileGenericResponseSchema = CheckFileGenericResponseSchema;
exports.ConfluenceClientError = ConfluenceClientError;
exports.ConfluenceCommandSchema = ConfluenceCommandSchema;
exports.ConfluenceMeResponseSchema = ConfluenceMeResponseSchema;
exports.ConfluenceUpsertPageResponseSchema = ConfluenceUpsertPageResponseSchema;
exports.ConnectorConfigurationTypeSchema = ConnectorConfigurationTypeSchema;
exports.ConnectorCreateRequestBodySchema = ConnectorCreateRequestBodySchema;
exports.ConnectorsAPI = ConnectorsAPI;
exports.ConnectorsCommandSchema = ConnectorsCommandSchema;
exports.ContentNodesViewTypeCodec = ContentNodesViewTypeCodec;
exports.ContentSchema = ContentSchema;
exports.ConversationError = ConversationError;
exports.CoreAPI = CoreAPI;
exports.CoreAPIDatasourceViewFilterSchema = CoreAPIDatasourceViewFilterSchema;
exports.CoreAPINodesSearchFilterSchema = CoreAPINodesSearchFilterSchema;
exports.CoreAPISearchScopeSchema = CoreAPISearchScopeSchema;
exports.CrawlingFrequencies = CrawlingFrequencies;
exports.CrawlingModes = CrawlingModes;
exports.CreatePlanFormSchema = CreatePlanFormSchema;
exports.CreateTemplateFormSchema = CreateTemplateFormSchema;
exports.DATA_SOURCE_VIEW_CATEGORIES = DATA_SOURCE_VIEW_CATEGORIES;
exports.DEEPSEEK_CHAT_MODEL_CONFIG = DEEPSEEK_CHAT_MODEL_CONFIG;
exports.DEEPSEEK_CHAT_MODEL_ID = DEEPSEEK_CHAT_MODEL_ID;
exports.DEEPSEEK_REASONER_MODEL_CONFIG = DEEPSEEK_REASONER_MODEL_CONFIG;
exports.DEEPSEEK_REASONER_MODEL_ID = DEEPSEEK_REASONER_MODEL_ID;
exports.DEFAULT_EMBEDDING_PROVIDER_ID = DEFAULT_EMBEDDING_PROVIDER_ID;
exports.DEFAULT_MAX_STEPS_USE_PER_RUN = DEFAULT_MAX_STEPS_USE_PER_RUN;
exports.DEFAULT_QDRANT_CLUSTER = DEFAULT_QDRANT_CLUSTER;
exports.DEPTH_DISPLAY_TEXT = DEPTH_DISPLAY_TEXT;
exports.DepthOptions = DepthOptions;
exports.DocumentDeletionKey = DocumentDeletionKey;
exports.DocumentViewRawContentKey = DocumentViewRawContentKey;
exports.EMBEDDING_CONFIGS = EMBEDDING_CONFIGS;
exports.EMBEDDING_PROVIDER_IDS = EMBEDDING_PROVIDER_IDS;
exports.EXCLUDE_DATABASES = EXCLUDE_DATABASES;
exports.EXCLUDE_SCHEMAS = EXCLUDE_SCHEMAS;
exports.EmbeddingProviderCodec = EmbeddingProviderCodec;
exports.EnterpriseUpgradeFormSchema = EnterpriseUpgradeFormSchema;
exports.EnvironmentConfig = EnvironmentConfig;
exports.Err = Err;
exports.FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG = FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG;
exports.FIREWORKS_DEEPSEEK_R1_MODEL_ID = FIREWORKS_DEEPSEEK_R1_MODEL_ID;
exports.FREQUENCY_DISPLAY_TEXT = FREQUENCY_DISPLAY_TEXT;
exports.FrontDataSourceDocumentSection = FrontDataSourceDocumentSection;
exports.GEMINI_1_5_FLASH_LATEST_MODEL_ID = GEMINI_1_5_FLASH_LATEST_MODEL_ID;
exports.GEMINI_1_5_PRO_LATEST_MODEL_ID = GEMINI_1_5_PRO_LATEST_MODEL_ID;
exports.GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG = GEMINI_2_FLASH_LITE_PREVIEW_MODEL_CONFIG;
exports.GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID = GEMINI_2_FLASH_LITE_PREVIEW_MODEL_ID;
exports.GEMINI_2_FLASH_MODEL_CONFIG = GEMINI_2_FLASH_MODEL_CONFIG;
exports.GEMINI_2_FLASH_MODEL_ID = GEMINI_2_FLASH_MODEL_ID;
exports.GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG = GEMINI_2_FLASH_PREVIEW_MODEL_CONFIG;
exports.GEMINI_2_FLASH_PREVIEW_MODEL_ID = GEMINI_2_FLASH_PREVIEW_MODEL_ID;
exports.GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG = GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_CONFIG;
exports.GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID = GEMINI_2_FLASH_THINKING_PREVIEW_MODEL_ID;
exports.GEMINI_2_PRO_PREVIEW_MODEL_CONFIG = GEMINI_2_PRO_PREVIEW_MODEL_CONFIG;
exports.GEMINI_2_PRO_PREVIEW_MODEL_ID = GEMINI_2_PRO_PREVIEW_MODEL_ID;
exports.GEMINI_FLASH_DEFAULT_MODEL_CONFIG = GEMINI_FLASH_DEFAULT_MODEL_CONFIG;
exports.GEMINI_PRO_DEFAULT_MODEL_CONFIG = GEMINI_PRO_DEFAULT_MODEL_CONFIG;
exports.GPT_3_5_TURBO_MODEL_CONFIG = GPT_3_5_TURBO_MODEL_CONFIG;
exports.GPT_3_5_TURBO_MODEL_ID = GPT_3_5_TURBO_MODEL_ID;
exports.GPT_4O_20240806_MODEL_CONFIG = GPT_4O_20240806_MODEL_CONFIG;
exports.GPT_4O_20240806_MODEL_ID = GPT_4O_20240806_MODEL_ID;
exports.GPT_4O_MINI_MODEL_CONFIG = GPT_4O_MINI_MODEL_CONFIG;
exports.GPT_4O_MINI_MODEL_ID = GPT_4O_MINI_MODEL_ID;
exports.GPT_4O_MODEL_CONFIG = GPT_4O_MODEL_CONFIG;
exports.GPT_4O_MODEL_ID = GPT_4O_MODEL_ID;
exports.GPT_4_TURBO_MODEL_CONFIG = GPT_4_TURBO_MODEL_CONFIG;
exports.GPT_4_TURBO_MODEL_ID = GPT_4_TURBO_MODEL_ID;
exports.GROUP_KINDS = GROUP_KINDS;
exports.GetAgentConfigurationsHistoryQuerySchema = GetAgentConfigurationsHistoryQuerySchema;
exports.GetAgentConfigurationsLeaderboardQuerySchema = GetAgentConfigurationsLeaderboardQuerySchema;
exports.GetAgentConfigurationsQuerySchema = GetAgentConfigurationsQuerySchema;
exports.GetParentsResponseSchema = GetParentsResponseSchema;
exports.GetPostNotionSyncResponseBodySchema = GetPostNotionSyncResponseBodySchema;
exports.GithubCommandSchema = GithubCommandSchema;
exports.GoogleDriveCommandSchema = GoogleDriveCommandSchema;
exports.IntercomCheckConversationResponseSchema = IntercomCheckConversationResponseSchema;
exports.IntercomCheckMissingConversationsResponseSchema = IntercomCheckMissingConversationsResponseSchema;
exports.IntercomCheckTeamsResponseSchema = IntercomCheckTeamsResponseSchema;
exports.IntercomCommandSchema = IntercomCommandSchema;
exports.IntercomFetchArticlesResponseSchema = IntercomFetchArticlesResponseSchema;
exports.IntercomFetchConversationResponseSchema = IntercomFetchConversationResponseSchema;
exports.IntercomForceResyncArticlesResponseSchema = IntercomForceResyncArticlesResponseSchema;
exports.InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema = InternalPostBuilderProcessActionGenerateSchemaRequestBodySchema;
exports.InternalPostBuilderSuggestionsRequestBodySchema = InternalPostBuilderSuggestionsRequestBodySchema;
exports.InternalPostContentFragmentRequestBodySchema = InternalPostContentFragmentRequestBodySchema;
exports.InternalPostConversationsRequestBodySchema = InternalPostConversationsRequestBodySchema;
exports.InternalPostMessagesRequestBodySchema = InternalPostMessagesRequestBodySchema;
exports.InvalidStructuredDataHeaderError = InvalidStructuredDataHeaderError;
exports.InviteMemberFormSchema = InviteMemberFormSchema;
exports.MAX_CHUNK_SIZE = MAX_CHUNK_SIZE;
exports.MAX_FILE_SIZES = MAX_FILE_SIZES;
exports.MAX_MESSAGE_TIMEFRAMES = MAX_MESSAGE_TIMEFRAMES;
exports.MAX_STEPS_USE_PER_RUN_LIMIT = MAX_STEPS_USE_PER_RUN_LIMIT;
exports.MEMBERSHIP_ROLE_TYPES = MEMBERSHIP_ROLE_TYPES;
exports.MIME_TYPES = MIME_TYPES;
exports.MIN_SEARCH_QUERY_SIZE = MIN_SEARCH_QUERY_SIZE;
exports.MISTRAL_CODESTRAL_MODEL_CONFIG = MISTRAL_CODESTRAL_MODEL_CONFIG;
exports.MISTRAL_CODESTRAL_MODEL_ID = MISTRAL_CODESTRAL_MODEL_ID;
exports.MISTRAL_LARGE_MODEL_CONFIG = MISTRAL_LARGE_MODEL_CONFIG;
exports.MISTRAL_LARGE_MODEL_ID = MISTRAL_LARGE_MODEL_ID;
exports.MISTRAL_MEDIUM_MODEL_CONFIG = MISTRAL_MEDIUM_MODEL_CONFIG;
exports.MISTRAL_MEDIUM_MODEL_ID = MISTRAL_MEDIUM_MODEL_ID;
exports.MISTRAL_SMALL_MODEL_CONFIG = MISTRAL_SMALL_MODEL_CONFIG;
exports.MISTRAL_SMALL_MODEL_ID = MISTRAL_SMALL_MODEL_ID;
exports.MODEL_IDS = MODEL_IDS;
exports.MODEL_PROVIDER_IDS = MODEL_PROVIDER_IDS;
exports.MULTI_ACTION_PRESETS = MULTI_ACTION_PRESETS;
exports.MicrosoftCommandSchema = MicrosoftCommandSchema;
exports.ModelIdCodec = ModelIdCodec;
exports.ModelProviderIdCodec = ModelProviderIdCodec;
exports.MultiActionPresetCodec = MultiActionPresetCodec;
exports.NotionCheckUrlResponseSchema = NotionCheckUrlResponseSchema;
exports.NotionCommandSchema = NotionCommandSchema;
exports.NotionDeleteUrlResponseSchema = NotionDeleteUrlResponseSchema;
exports.NotionFindUrlResponseSchema = NotionFindUrlResponseSchema;
exports.NotionMeResponseSchema = NotionMeResponseSchema;
exports.NotionSearchPagesResponseSchema = NotionSearchPagesResponseSchema;
exports.NotionUpsertResponseSchema = NotionUpsertResponseSchema;
exports.NumberAsStringCodec = NumberAsStringCodec;
exports.O1_HIGH_REASONING_MODEL_CONFIG = O1_HIGH_REASONING_MODEL_CONFIG;
exports.O1_MINI_MODEL_CONFIG = O1_MINI_MODEL_CONFIG;
exports.O1_MINI_MODEL_ID = O1_MINI_MODEL_ID;
exports.O1_MODEL_CONFIG = O1_MODEL_CONFIG;
exports.O1_MODEL_ID = O1_MODEL_ID;
exports.O3_MINI_HIGH_REASONING_MODEL_CONFIG = O3_MINI_HIGH_REASONING_MODEL_CONFIG;
exports.O3_MINI_MODEL_CONFIG = O3_MINI_MODEL_CONFIG;
exports.O3_MINI_MODEL_ID = O3_MINI_MODEL_ID;
exports.OAUTH_PROVIDERS = OAUTH_PROVIDERS;
exports.OAUTH_USE_CASES = OAUTH_USE_CASES;
exports.OAuthAPI = OAuthAPI;
exports.Ok = Ok;
exports.PROCESS_ACTION_TOP_K = PROCESS_ACTION_TOP_K;
exports.PROCESS_SCHEMA_ALLOWED_TYPES = PROCESS_SCHEMA_ALLOWED_TYPES;
exports.PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS;
exports.ParsedNotionDatabaseSchema = ParsedNotionDatabaseSchema;
exports.PatchDataSourceTableRequestBodySchema = PatchDataSourceTableRequestBodySchema;
exports.PatchDataSourceViewSchema = PatchDataSourceViewSchema;
exports.PatchSpaceMembersRequestBodySchema = PatchSpaceMembersRequestBodySchema;
exports.PatchSpaceRequestBodySchema = PatchSpaceRequestBodySchema;
exports.PostDataSourceDocumentRequestBodySchema = PostDataSourceDocumentRequestBodySchema;
exports.PostDataSourceViewSchema = PostDataSourceViewSchema;
exports.PostDataSourceWithNameDocumentRequestBodySchema = PostDataSourceWithNameDocumentRequestBodySchema;
exports.PostNotionSyncPayloadSchema = PostNotionSyncPayloadSchema;
exports.PostOrPatchAgentConfigurationRequestBodySchema = PostOrPatchAgentConfigurationRequestBodySchema;
exports.PostSpaceRequestBodySchema = PostSpaceRequestBodySchema;
exports.RATE_LIMITER_PREFIX = RATE_LIMITER_PREFIX;
exports.REASONING_EFFORT_IDS = REASONING_EFFORT_IDS;
exports.ROLES = ROLES;
exports.RateLimitError = RateLimitError;
exports.ReasoningEffortCodec = ReasoningEffortCodec;
exports.RoleSchema = RoleSchema;
exports.SUBSCRIPTION_STATUSES = SUBSCRIPTION_STATUSES;
exports.SUPPORTED_MODEL_CONFIGS = SUPPORTED_MODEL_CONFIGS;
exports.SUPPORTED_OPERATIONS = SUPPORTED_OPERATIONS;
exports.SalesforceCredentialsSchema = SalesforceCredentialsSchema;
exports.SlackCommandSchema = SlackCommandSchema;
exports.SlackConfigurationTypeSchema = SlackConfigurationTypeSchema;
exports.SlugifiedString = SlugifiedString;
exports.SnowflakeCredentialsSchema = SnowflakeCredentialsSchema;
exports.TABLE_PREFIX = TABLE_PREFIX;
exports.TEMPLATES_TAGS_CONFIG = TEMPLATES_TAGS_CONFIG;
exports.TEMPLATES_TAG_CODES = TEMPLATES_TAG_CODES;
exports.TEMPLATE_VISIBILITIES = TEMPLATE_VISIBILITIES;
exports.TIME_FRAME_UNITS = TIME_FRAME_UNITS;
exports.TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG = TOGETHERAI_DEEPSEEK_R1_MODEL_CONFIG;
exports.TOGETHERAI_DEEPSEEK_R1_MODEL_ID = TOGETHERAI_DEEPSEEK_R1_MODEL_ID;
exports.TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG = TOGETHERAI_DEEPSEEK_V3_MODEL_CONFIG;
exports.TOGETHERAI_DEEPSEEK_V3_MODEL_ID = TOGETHERAI_DEEPSEEK_V3_MODEL_ID;
exports.TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG = TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_CONFIG;
exports.TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID = TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID;
exports.TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG = TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_CONFIG;
exports.TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID = TOGETHERAI_QWEN_2_5_CODER_32B_INSTRUCT_MODEL_ID;
exports.TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG = TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_CONFIG;
exports.TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID = TOGETHERAI_QWEN_72B_INSTRUCT_MODEL_ID;
exports.TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG = TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_CONFIG;
exports.TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID = TOGETHERAI_QWEN_QWQ_32B_PREVIEW_MODEL_ID;
exports.TRACKER_FREQUENCIES = TRACKER_FREQUENCIES;
exports.TemplateVisibilityCodec = TemplateVisibilityCodec;
exports.TemporalCheckQueueResponseSchema = TemporalCheckQueueResponseSchema;
exports.TemporalCommandSchema = TemporalCommandSchema;
exports.TemporalUnprocessedWorkflowsResponseSchema = TemporalUnprocessedWorkflowsResponseSchema;
exports.TextExtraction = TextExtraction;
exports.TimeframeUnitCodec = TimeframeUnitCodec;
exports.UNIQUE_SPACE_KINDS = UNIQUE_SPACE_KINDS;
exports.UpdateConnectorConfigurationTypeSchema = UpdateConnectorConfigurationTypeSchema;
exports.UpdateConnectorRequestBodySchema = UpdateConnectorRequestBodySchema;
exports.UpsertContextSchema = UpsertContextSchema;
exports.WEBCRAWLER_DEFAULT_CONFIGURATION = WEBCRAWLER_DEFAULT_CONFIGURATION;
exports.WEBCRAWLER_MAX_DEPTH = WEBCRAWLER_MAX_DEPTH;
exports.WEBCRAWLER_MAX_PAGES = WEBCRAWLER_MAX_PAGES;
exports.WHITELISTABLE_FEATURES = WHITELISTABLE_FEATURES;
exports.WebCrawlerConfigurationTypeSchema = WebCrawlerConfigurationTypeSchema;
exports.WebCrawlerHeaderRedactedValue = WebCrawlerHeaderRedactedValue;
exports.WebcrawlerCommandSchema = WebcrawlerCommandSchema;
exports.WebsearchActionOutputSchema = WebsearchActionOutputSchema;
exports.WebsearchAppActionOutputSchema = WebsearchAppActionOutputSchema;
exports.ZendeskCheckIsAdminResponseSchema = ZendeskCheckIsAdminResponseSchema;
exports.ZendeskCommandSchema = ZendeskCommandSchema;
exports.ZendeskCountTicketsResponseSchema = ZendeskCountTicketsResponseSchema;
exports.ZendeskFetchBrandResponseSchema = ZendeskFetchBrandResponseSchema;
exports.ZendeskFetchTicketResponseSchema = ZendeskFetchTicketResponseSchema;
exports.assertNever = assertNever;
exports.cacheWithRedis = cacheWithRedis;
exports.compareAgentsForSort = compareAgentsForSort;
exports.concurrentExecutor = concurrentExecutor;
exports.connectionStrategyToHumanReadable = connectionStrategyToHumanReadable;
exports.contentTypeForExtension = contentTypeForExtension;
exports.createIoTsCodecFromArgs = createIoTsCodecFromArgs;
exports.createRangeCodec = createRangeCodec;
exports.credentialsFromProviders = credentialsFromProviders;
exports.decrypt = decrypt;
exports.defaultSelectionConfiguration = defaultSelectionConfiguration;
exports.dustManagedCredentials = dustManagedCredentials;
exports.encrypt = encrypt;
exports.ensureFileSize = ensureFileSize;
exports.errorToString = errorToString;
exports.expireRateLimiterKey = expireRateLimiterKey;
exports.extensionsForContentType = extensionsForContentType;
exports.formatUserFullName = formatUserFullName;
exports.generateTailwindBackgroundColors = generateTailwindBackgroundColors;
exports.getConnectionCredentials = getConnectionCredentials;
exports.getDustAppRunResultsFileTitle = getDustAppRunResultsFileTitle;
exports.getFileFormatCategory = getFileFormatCategory;
exports.getGlobalAgentAuthorName = getGlobalAgentAuthorName;
exports.getGoogleIdsFromSheetContentNodeInternalId = getGoogleIdsFromSheetContentNodeInternalId;
exports.getGoogleSheetContentNodeInternalId = getGoogleSheetContentNodeInternalId;
exports.getGoogleSheetTableId = getGoogleSheetTableId;
exports.getGroupIdsFromHeaders = getGroupIdsFromHeaders;
exports.getHeaderFromGroupIds = getHeaderFromGroupIds;
exports.getHeaderFromUserEmail = getHeaderFromUserEmail;
exports.getIntercomSyncWorkflowId = getIntercomSyncWorkflowId;
exports.getLargeWhitelistedModel = getLargeWhitelistedModel;
exports.getNotionDatabaseTableId = getNotionDatabaseTableId;
exports.getNotionDatabaseTableIdFromContentNodeInternalId = getNotionDatabaseTableIdFromContentNodeInternalId;
exports.getNotionWorkflowId = getNotionWorkflowId;
exports.getOAuthConnectionAccessToken = getOAuthConnectionAccessToken;
exports.getProviderFromRetrievedDocument = getProviderFromRetrievedDocument;
exports.getSanitizedHeaders = getSanitizedHeaders;
exports.getSmallWhitelistedModel = getSmallWhitelistedModel;
exports.getSupportedFileExtensions = getSupportedFileExtensions;
exports.getSupportedInlinedContentType = getSupportedInlinedContentType;
exports.getSupportedNonImageFileExtensions = getSupportedNonImageFileExtensions;
exports.getSupportedNonImageMimeTypes = getSupportedNonImageMimeTypes;
exports.getTablesQueryResultsFileAttachments = getTablesQueryResultsFileAttachments;
exports.getTablesQueryResultsFileTitle = getTablesQueryResultsFileTitle;
exports.getTimeframeSecondsFromLiteral = getTimeframeSecondsFromLiteral;
exports.getTitleFromRetrievedDocument = getTitleFromRetrievedDocument;
exports.getUserEmailFromHeaders = getUserEmailFromHeaders;
exports.getZendeskGarbageCollectionWorkflowId = getZendeskGarbageCollectionWorkflowId;
exports.getZendeskSyncWorkflowId = getZendeskSyncWorkflowId;
exports.googleDriveIncrementalSyncWorkflowId = googleDriveIncrementalSyncWorkflowId;
exports.guessDelimiter = guessDelimiter;
exports.hasRolePermissions = hasRolePermissions;
exports.ioTsEnum = ioTsEnum;
exports.ioTsParsePayload = ioTsParsePayload;
exports.isAPIError = isAPIError;
exports.isAPIErrorResponse = isAPIErrorResponse;
exports.isActionResponseBase = isActionResponseBase;
exports.isActiveRoleType = isActiveRoleType;
exports.isAdmin = isAdmin;
exports.isAgentMention = isAgentMention;
exports.isAgentMessageType = isAgentMessageType;
exports.isBaseActionClass = isBaseActionClass;
exports.isBigFileSize = isBigFileSize;
exports.isBigQueryWithLocationCredentials = isBigQueryWithLocationCredentials;
exports.isBrowseActionType = isBrowseActionType;
exports.isBrowseConfiguration = isBrowseConfiguration;
exports.isBuilder = isBuilder;
exports.isConfluenceNotFoundError = isConfluenceNotFoundError;
exports.isConnectorError = isConnectorError;
exports.isConnectorProvider = isConnectorProvider;
exports.isConnectorsAPIError = isConnectorsAPIError;
exports.isContentFragmentInputWithContentType = isContentFragmentInputWithContentType;
exports.isContentFragmentMessageTypeModel = isContentFragmentMessageTypeModel;
exports.isContentFragmentType = isContentFragmentType;
exports.isConversationIncludeFileConfiguration = isConversationIncludeFileConfiguration;
exports.isConversationIncludeFileConfigurationActionType = isConversationIncludeFileConfigurationActionType;
exports.isCoreAPIError = isCoreAPIError;
exports.isCredentialProvider = isCredentialProvider;
exports.isDataSourceNameValid = isDataSourceNameValid;
exports.isDataSourceViewCategoryWithoutApps = isDataSourceViewCategoryWithoutApps;
exports.isDepthOption = isDepthOption;
exports.isDevelopment = isDevelopment;
exports.isDisplayCodeRequest = isDisplayCodeRequest;
exports.isDownloadFileRequest = isDownloadFileRequest;
exports.isDustAppRunActionType = isDustAppRunActionType;
exports.isDustAppRunConfiguration = isDustAppRunConfiguration;
exports.isDustWorkspace = isDustWorkspace;
exports.isEmptyString = isEmptyString;
exports.isGetCodeToExecuteRequest = isGetCodeToExecuteRequest;
exports.isGetFileRequest = isGetFileRequest;
exports.isGlobalGroupKind = isGlobalGroupKind;
exports.isGoogleSheetContentNodeInternalId = isGoogleSheetContentNodeInternalId;
exports.isGroupKind = isGroupKind;
exports.isMaxMessagesTimeframeType = isMaxMessagesTimeframeType;
exports.isMembershipRoleType = isMembershipRoleType;
exports.isModelId = isModelId;
exports.isModelProviderId = isModelProviderId;
exports.isModjoCredentials = isModjoCredentials;
exports.isOAuthAPIError = isOAuthAPIError;
exports.isOAuthConnectionType = isOAuthConnectionType;
exports.isOAuthProvider = isOAuthProvider;
exports.isOAuthUseCase = isOAuthUseCase;
exports.isOnlyAdmin = isOnlyAdmin;
exports.isOnlyBuilder = isOnlyBuilder;
exports.isOnlyUser = isOnlyUser;
exports.isProcessActionType = isProcessActionType;
exports.isProcessConfiguration = isProcessConfiguration;
exports.isProviderWhitelisted = isProviderWhitelisted;
exports.isProviderWithWorkspaceConfiguration = isProviderWithWorkspaceConfiguration;
exports.isPublicySupportedUseCase = isPublicySupportedUseCase;
exports.isReasoningConfiguration = isReasoningConfiguration;
exports.isRetrievalActionType = isRetrievalActionType;
exports.isRetrievalConfiguration = isRetrievalConfiguration;
exports.isRowMatchingSchema = isRowMatchingSchema;
exports.isSalesforceCredentials = isSalesforceCredentials;
exports.isSearchLabelsConfiguration = isSearchLabelsConfiguration;
exports.isSetContentHeightRequest = isSetContentHeightRequest;
exports.isSetErrorMessageRequest = isSetErrorMessageRequest;
exports.isSlackAutoReadPatterns = isSlackAutoReadPatterns;
exports.isSlackbotWhitelistType = isSlackbotWhitelistType;
exports.isSlugified = isSlugified;
exports.isSnowflakeCredentials = isSnowflakeCredentials;
exports.isString = isString;
exports.isSupportedDelimitedTextContentType = isSupportedDelimitedTextContentType;
exports.isSupportedEnterpriseConnectionStrategy = isSupportedEnterpriseConnectionStrategy;
exports.isSupportedFileContentType = isSupportedFileContentType;
exports.isSupportedImageContentType = isSupportedImageContentType;
exports.isSupportedModel = isSupportedModel;
exports.isSupportedResourceType = isSupportedResourceType;
exports.isSystemGroupKind = isSystemGroupKind;
exports.isTablesQueryActionType = isTablesQueryActionType;
exports.isTablesQueryConfiguration = isTablesQueryConfiguration;
exports.isTemplateTagCodeArray = isTemplateTagCodeArray;
exports.isTextContent = isTextContent;
exports.isTextExtractionSupportedContentType = isTextExtractionSupportedContentType;
exports.isTimeFrame = isTimeFrame;
exports.isUniqueSpaceKind = isUniqueSpaceKind;
exports.isUser = isUser;
exports.isUserMessageType = isUserMessageType;
exports.isUserMessageTypeModel = isUserMessageTypeModel;
exports.isValidContentNodesViewType = isValidContentNodesViewType;
exports.isValidDataSourceViewCategory = isValidDataSourceViewCategory;
exports.isValidDate = isValidDate;
exports.isValidSalesforceClientId = isValidSalesforceClientId;
exports.isValidSalesforceClientSecret = isValidSalesforceClientSecret;
exports.isValidSalesforceDomain = isValidSalesforceDomain;
exports.isValidZendeskSubdomain = isValidZendeskSubdomain;
exports.isVisualizationRPCRequest = isVisualizationRPCRequest;
exports.isWebCrawlerConfiguration = isWebCrawlerConfiguration;
exports.isWebsearchActionType = isWebsearchActionType;
exports.isWebsearchConfiguration = isWebsearchConfiguration;
exports.isWebsiteOrFolderCategory = isWebsiteOrFolderCategory;
exports.isWhitelistableFeature = isWhitelistableFeature;
exports.labsTranscriptsProviders = labsTranscriptsProviders;
exports.makeConfluenceSyncWorkflowId = makeConfluenceSyncWorkflowId;
exports.maxFileSizeToHumanReadable = maxFileSizeToHumanReadable;
exports.md5 = md5;
exports.microsoftGarbageCollectionWorkflowId = microsoftGarbageCollectionWorkflowId;
exports.microsoftIncrementalSyncWorkflowId = microsoftIncrementalSyncWorkflowId;
exports.normalizeError = normalizeError;
exports.pagePrefixesPerMimeType = pagePrefixesPerMimeType;
exports.parseAndStringifyCsv = parseAndStringifyCsv;
exports.pluralize = pluralize;
exports.prettifyGroupName = prettifyGroupName;
exports.rateLimiter = rateLimiter;
exports.redactString = redactString;
exports.removeNulls = removeNulls;
exports.renderSchemaPropertiesAsJSONSchema = renderSchemaPropertiesAsJSONSchema;
exports.safeParseJSON = safeParseJSON;
exports.safeSubstring = safeSubstring;
exports.sanitizeString = sanitizeString;
exports.sectionFullText = sectionFullText;
exports.sendInitDbMessage = sendInitDbMessage;
exports.sendUserOperationMessage = sendUserOperationMessage;
exports.setupGlobalErrorHandler = setupGlobalErrorHandler;
exports.setupOAuthConnection = setupOAuthConnection;
exports.slugify = slugify;
exports.stripNullBytes = stripNullBytes;
exports.supportedEnterpriseConnectionStrategies = supportedEnterpriseConnectionStrategies;
exports.supportedResourceTypes = supportedResourceTypes;
exports.supportedUploadableContentType = supportedUploadableContentType;
exports.throwIfInvalidAgentConfiguration = throwIfInvalidAgentConfiguration;
exports.truncate = truncate;
exports.validCommands = validCommands;
exports.withRetries = withRetries;
//# sourceMappingURL=types.cjs.development.js.map
