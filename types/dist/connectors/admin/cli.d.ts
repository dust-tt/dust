import * as t from "io-ts";
export declare const ConnectorsCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"connectors">;
    command: t.UnionC<[t.LiteralC<"stop">, t.LiteralC<"delete">, t.LiteralC<"pause">, t.LiteralC<"unpause">, t.LiteralC<"resume">, t.LiteralC<"full-resync">, t.LiteralC<"set-error">, t.LiteralC<"clear-error">, t.LiteralC<"restart">, t.LiteralC<"get-parents">, t.LiteralC<"set-permission">, t.LiteralC<"garbage-collect">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type ConnectorsCommandType = t.TypeOf<typeof ConnectorsCommandSchema>;
/**
 * <Confluence>
 */
export declare const ConfluenceCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"confluence">;
    command: t.UnionC<[t.LiteralC<"me">, t.LiteralC<"upsert-page">, t.LiteralC<"upsert-pages">, t.LiteralC<"update-parents">]>;
    args: t.TypeC<{
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        pageId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        spaceId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        file: t.UnionC<[t.StringC, t.UndefinedC]>;
        keyInFile: t.UnionC<[t.StringC, t.UndefinedC]>;
    }>;
}>;
export type ConfluenceCommandType = t.TypeOf<typeof ConfluenceCommandSchema>;
export declare const ConfluenceMeResponseSchema: t.TypeC<{
    me: t.UnknownRecordC;
}>;
export type ConfluenceMeResponseType = t.TypeOf<typeof ConfluenceMeResponseSchema>;
export declare const ConfluenceUpsertPageResponseSchema: t.TypeC<{
    workflowId: t.StringC;
    workflowUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
}>;
export type ConfluenceUpsertPageResponseType = t.TypeOf<typeof ConfluenceUpsertPageResponseSchema>;
/**
 * </Confluence>
 */
export declare const GithubCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"github">;
    command: t.UnionC<[t.LiteralC<"resync-repo">, t.LiteralC<"code-sync">, t.LiteralC<"sync-issue">, t.LiteralC<"force-daily-code-sync">, t.LiteralC<"skip-issue">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type GithubCommandType = t.TypeOf<typeof GithubCommandSchema>;
export declare const NotionCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"notion">;
    command: t.UnionC<[t.LiteralC<"skip-page">, t.LiteralC<"skip-database">, t.LiteralC<"upsert-page">, t.LiteralC<"upsert-database">, t.LiteralC<"search-pages">, t.LiteralC<"update-core-parents">, t.LiteralC<"check-url">, t.LiteralC<"find-url">, t.LiteralC<"delete-url">, t.LiteralC<"me">, t.LiteralC<"stop-all-garbage-collectors">, t.LiteralC<"update-parents-fields">, t.LiteralC<"clear-parents-last-updated-at">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type NotionCommandType = t.TypeOf<typeof NotionCommandSchema>;
export declare const GoogleDriveCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"google_drive">;
    command: t.UnionC<[t.LiteralC<"garbage-collect-all">, t.LiteralC<"get-file">, t.LiteralC<"check-file">, t.LiteralC<"get-google-parents">, t.LiteralC<"clean-invalid-parents">, t.LiteralC<"upsert-file">, t.LiteralC<"update-core-parents">, t.LiteralC<"restart-google-webhooks">, t.LiteralC<"start-incremental-sync">, t.LiteralC<"restart-all-incremental-sync-workflows">, t.LiteralC<"skip-file">, t.LiteralC<"register-webhook">, t.LiteralC<"register-all-webhooks">, t.LiteralC<"list-labels">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type GoogleDriveCommandType = t.TypeOf<typeof GoogleDriveCommandSchema>;
export declare const SlackCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"slack">;
    command: t.UnionC<[t.LiteralC<"enable-bot">, t.LiteralC<"sync-channel">, t.LiteralC<"sync-thread">, t.LiteralC<"uninstall-for-unknown-team-ids">, t.LiteralC<"whitelist-domains">, t.LiteralC<"whitelist-bot">, t.LiteralC<"sync-channel-metadata">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type SlackCommandType = t.TypeOf<typeof SlackCommandSchema>;
export declare const BatchCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"batch">;
    command: t.UnionC<[t.LiteralC<"full-resync">, t.LiteralC<"restart-all">, t.LiteralC<"stop-all">, t.LiteralC<"resume-all">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type BatchCommandType = t.TypeOf<typeof BatchCommandSchema>;
export declare const WebcrawlerCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"webcrawler">;
    command: t.LiteralC<"start-scheduler">;
}>;
export declare const BatchAllResponseSchema: t.TypeC<{
    succeeded: t.NumberC;
    failed: t.NumberC;
}>;
export type BatchAllResponseType = t.TypeOf<typeof BatchAllResponseSchema>;
export type WebcrawlerCommandType = t.TypeOf<typeof WebcrawlerCommandSchema>;
export declare const TemporalCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"temporal">;
    command: t.UnionC<[t.LiteralC<"find-unprocessed-workflows">, t.LiteralC<"check-queue">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type TemporalCommandType = t.TypeOf<typeof TemporalCommandSchema>;
/**
 * <Intercom>
 */
export declare const IntercomCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"intercom">;
    command: t.UnionC<[t.LiteralC<"force-resync-articles">, t.LiteralC<"check-conversation">, t.LiteralC<"fetch-conversation">, t.LiteralC<"fetch-articles">, t.LiteralC<"check-missing-conversations">, t.LiteralC<"check-teams">]>;
    args: t.TypeC<{
        force: t.UnionC<[t.LiteralC<"true">, t.UndefinedC]>;
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        conversationId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        day: t.UnionC<[t.StringC, t.UndefinedC]>;
        helpCenterId: t.UnionC<[t.NumberC, t.UndefinedC]>;
    }>;
}>;
export type IntercomCommandType = t.TypeOf<typeof IntercomCommandSchema>;
export declare const IntercomCheckConversationResponseSchema: t.TypeC<{
    isConversationOnIntercom: t.BooleanC;
    isConversationOnDB: t.BooleanC;
    conversationTeamIdOnIntercom: t.UnionC<[t.StringC, t.UndefinedC]>;
    conversationTeamIdOnDB: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
}>;
export type IntercomCheckConversationResponseType = t.TypeOf<typeof IntercomCheckConversationResponseSchema>;
export declare const IntercomFetchConversationResponseSchema: t.TypeC<{
    conversation: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>;
export type IntercomFetchConversationResponseType = t.TypeOf<typeof IntercomFetchConversationResponseSchema>;
export declare const IntercomFetchArticlesResponseSchema: t.TypeC<{
    articles: t.ArrayC<t.UnionC<[t.UnknownRecordC, t.NullC]>>;
}>;
export type IntercomFetchArticlesResponseType = t.TypeOf<typeof IntercomFetchArticlesResponseSchema>;
export declare const IntercomCheckTeamsResponseSchema: t.TypeC<{
    teams: t.ArrayC<t.TypeC<{
        teamId: t.StringC;
        name: t.StringC;
        isTeamOnDB: t.BooleanC;
    }>>;
}>;
export type IntercomCheckTeamsResponseType = t.TypeOf<typeof IntercomCheckTeamsResponseSchema>;
export declare const IntercomCheckMissingConversationsResponseSchema: t.TypeC<{
    missingConversations: t.ArrayC<t.TypeC<{
        conversationId: t.StringC;
        teamId: t.UnionC<[t.NumberC, t.NullC]>;
        open: t.BooleanC;
        createdAt: t.NumberC;
    }>>;
}>;
export type IntercomCheckMissingConversationsResponseType = t.TypeOf<typeof IntercomCheckMissingConversationsResponseSchema>;
export declare const IntercomForceResyncArticlesResponseSchema: t.TypeC<{
    affectedCount: t.NumberC;
}>;
export type IntercomForceResyncArticlesResponseType = t.TypeOf<typeof IntercomForceResyncArticlesResponseSchema>;
/**
 * </ Intercom>
 */
/**
 * <Zendesk>
 */
export declare const ZendeskCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"zendesk">;
    command: t.UnionC<[t.LiteralC<"check-is-admin">, t.LiteralC<"count-tickets">, t.LiteralC<"resync-tickets">, t.LiteralC<"fetch-ticket">, t.LiteralC<"fetch-brand">, t.LiteralC<"resync-help-centers">, t.LiteralC<"resync-brand-metadata">]>;
    args: t.TypeC<{
        wId: t.UnionC<[t.StringC, t.UndefinedC]>;
        dsId: t.UnionC<[t.StringC, t.UndefinedC]>;
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        brandId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        query: t.UnionC<[t.StringC, t.UndefinedC]>;
        forceResync: t.UnionC<[t.LiteralC<"true">, t.UndefinedC]>;
        ticketId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        ticketUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
    }>;
}>;
export type ZendeskCommandType = t.TypeOf<typeof ZendeskCommandSchema>;
export declare const ZendeskCheckIsAdminResponseSchema: t.TypeC<{
    userRole: t.StringC;
    userActive: t.BooleanC;
    userIsAdmin: t.BooleanC;
}>;
export type ZendeskCheckIsAdminResponseType = t.TypeOf<typeof ZendeskCheckIsAdminResponseSchema>;
export declare const ZendeskCountTicketsResponseSchema: t.TypeC<{
    ticketCount: t.NumberC;
}>;
export type ZendeskCountTicketsResponseType = t.TypeOf<typeof ZendeskCountTicketsResponseSchema>;
export declare const ZendeskFetchTicketResponseSchema: t.TypeC<{
    ticket: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    isTicketOnDb: t.BooleanC;
}>;
export type ZendeskFetchTicketResponseType = t.TypeOf<typeof ZendeskFetchTicketResponseSchema>;
export declare const ZendeskFetchBrandResponseSchema: t.TypeC<{
    brand: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    brandOnDb: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>;
export type ZendeskFetchBrandResponseType = t.TypeOf<typeof ZendeskFetchBrandResponseSchema>;
/**
 * </Zendesk>
 */
export declare const MicrosoftCommandSchema: t.TypeC<{
    majorCommand: t.LiteralC<"microsoft">;
    command: t.UnionC<[t.LiteralC<"garbage-collect-all">, t.LiteralC<"check-file">, t.LiteralC<"start-incremental-sync">, t.LiteralC<"restart-all-incremental-sync-workflows">, t.LiteralC<"skip-file">, t.LiteralC<"sync-node">, t.LiteralC<"get-parents">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>;
export type MicrosoftCommandType = t.TypeOf<typeof MicrosoftCommandSchema>;
export declare const AdminCommandSchema: t.UnionC<[t.TypeC<{
    majorCommand: t.LiteralC<"batch">;
    command: t.UnionC<[t.LiteralC<"full-resync">, t.LiteralC<"restart-all">, t.LiteralC<"stop-all">, t.LiteralC<"resume-all">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"connectors">;
    command: t.UnionC<[t.LiteralC<"stop">, t.LiteralC<"delete">, t.LiteralC<"pause">, t.LiteralC<"unpause">, t.LiteralC<"resume">, t.LiteralC<"full-resync">, t.LiteralC<"set-error">, t.LiteralC<"clear-error">, t.LiteralC<"restart">, t.LiteralC<"get-parents">, t.LiteralC<"set-permission">, t.LiteralC<"garbage-collect">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"confluence">;
    command: t.UnionC<[t.LiteralC<"me">, t.LiteralC<"upsert-page">, t.LiteralC<"upsert-pages">, t.LiteralC<"update-parents">]>;
    args: t.TypeC<{
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        pageId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        spaceId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        file: t.UnionC<[t.StringC, t.UndefinedC]>;
        keyInFile: t.UnionC<[t.StringC, t.UndefinedC]>;
    }>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"github">;
    command: t.UnionC<[t.LiteralC<"resync-repo">, t.LiteralC<"code-sync">, t.LiteralC<"sync-issue">, t.LiteralC<"force-daily-code-sync">, t.LiteralC<"skip-issue">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"google_drive">;
    command: t.UnionC<[t.LiteralC<"garbage-collect-all">, t.LiteralC<"get-file">, t.LiteralC<"check-file">, t.LiteralC<"get-google-parents">, t.LiteralC<"clean-invalid-parents">, t.LiteralC<"upsert-file">, t.LiteralC<"update-core-parents">, t.LiteralC<"restart-google-webhooks">, t.LiteralC<"start-incremental-sync">, t.LiteralC<"restart-all-incremental-sync-workflows">, t.LiteralC<"skip-file">, t.LiteralC<"register-webhook">, t.LiteralC<"register-all-webhooks">, t.LiteralC<"list-labels">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"intercom">;
    command: t.UnionC<[t.LiteralC<"force-resync-articles">, t.LiteralC<"check-conversation">, t.LiteralC<"fetch-conversation">, t.LiteralC<"fetch-articles">, t.LiteralC<"check-missing-conversations">, t.LiteralC<"check-teams">]>;
    args: t.TypeC<{
        force: t.UnionC<[t.LiteralC<"true">, t.UndefinedC]>;
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        conversationId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        day: t.UnionC<[t.StringC, t.UndefinedC]>;
        helpCenterId: t.UnionC<[t.NumberC, t.UndefinedC]>;
    }>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"microsoft">;
    command: t.UnionC<[t.LiteralC<"garbage-collect-all">, t.LiteralC<"check-file">, t.LiteralC<"start-incremental-sync">, t.LiteralC<"restart-all-incremental-sync-workflows">, t.LiteralC<"skip-file">, t.LiteralC<"sync-node">, t.LiteralC<"get-parents">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"notion">;
    command: t.UnionC<[t.LiteralC<"skip-page">, t.LiteralC<"skip-database">, t.LiteralC<"upsert-page">, t.LiteralC<"upsert-database">, t.LiteralC<"search-pages">, t.LiteralC<"update-core-parents">, t.LiteralC<"check-url">, t.LiteralC<"find-url">, t.LiteralC<"delete-url">, t.LiteralC<"me">, t.LiteralC<"stop-all-garbage-collectors">, t.LiteralC<"update-parents-fields">, t.LiteralC<"clear-parents-last-updated-at">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"slack">;
    command: t.UnionC<[t.LiteralC<"enable-bot">, t.LiteralC<"sync-channel">, t.LiteralC<"sync-thread">, t.LiteralC<"uninstall-for-unknown-team-ids">, t.LiteralC<"whitelist-domains">, t.LiteralC<"whitelist-bot">, t.LiteralC<"sync-channel-metadata">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"temporal">;
    command: t.UnionC<[t.LiteralC<"find-unprocessed-workflows">, t.LiteralC<"check-queue">]>;
    args: t.RecordC<t.StringC, t.UnionC<[t.StringC, t.Type<string, string, unknown>, t.UndefinedC]>>;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"webcrawler">;
    command: t.LiteralC<"start-scheduler">;
}>, t.TypeC<{
    majorCommand: t.LiteralC<"zendesk">;
    command: t.UnionC<[t.LiteralC<"check-is-admin">, t.LiteralC<"count-tickets">, t.LiteralC<"resync-tickets">, t.LiteralC<"fetch-ticket">, t.LiteralC<"fetch-brand">, t.LiteralC<"resync-help-centers">, t.LiteralC<"resync-brand-metadata">]>;
    args: t.TypeC<{
        wId: t.UnionC<[t.StringC, t.UndefinedC]>;
        dsId: t.UnionC<[t.StringC, t.UndefinedC]>;
        connectorId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        brandId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        query: t.UnionC<[t.StringC, t.UndefinedC]>;
        forceResync: t.UnionC<[t.LiteralC<"true">, t.UndefinedC]>;
        ticketId: t.UnionC<[t.NumberC, t.UndefinedC]>;
        ticketUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
    }>;
}>]>;
export type AdminCommandType = t.TypeOf<typeof AdminCommandSchema>;
export declare const AdminSuccessResponseSchema: t.TypeC<{
    success: t.LiteralC<true>;
}>;
export type AdminSuccessResponseType = t.TypeOf<typeof AdminSuccessResponseSchema>;
export declare const CheckFileGenericResponseSchema: t.TypeC<{
    status: t.NumberC;
    type: t.UnionC<[t.LiteralC<"undefined">, t.LiteralC<"object">, t.LiteralC<"boolean">, t.LiteralC<"number">, t.LiteralC<"string">, t.LiteralC<"function">, t.LiteralC<"symbol">, t.LiteralC<"bigint">]>;
    content: t.UnknownC;
}>;
export type CheckFileGenericResponseType = t.TypeOf<typeof CheckFileGenericResponseSchema>;
export declare const GetParentsResponseSchema: t.TypeC<{
    parents: t.ArrayC<t.StringC>;
}>;
export type GetParentsResponseType = t.TypeOf<typeof GetParentsResponseSchema>;
export declare const NotionUpsertResponseSchema: t.TypeC<{
    workflowId: t.StringC;
    workflowUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
}>;
export type NotionUpsertResponseType = t.TypeOf<typeof NotionUpsertResponseSchema>;
export declare const NotionSearchPagesResponseSchema: t.TypeC<{
    pages: t.ArrayC<t.TypeC<{
        id: t.StringC;
        title: t.UnionC<[t.StringC, t.UndefinedC]>;
        type: t.UnionC<[t.LiteralC<"page">, t.LiteralC<"database">]>;
        isSkipped: t.BooleanC;
        isFull: t.BooleanC;
    }>>;
}>;
export type NotionSearchPagesResponseType = t.TypeOf<typeof NotionSearchPagesResponseSchema>;
export declare const NotionCheckUrlResponseSchema: t.TypeC<{
    page: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    db: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>;
export type NotionCheckUrlResponseType = t.TypeOf<typeof NotionCheckUrlResponseSchema>;
export declare const NotionDeleteUrlResponseSchema: t.TypeC<{
    deletedPage: t.BooleanC;
    deletedDb: t.BooleanC;
}>;
export type NotionDeleteUrlResponseType = t.TypeOf<typeof NotionDeleteUrlResponseSchema>;
export declare const NotionFindUrlResponseSchema: t.TypeC<{
    page: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    db: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>;
export type NotionFindUrlResponseType = t.TypeOf<typeof NotionFindUrlResponseSchema>;
export declare const NotionMeResponseSchema: t.TypeC<{
    me: t.UnknownRecordC;
    botOwner: t.UnknownRecordC;
}>;
export type NotionMeResponseType = t.TypeOf<typeof NotionMeResponseSchema>;
export declare const TemporalCheckQueueResponseSchema: t.TypeC<{
    taskQueue: t.UnknownRecordC;
}>;
export type TemporalCheckQueueResponseType = t.TypeOf<typeof TemporalCheckQueueResponseSchema>;
export declare const TemporalUnprocessedWorkflowsResponseSchema: t.TypeC<{
    queuesAndPollers: t.ArrayC<t.TypeC<{
        queue: t.StringC;
        pollers: t.NumberC;
    }>>;
    unprocessedQueues: t.ArrayC<t.StringC>;
}>;
export type TemporalUnprocessedWorkflowsResponseType = t.TypeOf<typeof TemporalUnprocessedWorkflowsResponseSchema>;
export declare const AdminResponseSchema: t.UnionC<[t.TypeC<{
    success: t.LiteralC<true>;
}>, t.TypeC<{
    succeeded: t.NumberC;
    failed: t.NumberC;
}>, t.TypeC<{
    status: t.NumberC;
    type: t.UnionC<[t.LiteralC<"undefined">, t.LiteralC<"object">, t.LiteralC<"boolean">, t.LiteralC<"number">, t.LiteralC<"string">, t.LiteralC<"function">, t.LiteralC<"symbol">, t.LiteralC<"bigint">]>;
    content: t.UnknownC;
}>, t.TypeC<{
    me: t.UnknownRecordC;
}>, t.TypeC<{
    workflowId: t.StringC;
    workflowUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
}>, t.TypeC<{
    parents: t.ArrayC<t.StringC>;
}>, t.TypeC<{
    isConversationOnIntercom: t.BooleanC;
    isConversationOnDB: t.BooleanC;
    conversationTeamIdOnIntercom: t.UnionC<[t.StringC, t.UndefinedC]>;
    conversationTeamIdOnDB: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
}>, t.TypeC<{
    missingConversations: t.ArrayC<t.TypeC<{
        conversationId: t.StringC;
        teamId: t.UnionC<[t.NumberC, t.NullC]>;
        open: t.BooleanC;
        createdAt: t.NumberC;
    }>>;
}>, t.TypeC<{
    teams: t.ArrayC<t.TypeC<{
        teamId: t.StringC;
        name: t.StringC;
        isTeamOnDB: t.BooleanC;
    }>>;
}>, t.TypeC<{
    conversation: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>, t.TypeC<{
    articles: t.ArrayC<t.UnionC<[t.UnknownRecordC, t.NullC]>>;
}>, t.TypeC<{
    page: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    db: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>, t.TypeC<{
    deletedPage: t.BooleanC;
    deletedDb: t.BooleanC;
}>, t.TypeC<{
    me: t.UnknownRecordC;
    botOwner: t.UnknownRecordC;
}>, t.TypeC<{
    pages: t.ArrayC<t.TypeC<{
        id: t.StringC;
        title: t.UnionC<[t.StringC, t.UndefinedC]>;
        type: t.UnionC<[t.LiteralC<"page">, t.LiteralC<"database">]>;
        isSkipped: t.BooleanC;
        isFull: t.BooleanC;
    }>>;
}>, t.TypeC<{
    workflowId: t.StringC;
    workflowUrl: t.UnionC<[t.StringC, t.UndefinedC]>;
}>, t.TypeC<{
    taskQueue: t.UnknownRecordC;
}>, t.TypeC<{
    queuesAndPollers: t.ArrayC<t.TypeC<{
        queue: t.StringC;
        pollers: t.NumberC;
    }>>;
    unprocessedQueues: t.ArrayC<t.StringC>;
}>, t.TypeC<{
    affectedCount: t.NumberC;
}>, t.TypeC<{
    userRole: t.StringC;
    userActive: t.BooleanC;
    userIsAdmin: t.BooleanC;
}>, t.TypeC<{
    ticketCount: t.NumberC;
}>, t.TypeC<{
    ticket: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    isTicketOnDb: t.BooleanC;
}>, t.TypeC<{
    brand: t.UnionC<[t.UnknownRecordC, t.NullC]>;
    brandOnDb: t.UnionC<[t.UnknownRecordC, t.NullC]>;
}>]>;
export type AdminResponseType = t.TypeOf<typeof AdminResponseSchema>;
//# sourceMappingURL=cli.d.ts.map