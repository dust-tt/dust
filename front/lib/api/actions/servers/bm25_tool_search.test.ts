import { buildDocs, buildIndex, rank } from "@app/lib/api/actions/servers/bm25";
import type { LabeledQuery } from "@app/lib/api/actions/servers/bm25_tool_search_utils.test";
import { SERVERS } from "@app/lib/api/actions/servers/bm25_tool_search_utils.test";
import { describe, expect, it } from "vitest";

const QUERIES: LabeledQuery[] = [
  // --- agent_memory ---
  { query: "what do you remember about me", expected: "agent_memory.retrieve" },
  {
    query: "remember that I prefer concise answers",
    expected: "agent_memory.record_entries",
  },
  {
    query: "forget that I prefer concise answers",
    expected: "agent_memory.erase_entries",
  },
  {
    query: "change memory 3 to say I work in Paris",
    expected: "agent_memory.edit_entries",
  },
  {
    query: "deduplicate and summarize my memory",
    expected: "agent_memory.compact_memory",
  },

  // --- user_memory ---
  {
    query: "read my personal memory",
    expected: "user_memory.read",
  },
  {
    query: "open my personal memory and show its full contents",
    expected: "user_memory.read",
  },
  {
    query: "update my personal memory by replacing a snippet of text",
    expected: "user_memory.edit",
  },
  {
    query: "delete a line of text from my personal memory",
    expected: "user_memory.edit",
  },
  {
    query: "add a new line to my personal memory",
    expected: "user_memory.edit",
  },

  // --- conversation_files ---
  {
    query: "list the files attached to this conversation",
    expected: "conversation_files.list",
  },
  {
    query: "show the Notion pages and queryable tables attached here",
    expected: "conversation_files.list_content_nodes_and_tables",
  },
  {
    query: "read the attached conversation file by file id",
    expected: "conversation_files.cat",
  },
  {
    query: "grep an attached file for a specific error code",
    expected: "conversation_files.cat",
  },
  {
    query: "semantically search the conversation files for pricing terms",
    expected: "conversation_files.semantic_search",
  },
  {
    query: "search across the attached files by meaning",
    expected: "conversation_files.semantic_search",
  },

  // --- google_drive ---
  {
    query: "search google drive for the Q3 report",
    expected: "google_drive.search_files",
    maxRank: 12, // oversized q parameter description dilutes BM25 score
  },
  {
    query: "find my budget spreadsheet in google drive",
    expected: "google_drive.search_files",
    maxRank: 7, // oversized q parameter description dilutes BM25 score
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
    maxRank: 3,
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
    // google_sheets exposes a duplicate create_spreadsheet; without naming the
    // server the two are not lexically separable and trade the top slot.
    maxRank: 2,
  },
  {
    query: "make a new google slides deck",
    expected: "google_drive.create_presentation",
    maxRank: 3, // "deck" not in description
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
    maxRank: 2,
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
    maxRank: 5,
  },
  {
    query: "open an excel file from onedrive",
    expected: "microsoft_drive.get_file_content",
    maxRank: 2,
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
    maxRank: 4, // get_item_from_url + create_folder dilute shared-token IDF
  },
  {
    query: "browse my sharepoint site",
    expected: "microsoft_drive.list_drive_items",
  },

  // --- microsoft_excel ---
  {
    query: "find Excel files",
    expected: "microsoft_excel.list_excel_files",
  },
  {
    query: "read cell values from Excel",
    expected: "microsoft_excel.read_worksheet",
    maxRank: 1,
  },

  // --- jira ---
  {
    query: "create a new issue in jira",
    expected: "jira.create_issue",
    maxRank: 3, // get_issue_create_fields name collides
  },
  {
    query: "log a bug in jira for this regression",
    expected: "jira.create_issue",
    maxRank: 2, // "log" collides with monday.get_activity_logs
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
    query: "jira update issue description",
    expected: "jira.update_issue",
  },
  {
    query: "change the priority on jira issue PROJ-9",
    expected: "jira.update_issue",
    maxRank: 3,
  },
  {
    query: "attach a screenshot to jira issue PROJ-3",
    expected: "jira.upload_attachment",
    maxRank: 7, // short description; "issue" matches many jira tools
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
    maxRank: 4,
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
    maxRank: 7, // "thread" strongly matches read_thread_messages
  },
  {
    query: "semantically search my slack for messages about pricing",
    expected: "slack.semantic_search_messages",
    maxRank: 4, // collides with search_messages
  },
  {
    query: "send a slack message to a colleague as myself",
    expected: "slack.post_message",
    maxRank: 10,
  },
  {
    query: "dm someone on slack",
    expected: "slack.post_message",
    maxRank: 2,
  },
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
    maxRank: 18, // oversized multi-line description dilutes BM25 score
  },
  {
    query: "list the slack user groups",
    expected: "slack.list_user_groups",
  },
  {
    query: "write a slack canvas in a channel",
    expected: "slack.write_canvas",
    maxRank: 2, // get_channel_canvases name collides
  },
  {
    query: "create a new slack channel",
    expected: "slack.create_channel",
  },
  {
    query: "invite someone to a slack channel",
    expected: "slack.invite_to_channel",
  },
  {
    query: "archive a slack channel",
    expected: "slack.archive_channel",
  },
  {
    query: "react to a slack message with an emoji",
    expected: "slack.add_reaction",
  },
  {
    query: "remove my emoji reaction from a slack message",
    expected: "slack.remove_reaction",
  },
  {
    query: "see who reacted to a slack message",
    expected: "slack.get_reactions",
  },
  {
    query: "set my slack status to out of office",
    expected: "slack.set_user_status",
    maxRank: 10,
  },

  // --- slack_bot (workspace bot) ---
  {
    query: "post a message to a slack channel as the workspace bot",
    expected: "slack_bot.post_message",
    maxRank: 2, // showSentByFooter guardrail wording lengthens the doc, add_reaction edges it out
  },
  {
    query: "edit a message the slack bot posted",
    expected: "slack_bot.edit_message",
  },
  {
    query: "add an emoji reaction to a slack message as the workspace bot",
    expected: "slack_bot.add_reaction",
  },
  {
    query: "remove a reaction from a slack message as the workspace bot",
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

  // --- monday ---
  {
    query: "list all boards in Monday.com",
    expected: "monday.get_boards",
  },
  {
    query: "create a new item in a Monday.com board",
    expected: "monday.create_item",
  },

  // --- notion ---
  {
    query: "find a Notion page by keyword",
    expected: "notion.search",
  },
  {
    query: "insert a new row into a Notion database",
    expected: "notion.insert_row_into_database",
  },

  // --- outlook ---
  {
    query: "get emails from my Outlook inbox",
    expected: "outlook.get_messages",
  },
  {
    query: "check Outlook Calendar availability for multiple people",
    expected: "outlook_calendar.check_availability",
  },

  // --- openai_usage ---
  {
    query: "get OpenAI token usage by model",
    expected: "openai_usage.get_completions_usage",
    maxRank: 1,
  },
  {
    query: "get OpenAI spending costs for my organization",
    expected: "openai_usage.get_organization_costs",
    maxRank: 1,
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
    maxRank: 2,
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
    maxRank: 3, // collides with list_channels
  },

  // --- wakeups ---
  {
    query: "remind me tomorrow morning to check the launch",
    expected: "wakeups.schedule_wakeup",
    maxRank: 4,
  },
  {
    query: "check back in 2 hours to see if the import finished",
    expected: "wakeups.schedule_wakeup",
  },
  {
    query: "what wake-ups are scheduled in this conversation",
    expected: "wakeups.list_wakeups",
  },
  {
    query: "show my pending reminders",
    expected: "wakeups.list_wakeups",
  },
  {
    query: "cancel the scheduled wake-up",
    expected: "wakeups.cancel_wakeup",
  },
  {
    query: "stop the reminder I set earlier",
    expected: "wakeups.cancel_wakeup",
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

  // --- include_data ---
  {
    query: "include all recent documents as context",
    expected: "include_data.retrieve_recent_documents",
  },
  {
    query: "load the latest documents from my selected data sources",
    expected: "include_data.retrieve_recent_documents",
  },

  // --- hubspot ---
  {
    query: "find a hubspot contact by email address",
    expected: "hubspot.search_crm_objects",
    maxRank: 2,
  },
  {
    query: "read hubspot contact 123",
    expected: "hubspot.search_crm_objects",
    maxRank: 2,
  },
  {
    query: "open a hubspot company record",
    expected: "hubspot.search_crm_objects",
  },
  {
    query: "read a hubspot deal by id",
    expected: "hubspot.search_crm_objects",
    maxRank: 2,
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
    maxRank: 2, // "create contact" collides
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

  // --- salesforce ---
  {
    query: "run a soql query in salesforce",
    expected: "salesforce.execute_read_query",
  },
  {
    query: "query salesforce accounts by industry",
    expected: "salesforce.execute_read_query",
  },
  {
    query: "list salesforce custom objects",
    expected: "salesforce.list_objects",
  },
  {
    query: "find the exact api name for a salesforce object",
    expected: "salesforce.list_objects",
  },
  {
    query: "what fields exist on salesforce account",
    expected: "salesforce.describe_object",
  },
  {
    query: "describe the salesforce lead object metadata",
    expected: "salesforce.describe_object",
  },
  {
    query: "create a salesforce account record",
    expected: "salesforce.create_object",
  },
  {
    query: "update a salesforce contact record",
    expected: "salesforce.update_object",
  },
  {
    query: "list files attached to a salesforce opportunity",
    expected: "salesforce.list_attachments",
    maxRank: 3,
  },
  {
    query: "read a salesforce attachment file",
    expected: "salesforce.read_attachment",
  },

  // --- interactive_content (frames) ---
  {
    query: "create an interactive dashboard frame",
    expected: "interactive_content.create_interactive_content_file",
  },
  {
    query: "build a data visualization to display",
    expected: "interactive_content.create_interactive_content_file",
  },
  {
    query: "make a slideshow presentation",
    expected: "interactive_content.create_interactive_content_file",
  },
  {
    query: "edit the code of my frame",
    expected: "interactive_content.edit_interactive_content_file",
  },
  {
    query: "change the chart colors in my dashboard",
    expected: "interactive_content.edit_interactive_content_file",
  },
  {
    query: "read back the content of my frame",
    expected: "interactive_content.retrieve_interactive_content_file",
  },
  {
    query: "open an existing frame in the side panel without editing it",
    expected: "conversation_side_panel.open_frame",
  },
  {
    query: "show the user a frame that was already created",
    expected: "conversation_side_panel.open_frame",
  },
  {
    query: "revert my frame to the previous version",
    expected: "interactive_content.revert_interactive_content_file",
  },
  {
    query: "rename my frame file",
    expected: "interactive_content.rename_interactive_content_file",
  },
  {
    query: "get the share link for my dashboard",
    expected: "interactive_content.get_interactive_content_file_share_url",
  },
  {
    query: "export my frame as a pdf",
    expected: "interactive_content.export_interactive_content_file",
  },
  {
    query: "download a png screenshot of my dashboard",
    expected: "interactive_content.export_interactive_content_file",
  },

  // --- google_sheets ---
  {
    query: "find my budget spreadsheet in google sheets",
    expected: "google_sheets.list_spreadsheets",
    maxRank: 3,
  },
  {
    query: "list all my google sheets spreadsheets",
    expected: "google_sheets.list_spreadsheets",
    maxRank: 5, // slack personal tools added to corpus shift avgdl
  },
  {
    query: "get the properties of a google sheets spreadsheet",
    expected: "google_sheets.get_spreadsheet",
  },
  {
    query: "read the values from a range in a google sheet",
    expected: "google_sheets.get_worksheet",
  },
  {
    query: "write values into cells in a google sheet",
    expected: "google_sheets.update_cells",
  },
  {
    query: "append a new row of data to a google sheet",
    expected: "google_sheets.append_data",
  },
  {
    query: "clear the values from a range in a google sheet",
    expected: "google_sheets.clear_range",
  },
  {
    query: "create a brand new google sheets spreadsheet",
    expected: "google_sheets.create_spreadsheet",
  },
  {
    query: "add a new tab to a google sheets spreadsheet",
    expected: "google_sheets.add_worksheet",
    maxRank: 2, // copy_sheet description mentions "tab"
  },
  {
    query: "delete a tab from a google sheets spreadsheet",
    expected: "google_sheets.delete_worksheet",
    maxRank: 2, // copy_sheet description mentions "tab"
  },
  {
    query: "make a range of cells bold in a google sheet",
    expected: "google_sheets.format_cells",
  },
  {
    query: "copy a tab from one google spreadsheet to another",
    expected: "google_sheets.copy_sheet",
  },
  {
    query: "rename a tab in a google sheet",
    expected: "google_sheets.rename_worksheet",
  },
  {
    query: "reorder a tab to a different position in a google sheet",
    expected: "google_sheets.move_worksheet",
  },

  // --- snowflake ---
  {
    query: "what snowflake databases can i access",
    expected: "snowflake.list_databases",
  },
  {
    query: "show schemas in the analytics snowflake database",
    expected: "snowflake.list_schemas",
  },
  {
    query: "find available tables and views in snowflake analytics public",
    expected: "snowflake.list_tables",
  },
  {
    query: "what columns and data types are in a snowflake orders table",
    expected: "snowflake.describe_table",
  },
  {
    query: "show measures and dimensions in a snowflake semantic view",
    expected: "snowflake.describe_semantic_view",
  },
  {
    query: "calculate monthly revenue from snowflake data",
    expected: "snowflake.query",
  },

  // --- run_agent (sample dynamic child agents) ---
  {
    query: "delegate competitive pricing research to another agent",
    expected: "run_agent.run_ResearchAnalyst",
  },
  {
    query: "ask an agent to investigate a customer refund ticket",
    expected: "run_agent.run_SupportTriage",
  },
  {
    query: "have a specialist review this pull request for regressions",
    expected: "run_agent.run_CodeReviewer",
    maxRank: 4,
  },

  // --- data_warehouses ---
  {
    query: "browse the schemas in our revenue warehouse",
    expected: "data_warehouses.list",
  },
  {
    query: "find customer tables in the data warehouse",
    expected: "data_warehouses.find",
  },
  {
    query: "describe the schema and columns for this warehouse table",
    expected: "data_warehouses.describe_tables",
  },
  {
    query: "calculate monthly revenue by querying warehouse tables",
    expected: "data_warehouses.query",
  },

  // --- query_tables_v2 ---
  {
    query: "list agent configured table uris",
    expected: "query_tables_v2.list_tables",
  },
  {
    query: "get the schema for an agent configured table before writing sql",
    expected: "query_tables_v2.get_database_schema",
  },
  {
    query: "run sql against this agent configured table",
    expected: "query_tables_v2.execute_database_query",
  },

  // --- pod_manager ---
  {
    query: "show me the pods I belong to",
    expected: "pod_manager.list_pods",
  },
  {
    query: "create a new restricted pod for the launch plan",
    expected: "pod_manager.create_pod",
    maxRank: 2,
  },
  {
    query: "what is this pod's title description and linked content",
    expected: "pod_manager.get_information",
  },
  {
    query: "rename this pod and update its description",
    expected: "pod_manager.edit_information",
    maxRank: 2,
  },
  {
    query: "add a teammate as an editor to this pod",
    expected: "pod_manager.update_members",
  },
  {
    query: "list all members and editors in this pod",
    expected: "pod_manager.list_members",
    maxRank: 2,
  },
  {
    query: "attach this company data folder to the pod context",
    expected: "pod_manager.add_content_node",
  },
  {
    query: "remove this linked company data node from the pod",
    expected: "pod_manager.remove_content_node",
  },
  {
    query: "find pod files and conversations about pricing",
    expected: "pod_manager.semantic_search",
  },
  {
    query: "show the most recent pod documents from last week",
    expected: "pod_manager.retrieve_recent_documents",
  },
  {
    query: "start a new pod conversation with the research agent",
    expected: "pod_manager.create_conversation",
  },
  {
    query: "show unread conversations in this pod",
    expected: "pod_manager.list_conversations",
    maxRank: 2,
  },
  {
    query: "send a follow up message to an existing pod conversation",
    expected: "pod_manager.add_message_to_conversation",
  },
  {
    query: "move this conversation into the marketing pod",
    expected: "pod_manager.move_conversation",
  },
  {
    query: "move this conversation out of the pod",
    expected: "pod_manager.move_conversation",
  },
  {
    query: "make this pod open to the whole workspace",
    expected: "pod_manager.edit_information",
    maxRank: 2,
  },

  // --- val_town ---
  {
    query: "create a new Val Town project for a scheduled script",
    expected: "val_town.create_val",
  },
  {
    query: "list Val Town projects in my account",
    expected: "val_town.list_vals",
  },
  {
    query: "read the content of a file in Val Town",
    expected: "val_town.get_file_content",
  },

  // --- vanta ---
  {
    query: "show all security controls in my Vanta account",
    expected: "vanta.list_controls",
  },
  {
    query: "show controls and links attached to a Vanta document",
    expected: "vanta.list_document_resources",
  },
  {
    query: "what are the current risks in Vanta",
    expected: "vanta.list_risks",
  },

  // --- workspace_analytics ---
  {
    query: "which agents are used most in the workspace",
    expected: "workspace_analytics.get_top_entities_by_message_count",
    maxRank: 2,
  },
  {
    query: "who are the most active users this month",
    expected: "workspace_analytics.get_top_entities_by_message_count",
  },
  {
    query: "where do workspace messages come from - slack, api, or browser",
    expected: "workspace_analytics.get_top_entities_by_message_count",
    maxRank: 10,
  },
  {
    query: "which models did the workspace use most this month",
    expected: "workspace_analytics.get_top_entities_by_message_count",
    maxRank: 5,
  },
  {
    query:
      "what does the support agent actually do - show its configuration and prompt",
    expected: "workspace_analytics.get_agent_details",
  },
  {
    query: "inspect an agent's full system prompt and tools",
    expected: "workspace_analytics.get_agent_details",
  },
  {
    query: "break down credit spending by agent",
    expected: "workspace_analytics.get_top_entities_by_credits",
  },
  {
    query: "which skills are executed most in the workspace",
    expected: "workspace_analytics.get_top_entities_by_execution_count",
  },
  {
    query: "what are the top MCP tools used by agents",
    expected: "workspace_analytics.get_top_entities_by_execution_count",
  },
  {
    query: "how many times did each integration run",
    expected: "workspace_analytics.get_top_entities_by_execution_count",
  },
  {
    query: "which agents cost the most credits this month",
    expected: "workspace_analytics.get_top_entities_by_credits",
  },
  {
    query: "which conversations were the most expensive",
    expected: "workspace_analytics.get_top_entities_by_credits",
  },
  {
    query: "attribute credit spend to our API keys",
    expected: "workspace_analytics.get_top_entities_by_credits",
  },
  {
    query: "rank credit spend by tool",
    expected: "workspace_analytics.get_top_entities_by_credits",
  },
  {
    query: "how many credits did the workspace consume this month",
    expected: "workspace_analytics.get_consumption_overview",
  },
  {
    query: "show the credit spending trend over the last 30 days",
    expected: "workspace_analytics.get_credit_timeseries",
  },
  // --- ashby ---
  {
    query: "find a candidate in ashby by email",
    expected: "ashby.search_candidates",
  },
  {
    query: "download an ashby report as a csv file",
    expected: "ashby.get_report_data",
  },
  {
    query: "show the interview feedback for a candidate in ashby",
    expected: "ashby.get_interview_feedback",
  },
  {
    query: "read all the notes on a candidate in ashby",
    expected: "ashby.get_candidate_notes",
  },
  {
    query: "add a note to a candidate's profile in ashby",
    expected: "ashby.create_candidate_note",
    maxRank: 2,
  },
  {
    query: "list the job openings in ashby",
    expected: "ashby.list_openings",
  },
  {
    query: "list the published job postings in ashby",
    expected: "ashby.list_job_postings",
  },
  {
    query: "update the description of a job posting in ashby",
    expected: "ashby.update_job_posting",
  },
  {
    query: "show the referral form fields in ashby",
    expected: "ashby.get_referral_form",
  },
  {
    query: "create a referral for a candidate in ashby",
    expected: "ashby.create_referral",
  },
  {
    query: "get the offer and hire details for a hired candidate in ashby",
    expected: "ashby.get_hire_data",
  },

  // --- web_search_&_browse ---
  {
    query: "search the web for the latest AI research papers",
    expected: "web_search_&_browse.websearch",
    maxRank: 2, // clari_copilot.get_call_details dilutes shared-token IDF
  },
  {
    query: "google this topic for me",
    expected: "web_search_&_browse.websearch",
  },
  {
    query: "find recent news about the acquisition online",
    expected: "web_search_&_browse.websearch",
  },
  {
    query: "look up current information on the internet",
    expected: "web_search_&_browse.websearch",
  },
  {
    query: "fetch the content of this URL",
    expected: "web_search_&_browse.webbrowser",
  },
  {
    query: "open and read these web pages",
    expected: "web_search_&_browse.webbrowser",
  },
  {
    query: "take a full page screenshot of this website",
    expected: "web_search_&_browse.webbrowser",
  },
  {
    query: "browse this webpage and summarize it",
    expected: "web_search_&_browse.webbrowser",
  },

  // --- clari_copilot ---
  {
    query: "find clari copilot sales calls with acme last week",
    expected: "clari_copilot.search_calls",
  },
  {
    query: "list clari copilot calls with a customer by date",
    expected: "clari_copilot.search_calls",
  },
  {
    query: "get the ai summary and action items for a clari copilot call",
    expected: "clari_copilot.get_call_details",
  },
  {
    query:
      "show the transcript and competitor mentions of a clari copilot call",
    expected: "clari_copilot.get_call_details",
  },

  // --- image_generation ---
  {
    query: "generate an image of a watercolor mountain landscape at sunset",
    expected: "image_generation.generate_image",
  },
  {
    query: "create a picture of a minimalist tech company logo",
    expected: "image_generation.generate_image",
  },
  {
    query: "draw an illustration of a friendly robot mascot",
    expected: "image_generation.generate_image",
  },
  {
    query:
      "edit this photo to remove the background and replace it with a beach",
    expected: "image_generation.generate_image",
  },

  // --- file_generation ---
  {
    query: "turn this conversation file into a PDF",
    expected: "file_generation.convert_file_format",
  },
  {
    query: "write my report text out as a Word document",
    expected: "file_generation.generate_file",
    maxRank: 2,
  },
  {
    query: "which input formats can I turn into an xlsx spreadsheet",
    expected: "file_generation.get_supported_source_formats_for_output_format",
  },

  // --- fathom ---
  {
    query: "list my fathom call recordings",
    expected: "fathom.list_meetings",
  },
  {
    query: "get the transcript of a fathom call",
    expected: "fathom.get_transcript",
  },

  // --- luma ---
  {
    query: "which Luma account is the api key configured for",
    expected: "luma.get_authenticated_user",
  },
  {
    query: "get the details of a Luma event by id",
    expected: "luma.get_event",
  },
  {
    query: "list upcoming events on my Luma calendar",
    expected: "luma.list_events",
  },
  {
    query: "create a new event on Luma",
    expected: "luma.create_event",
  },
  {
    query: "edit the start time of a Luma event",
    expected: "luma.update_event",
  },
  {
    query: "list the guests registered for a Luma event",
    expected: "luma.list_guests",
  },
  {
    query: "get the registration details of one Luma guest",
    expected: "luma.get_guest",
  },
  {
    query: "approve a pending guest on a Luma event",
    expected: "luma.update_guest_status",
  },
  {
    query: "add guests to a Luma event by email",
    expected: "luma.add_guests",
  },
  {
    query: "send email invitations for a Luma event",
    expected: "luma.send_invites",
  },
  {
    query: "find a specific attendee by name in a Luma event",
    expected: "luma.search_guests",
  },
  {
    query: "show registration counts and check-in rate for a Luma event",
    expected: "luma.get_event_insights",
  },

  // --- extract_data ---
  {
    query: "extract structured data from documents into a json schema",
    expected: "extract_data.extract_information_from_documents",
  },

  // --- gong ---
  {
    query: "list my recent Gong calls from last week",
    expected: "gong.list_calls",
  },
  {
    query: "get the details and summary of this Gong call",
    expected: "gong.get_call",
  },
  {
    query: "show me the transcript of this Gong call",
    expected: "gong.get_call_transcript",
  },

  // --- files ---
  {
    query: "list the files in the conversation and pod file system",
    expected: "files.list",
  },
  {
    query: "resolve a fil_ file id to its scoped file system path",
    expected: "files.resolve",
  },
  {
    query: "read the contents of a file at a scoped path line by line",
    expected: "files.cat",
  },
  {
    query: "grep a file for lines matching a regular expression",
    expected: "files.grep",
  },
  {
    query: "create a new text file in the conversation file system",
    expected: "files.create",
  },
  {
    query: "download a file from a public https url into the file system",
    expected: "files.upload_from_url",
  },
  {
    query: "delete a file from the conversation or pod file system",
    expected: "files.delete",
  },
  {
    query: "extract text from a pdf or docx binary document",
    expected: "files.extract_text",
  },
  {
    query: "copy a file from one scoped path to another keeping the source",
    expected: "files.copy",
  },
  {
    query: "move a file to a different scoped path and remove the source",
    expected: "files.move",
  },

  // --- gmail ---
  {
    query: "show my saved gmail drafts",
    expected: "gmail.get_drafts",
  },
  {
    query: "draft a reply email in gmail to send later",
    expected: "gmail.create_draft",
  },
  {
    query: "delete a draft email from gmail",
    expected: "gmail.delete_draft",
  },
  {
    query: "search my gmail inbox for emails from a coworker",
    expected: "gmail.get_messages",
  },
  {
    query: "download the file attached to a gmail email",
    expected: "gmail.get_attachment",
  },
  {
    query: "list all my gmail labels and folders",
    expected: "gmail.get_labels",
  },
  {
    query: "mark a gmail message as read and move it out of the inbox",
    expected: "gmail.set_message_labels",
  },
  {
    query: "send an email right now through gmail",
    expected: "gmail.send_mail",
  },
  {
    query: "read the whole gmail conversation thread",
    expected: "gmail.get_thread",
  },

  // --- google_calendar ---
  {
    query: "list all my google calendars",
    expected: "google_calendar.list_calendars",
  },
  {
    query: "what events are on my google calendar this week",
    expected: "google_calendar.list_events",
  },
  {
    query: "get the details of a calendar event by its id",
    expected: "google_calendar.get_event",
  },
  {
    query: "schedule a meeting on my google calendar",
    expected: "google_calendar.create_event",
    maxRank: 2, // conference variants expand the indexed input schema
  },
  {
    query: "reschedule a calendar event to a new time",
    expected: "google_calendar.update_event",
  },
  {
    query: "cancel and remove a calendar event",
    expected: "google_calendar.delete_event",
  },
  {
    query: "find a free time slot when everyone is available to meet",
    expected: "google_calendar.check_availability",
  },
  {
    query: "look up the timezone of meeting attendees",
    expected: "google_calendar.get_user_timezones",
  },

  // --- github ---
  {
    query: "open a new github issue for this bug",
    expected: "github.create_issue",
  },
  {
    query: "close a github issue and update its labels",
    expected: "github.update_issue",
  },
  {
    query: "show me the diff and reviews of a github pull request",
    expected: "github.get_pull_request",
  },
  {
    query: "approve a github pull request with review comments",
    expected: "github.create_pull_request_review",
  },
  {
    query: "list the open project boards in my github organization",
    expected: "github.list_organization_projects",
  },
  {
    query: "add a github issue to a project board",
    expected: "github.add_issue_to_project",
  },
  {
    query: "leave a comment on a github issue",
    expected: "github.comment_on_issue",
  },
  {
    query: "what discussion categories are available in this github repo",
    expected: "github.list_discussion_categories",
  },
  {
    query: "start a new github discussion in the repo",
    expected: "github.create_discussion",
  },
  {
    query: "reply to a github discussion thread",
    expected: "github.comment_on_discussion",
  },
  {
    query: "read a github discussion and its category",
    expected: "github.get_discussion",
  },
  {
    query: "fetch the comments on a github discussion",
    expected: "github.get_discussion_comments",
  },
  {
    query: "list the discussions in a github repository",
    expected: "github.list_discussions",
    // create_discussion is a much shorter sibling sharing the same
    // github/discussion/repository tokens, so BM25 length normalization keeps
    // it just above this longer, filter-heavy list tool; the user's "list"
    // verb cannot fully overcome the short-document advantage.
    maxRank: 2,
  },
  {
    query: "get the details and comments of a github issue",
    expected: "github.get_issue",
  },
  {
    query: "read the project custom field values on a github issue",
    expected: "github.get_issue_custom_fields",
  },
  {
    query: "list the open issues in a github repository",
    expected: "github.list_issues",
  },
  {
    query: "search github issues and pull requests assigned to me",
    expected: "github.search_advanced",
  },
  {
    query: "list the open pull requests in a github repository",
    expected: "github.list_pull_requests",
  },

  // --- http_client ---
  {
    query: "call an external REST API endpoint with an HTTP request",
    expected: "http_client.send_request",
  },
  {
    query: "send a POST request to a URL with a JSON body and custom headers",
    expected: "http_client.send_request",
  },

  // --- common_utilities ---
  {
    query: "pick a random number between 1 and 100",
    expected: "common_utilities.generate_random_number",
  },
  {
    query: "give me a random decimal between 0 and 1",
    expected: "common_utilities.generate_random_float",
  },
  {
    query: "pause for 5 seconds before continuing",
    expected: "common_utilities.wait",
  },
  {
    query: "what is the current date and time right now",
    expected: "common_utilities.get_current_time",
  },
  {
    query: "calculate 15 percent of 240",
    expected: "common_utilities.math_operation",
  },
  {
    query: "rename this conversation to something descriptive",
    expected: "common_utilities.set_conversation_title",
  },

  // --- conversation_side_panel ---
  {
    query: "open the files side panel so the user can browse attachments",
    expected: "conversation_side_panel.set_files_side_panel",
  },
  {
    query: "hide the conversation files explorer panel",
    expected: "conversation_side_panel.set_files_side_panel",
  },

  // --- exa_people_and_company ---
  {
    query: "find the LinkedIn profile of the CTO of Mistral AI",
    expected: "exa_people_and_company.search_people",
  },
  {
    query: "look up the professional background of a person by name and role",
    expected: "exa_people_and_company.search_people",
  },
  {
    query: "identify who runs sales at French SaaS startups",
    expected: "exa_people_and_company.search_people",
  },
  {
    query: "research French AI startups and their company profiles",
    expected: "exa_people_and_company.search_companies",
  },
  {
    query: "find competitors of Notion for market research",
    expected: "exa_people_and_company.search_companies",
  },

  // --- databricks ---
  {
    query: "list the warehouses in Databricks",
    expected: "databricks.list_warehouses",
  },

  // --- data_sources_file_system ---
  {
    query: "read a connected data source document or page",
    expected: "data_sources_file_system.cat",
  },
  {
    query: "browse the folders and pages inside a connected data source",
    expected: "data_sources_file_system.list",
  },
  {
    query:
      "semantically search company data sources for knowledge about a topic",
    expected: "data_sources_file_system.semantic_search",
  },
  {
    query: "find a wiki page in a data source by part of its title",
    expected: "data_sources_file_system.find",
  },
  {
    query: "show the breadcrumb path of a connected data source item",
    expected: "data_sources_file_system.locate_in_tree",
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

  // --- sound_studio ---
  {
    query: "generate a sound effect from a text description",
    expected: "sound_studio.generate_sound_effects",
  },
  {
    query: "create a looping background sound effect",
    expected: "sound_studio.generate_sound_effects",
  },

  // --- speech_generator ---
  {
    query: "transcribe an audio file to text",
    expected: "speech_generator.speech_to_text",
  },
  {
    query: "convert a video recording to text",
    expected: "speech_generator.speech_to_text",
  },
  {
    query: "generate speech audio from a text prompt",
    expected: "speech_generator.text_to_speech",
  },
  {
    query: "convert text to spoken audio with a voice",
    expected: "speech_generator.text_to_speech",
  },
  {
    query: "generate a multi-speaker dialogue audio",
    expected: "speech_generator.text_to_dialogue",
  },
  {
    query: "create audio from a script with multiple speakers",
    expected: "speech_generator.text_to_dialogue",
  },

  // --- ukg_ready ---
  {
    query: "request time off from available types in UKG",
    expected: "ukg_ready.create_pto_request",
  },
  {
    query: "check my accrual balance",
    expected: "ukg_ready.get_accrual_balances",
  },

  // --- servicenow ---
  {
    query: "list open incidents in ServiceNow",
    expected: "servicenow.list_records",
    maxRank: 6, // create_record/get_record/update_record still share TABLE_SCHEMA's field text
  },
  {
    query: "show me my ServiceNow tickets",
    expected: "servicenow.list_records",
    maxRank: 6, // get_record/create_record/update_record all share "ServiceNow"/"ticket" tokens
  },
  {
    query: "create a new incident in ServiceNow",
    expected: "servicenow.create_record",
    maxRank: 3, // list_records/get_record share "incident"/"ServiceNow" tokens
  },
  {
    query: "open a ServiceNow ticket for this issue",
    expected: "servicenow.create_record",
    maxRank: 4, // list_records/get_record/update_record all share "ServiceNow"/"ticket" tokens
  },
  {
    query: "update the state of a ServiceNow incident",
    expected: "servicenow.update_record",
    maxRank: 3, // get_record/list_records share "incident"/"ServiceNow" tokens
  },
  {
    query: "resolve a ServiceNow ticket and add close notes",
    expected: "servicenow.update_record",
    maxRank: 3, // get_record/list_records share "ServiceNow"/"ticket" tokens
  },
  {
    query: "list ServiceNow problem records",
    expected: "servicenow.list_records",
    maxRank: 6, // same shared-field-text issue as above
  },
  {
    query: "list change requests in ServiceNow",
    expected: "servicenow.list_records",
    maxRank: 6, // same shared-field-text issue as the other list_records cases above
  },
  {
    query: "get a ServiceNow record by sys_id",
    expected: "servicenow.get_record",
    maxRank: 2, // list_records shares "ServiceNow"/"record"/"sys_id" tokens
  },
  {
    query: "look up a knowledge base article by sys_id in ServiceNow",
    expected: "servicenow.get_record",
    // "kb_knowledge" now only appears in the shared TABLE_SCHEMA field text (not repeated in
    // get_record's own top-level description), so this can lose to an unrelated server's
    // knowledge-base tool (e.g. freshservice's solution-articles tool) on "knowledge"/"article".
    maxRank: 4,
  },

  // --- slab ---
  {
    query: "search Slab posts by keyword",
    expected: "slab.search_posts",
  },
  {
    query: "list all topics in Slab",
    expected: "slab.get_topics",
  },

  // --- salesloft ---
  {
    query: "get my due sales cadence actions in Salesloft",
    expected: "salesloft.get_actions",
  },

  // --- productboard ---
  {
    query: "capture customer feedback in Productboard",
    expected: "productboard.create_note",
  },
  {
    query: "find Productboard features by status and owner",
    expected: "productboard.query_entities",
  },

  // --- statuspage ---
  {
    query: "list available status pages",
    expected: "statuspage.list_pages",
    maxRank: 3,
  },
  {
    query: "show active incidents on the status page",
    expected: "statuspage.list_incidents",
  },
  // --- shopify ---
  {
    query: "list products in Shopify store",
    expected: "shopify.list_products",
  },
  {
    query: "list customers in Shopify store",
    expected: "shopify.list_customers",
  },
  {
    query: "list orders in Shopify store",
    expected: "shopify.list_orders",
  },
];

export const fullIndexWithAllServers = buildIndex(buildDocs(SERVERS));

describe("BM25 tool-search retrieval (single-server index)", () => {
  for (const { query, expected } of QUERIES) {
    const serverName = expected.split(".")[0];
    it(`"${query}" → ${expected} is scored in ${serverName}-only index`, () => {
      const singleServerIndex = buildIndex(
        buildDocs(SERVERS.filter((s) => s.name === serverName))
      );
      const ranked = rank(query, singleServerIndex).filter((r) => r.score > 0);
      const pos = ranked.findIndex((r) => r.name === expected) + 1;
      expect(
        pos,
        `Expected "${expected}" to have a non-zero score but it was not found in ranked results`
      ).toBeGreaterThan(0);
    });
  }
});

describe("BM25 tool-search retrieval", () => {
  for (const { query, expected, maxRank = 1 } of QUERIES) {
    it(`"${query}" → ${expected} (rank ≤ ${maxRank})`, () => {
      const ranked = rank(query, fullIndexWithAllServers);
      const pos = ranked.findIndex((r) => r.name === expected) + 1;
      expect(
        pos,
        `Expected "${expected}" in top ${maxRank} but got rank ${pos}. Top hit: "${ranked[0]?.name}"`
      ).toBeGreaterThan(0);
      expect(
        pos,
        `Expected "${expected}" in top ${maxRank} but got rank ${pos}. Top hit: "${ranked[0]?.name}"`
      ).toBeLessThanOrEqual(maxRank);
    });
  }
});
