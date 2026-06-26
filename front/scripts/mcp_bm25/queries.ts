// Labeled retrieval queries: realistic user intents mapped to the tool that
// should rank first. `expected` is server-qualified ("<server>.<tool>") because
// several servers expose the same tool name (e.g. copy_file, get_file_content).
// `maxRank` allows a query to pass when the expected tool is within the top N
// (default 1); use it only for genuinely ambiguous intents.
//
// Add a server to run.ts and its queries here as each server is reviewed.

export interface LabeledQuery {
  query: string;
  expected: string;
  maxRank?: number;
}

export const QUERIES: LabeledQuery[] = [
  // --- google_drive ---
  {
    query: "search google drive for the Q3 report",
    expected: "google_drive.search_files",
  },
  {
    query: "find my budget spreadsheet in google drive",
    expected: "google_drive.search_files",
  },
  { query: "list all my google drives", expected: "google_drive.list_drives" },
  { query: "read my google doc", expected: "google_drive.get_file_content" },
  {
    query: "open a file from google drive",
    expected: "google_drive.get_file_content",
  },
  { query: "clone this google doc", expected: "google_drive.copy_file" },
  {
    query: "duplicate a google slides template",
    expected: "google_drive.copy_file",
  },
  {
    query: "unshare a google drive file",
    expected: "google_drive.revoke_file_sharing",
  },
  {
    query: "stop sharing a google doc with someone",
    expected: "google_drive.revoke_file_sharing",
  },
  {
    query: "share a google doc with my colleague",
    expected: "google_drive.share_file",
  },
  {
    query: "create a new google spreadsheet",
    expected: "google_drive.create_spreadsheet",
  },
  {
    query: "make a new google slides deck",
    expected: "google_drive.create_presentation",
  },
  {
    query: "who has access to this google drive file",
    expected: "google_drive.list_file_permissions",
  },
  {
    query: "upload a file to google drive",
    expected: "google_drive.upload_file",
  },

  // --- microsoft_drive ---
  {
    query: "find my excel file in onedrive",
    expected: "microsoft_drive.search_drive_items",
  },
  {
    query: "find the budget file in sharepoint",
    expected: "microsoft_drive.search_drive_items",
  },
  {
    query: "what does my powerpoint in onedrive say about pricing",
    expected: "microsoft_drive.search_in_files",
  },
  {
    query: "search inside my onedrive files for the refund policy",
    expected: "microsoft_drive.search_in_files",
  },
  {
    query: "read my word doc in sharepoint",
    expected: "microsoft_drive.get_file_content",
  },
  {
    query: "open an excel file from onedrive",
    expected: "microsoft_drive.get_file_content",
  },
  {
    query: "edit my word document in onedrive",
    expected: "microsoft_drive.update_word_document",
  },
  {
    query: "clone a file in sharepoint",
    expected: "microsoft_drive.copy_file",
  },
  {
    query: "rename a folder in onedrive",
    expected: "microsoft_drive.rename_drive_item",
  },
  {
    query: "upload a file to sharepoint",
    expected: "microsoft_drive.upload_file",
  },
  {
    query: "list files in my onedrive folder",
    expected: "microsoft_drive.list_drive_items",
  },
  {
    query: "browse my sharepoint site",
    expected: "microsoft_drive.list_drive_items",
  },

  // --- jira ---
  { query: "create a new issue in jira", expected: "jira.create_issue" },
  {
    query: "log a bug in jira for this regression",
    expected: "jira.create_issue",
  },
  {
    query: "raise a jira ticket for the broken login",
    expected: "jira.create_issue",
  },
  {
    query: "show me the details of jira issue PROJ-123",
    expected: "jira.get_issue",
  },
  { query: "pull up jira ticket ENG-45", expected: "jira.get_issue" },
  {
    query: "search jira for issues assigned to me that are still open",
    expected: "jira.get_issues",
    maxRank: 2,
  },
  {
    query: "find all high priority bugs in our jira backlog",
    expected: "jira.get_issues",
    maxRank: 2,
  },
  {
    query: "run a jql query against jira",
    expected: "jira.get_issues_using_jql",
  },
  {
    query: "use jql to find jira issues created in the last week",
    expected: "jira.get_issues_using_jql",
  },
  { query: "what projects do we have in jira", expected: "jira.get_projects" },
  { query: "list the jira projects", expected: "jira.get_projects" },
  {
    query: "move jira issue PROJ-12 to in progress",
    expected: "jira.transition_issue",
  },
  {
    query: "change the status of a jira ticket to done",
    expected: "jira.transition_issue",
  },
  { query: "comment on jira issue PROJ-7", expected: "jira.create_comment" },
  { query: "leave a note on a jira issue", expected: "jira.create_comment" },
  {
    query: "mark two jira issues as related",
    expected: "jira.create_issue_link",
  },
  {
    query: "link a jira bug to its duplicate",
    expected: "jira.create_issue_link",
  },
  {
    query: "find a jira user by their email address",
    expected: "jira.get_users",
  },
  {
    query: "edit the description of a jira issue",
    expected: "jira.update_issue",
  },
  {
    query: "change the priority on jira issue PROJ-9",
    expected: "jira.update_issue",
  },
  {
    query: "attach a screenshot to jira issue PROJ-3",
    expected: "jira.upload_attachment",
  },
  {
    query: "download an attachment from a jira issue",
    expected: "jira.read_attachment",
    maxRank: 2,
  },

  // --- zendesk ---
  {
    query: "pull up zendesk ticket 12345 with all its comments",
    expected: "zendesk.get_ticket",
  },
  {
    query: "look up a zendesk support ticket by id",
    expected: "zendesk.get_ticket",
  },
  {
    query: "find zendesk tickets that are open and high priority",
    expected: "zendesk.search_tickets",
  },
  {
    query: "search zendesk for tickets tagged billing",
    expected: "zendesk.search_tickets",
  },
  {
    query: "reply to the customer on a zendesk ticket",
    expected: "zendesk.post_reply",
  },
  {
    query: "send a public response on a zendesk ticket",
    expected: "zendesk.post_reply",
  },
  {
    query: "prepare a draft reply for a zendesk ticket",
    expected: "zendesk.draft_reply",
  },
  {
    query: "tag a zendesk ticket as urgent",
    expected: "zendesk.update_ticket_tags",
  },
  {
    query: "what custom fields exist on zendesk tickets",
    expected: "zendesk.list_ticket_fields",
  },

  // --- front ---
  {
    query: "search our front inbox for a customer's emails",
    expected: "front.search_conversations",
    maxRank: 2,
  },
  {
    query: "find front conversations about refunds",
    expected: "front.search_conversations",
  },
  {
    query: "reply to a customer email in front",
    expected: "front.send_message",
  },
  {
    query: "respond to a conversation in front",
    expected: "front.send_message",
  },
  {
    query: "assign this front conversation to a teammate",
    expected: "front.assign_conversation",
  },
  {
    query: "leave an internal note for my team on a front conversation",
    expected: "front.add_comment",
  },
  {
    query: "archive a resolved conversation in front",
    expected: "front.update_conversation_status",
  },
  {
    query: "look up a customer's contact info in front",
    expected: "front.get_contact",
  },
  { query: "what inboxes do we have in front", expected: "front.list_inboxes" },
  {
    query: "start a new outbound email conversation in front",
    expected: "front.create_conversation",
  },
  {
    query: "see this customer's past conversations in front",
    expected: "front.get_customer_history",
    maxRank: 2,
  },
  {
    query: "list the teammates in our front workspace",
    expected: "front.list_teammates",
  },

  // --- freshservice ---
  {
    query: "raise an it support ticket in freshservice",
    expected: "freshservice.create_ticket",
  },
  {
    query: "log an incident in freshservice",
    expected: "freshservice.create_ticket",
  },
  {
    query: "show the open tickets in freshservice",
    expected: "freshservice.list_tickets",
  },
  {
    query: "get the details of freshservice ticket 88",
    expected: "freshservice.get_ticket",
  },
  {
    query: "post a private internal note on a freshservice ticket",
    expected: "freshservice.add_ticket_note",
  },
  {
    query: "reply to the requester on a freshservice ticket",
    expected: "freshservice.add_ticket_reply",
  },
  {
    query: "search the freshservice service catalog for vpn",
    expected: "freshservice.search_service_items",
  },
  {
    query: "add a subtask under a freshservice ticket",
    expected: "freshservice.create_ticket_task",
  },
  {
    query: "read a knowledge base article in freshservice",
    expected: "freshservice.get_solution_article",
  },
  {
    query: "ask someone to approve a freshservice ticket",
    expected: "freshservice.request_service_approval",
  },
  {
    query: "find the person who submitted a freshservice ticket",
    expected: "freshservice.list_requesters",
    maxRank: 2,
  },
  {
    query: "show the canned responses in freshservice",
    expected: "freshservice.list_canned_responses",
  },

  // --- slack (personal account) ---
  {
    query: "search my slack messages for the deploy thread",
    expected: "slack.search_messages",
  },
  {
    query: "semantically search my slack for messages about pricing",
    expected: "slack.semantic_search_messages",
  },
  {
    query: "send a slack message to a colleague as myself",
    expected: "slack.post_message",
  },
  { query: "dm someone on slack", expected: "slack.post_message" },
  {
    query: "schedule a slack message for tomorrow morning",
    expected: "slack.schedule_message",
  },
  {
    query: "list the recent messages in a slack channel",
    expected: "slack.list_messages",
  },
  {
    query: "read a slack thread",
    expected: "slack.read_thread_messages",
    maxRank: 2,
  },
  {
    query: "find a slack channel about engineering",
    expected: "slack.search_channels",
  },
  { query: "list the slack user groups", expected: "slack.list_user_groups" },
  {
    query: "write a slack canvas in a channel",
    expected: "slack.write_canvas",
  },
  { query: "create a new slack channel", expected: "slack.create_channel" },
  {
    query: "invite someone to a slack channel",
    expected: "slack.invite_to_channel",
  },
  { query: "archive a slack channel", expected: "slack.archive_channel" },

  // --- slack_bot (workspace bot) ---
  {
    query: "post a message to a slack channel as the workspace bot",
    expected: "slack_bot.post_message",
  },
  {
    query: "edit a message the slack bot posted",
    expected: "slack_bot.edit_message",
  },
  {
    query: "add an emoji reaction to a slack message",
    expected: "slack_bot.add_reaction",
  },
  {
    query: "remove a reaction from a slack message",
    expected: "slack_bot.remove_reaction",
  },
  {
    query: "list all public slack channels in the workspace",
    expected: "slack_bot.list_public_channels",
  },
  {
    query: "read the message history of a slack channel the bot is in",
    expected: "slack_bot.read_channel_history",
  },

  // --- microsoft_teams ---
  {
    query: "search microsoft teams messages for the budget discussion",
    expected: "microsoft_teams.search_messages_content",
  },
  {
    query: "list the teams i have joined",
    expected: "microsoft_teams.list_teams",
  },
  {
    query: "list the channels in a microsoft teams team",
    expected: "microsoft_teams.list_channels",
  },
  {
    query: "list my microsoft teams chats",
    expected: "microsoft_teams.list_chats",
  },
  {
    query: "post a message to a microsoft teams channel",
    expected: "microsoft_teams.post_message",
  },
  {
    query: "list my upcoming microsoft teams meetings",
    expected: "microsoft_teams.list_meetings",
  },
  {
    query: "get the transcript of a microsoft teams meeting",
    expected: "microsoft_teams.get_transcript_content",
  },
  {
    query: "look up people in the microsoft teams directory",
    expected: "microsoft_teams.list_users",
  },
  {
    query: "list the messages in a microsoft teams channel",
    expected: "microsoft_teams.list_messages",
  },

  // --- confluence ---
  {
    query: "search confluence for pages about onboarding",
    expected: "confluence.get_pages",
  },
  {
    query: "find a confluence page about the release process",
    expected: "confluence.get_pages",
  },
  {
    query: "get a confluence page by its id",
    expected: "confluence.get_page",
  },
  {
    query: "read the content of a confluence page",
    expected: "confluence.get_page",
  },
  {
    query: "create a new confluence page in a space",
    expected: "confluence.create_page",
  },
  {
    query: "update the content of an existing confluence page",
    expected: "confluence.update_page",
  },
  {
    query: "list the confluence spaces",
    expected: "confluence.get_spaces",
  },
  {
    query: "who am i in confluence",
    expected: "confluence.get_current_user",
  },

  // --- hubspot ---
  {
    query: "find a hubspot contact by email address",
    expected: "hubspot.get_object_by_email",
  },
  {
    query: "read hubspot contact 123",
    expected: "hubspot.get_contact",
  },
  {
    query: "open a hubspot company record",
    expected: "hubspot.get_company",
  },
  {
    query: "read a hubspot deal by id",
    expected: "hubspot.get_deal",
  },
  {
    query: "search hubspot deals by close date",
    expected: "hubspot.search_crm_objects",
  },
  {
    query: "find contacts at acme in hubspot",
    expected: "hubspot.search_crm_objects",
  },
  {
    query: "export hubspot contacts to csv",
    expected: "hubspot.export_crm_objects_csv",
  },
  {
    query: "who am i in hubspot",
    expected: "hubspot.get_current_user_id",
  },
  {
    query: "show my hubspot activity last week",
    expected: "hubspot.get_user_activity",
  },
  {
    query: "find a hubspot owner by name",
    expected: "hubspot.search_owners",
  },
  {
    query: "create a hubspot note on a contact",
    expected: "hubspot.create_note",
  },
  {
    query: "list contacts associated with a hubspot company",
    expected: "hubspot.list_associations",
  },
  {
    query: "get my hubspot portal id",
    expected: "hubspot.get_hubspot_portal_id",
  },
  {
    query: "list hubspot marketing emails",
    expected: "hubspot.list_marketing_emails",
  },
  {
    query: "read hubspot email campaign report",
    expected: "hubspot.get_email_campaign",
  },

  // --- cross-server (no platform named) ---
  {
    query: "create a support ticket",
    expected: "freshservice.create_ticket",
    maxRank: 4,
  },
  {
    query: "reply to a support ticket",
    expected: "zendesk.post_reply",
    maxRank: 4,
  },
];
