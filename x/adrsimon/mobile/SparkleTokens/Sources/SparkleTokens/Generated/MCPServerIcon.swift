// DO NOT EDIT — Generated from Sparkle (sparkle/src/styles, sparkle/src/icons, sparkle/src/logo)
// Run: make tokens


import SwiftUI

/// Maps internal MCP server names to their SparkleIcon (front/lib/api/actions/servers/*/metadata.ts).
public enum MCPServerIcon {
    public static func icon(for serverName: String) -> SparkleIcon? {
        switch serverName {
        case "conversation_side_panel", "interactive_content": .actionFrame
        case "user_mentions": .announcement01
        case "ashby": .ashbyLogo
        case "common_utilities": .atom01
        case "activation_recommendations": .brain
        case "pod_tasks": .checkCircle
        case "clari_copilot": .clariLogo
        case "include_data", "triggers_management", "wakeups": .clock
        case "confluence": .confluenceLogo
        case "cursor_cloud_agents": .cursorLogo
        case "google_drive": .driveLogo
        case "fathom": .fathomLogo
        case "agent_templates", "conversation_files", "data_sources_file_system", "file_generation", "files", "missing_action_catcher", "plan_mode", "pod_manager": .file06
        case "freshservice": .freshserviceLogo
        case "front": .frontLogo
        case "google_calendar": .gcalLogo
        case "github": .githubLogo
        case "http_client", "sandbox", "web_search_browse": .globe01
        case "gmail": .gmailLogo
        case "gong": .gongLogo
        case "google_sheets": .googleSpreadsheetLogo
        case "hubspot": .hubspotLogo
        case "image_generation": .image01
        case "jira": .jiraLogo
        case "agent_memory", "poke", "toolsets", "user_memory": .lightbulb04
        case "building_agents_and_skills", "skill_authoring", "workspace_management": .listSelect
        case "luma": .lumaLogo
        case "ask_user_question": .messageDotsCircle
        case "speech_generator": .messageSmileCircle
        case "microsoft_excel": .microsoftExcelLogo
        case "microsoft_drive": .microsoftLogo
        case "outlook_calendar", "outlook_mail": .microsoftOutlookLogo
        case "microsoft_teams": .microsoftTeamsLogo
        case "monday": .mondayLogo
        case "notion": .notionLogo
        case "user_analytics", "workspace_analytics": .pieChart01
        case "productboard": .productboardLogo
        case "skill_management": .puzzlePiece01
        case "agent_delegation", "agent_router", "agent_sidekick_agent_state", "agent_sidekick_context", "run_agent": .robot
        case "salesforce": .salesforceLogo
        case "salesloft": .salesloftLogo
        case "extract_data": .scan
        case "exa", "search": .searchMd
        case "shopify": .shopifyLogo
        case "slab": .slabLogo
        case "slack_bot", "slack_personal": .slackLogo
        case "snowflake": .snowflakeLogo
        case "statuspage": .statuspageLogo
        case "data_warehouses", "query_tables_v2": .table
        case "run_dust_app": .terminal
        case "ukg_ready": .ukgLogo
        case "val_town": .valTownLogo
        case "vanta": .vantaLogo
        case "sound_studio": .volumeMax
        case "zendesk": .zendeskLogo
        default: nil
        }
    }
}
