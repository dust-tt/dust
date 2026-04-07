// DO NOT EDIT — Generated from Sparkle (tailwind.config.js)
// Run: cd sparkle && node scripts/generate-swift.mjs


import SwiftUI

/// Maps internal MCP server names to their SparkleIcon.
/// Generated from front/lib/api/actions/servers/*/metadata.ts
public enum MCPServerIcon {
    public static func icon(for serverName: String) -> SparkleIcon? {
        switch serverName {
        case "agent_management", "agent_router", "agent_sidekick_agent_state", "agent_sidekick_context", "run_agent": .actionRobot
        case "agent_memory", "poke", "toolsets": .actionLightbulb
        case "ashby": .ashbyLogo
        case "common_utilities": .actionAtom
        case "confluence": .confluenceLogo
        case "conversation_files", "data_sources_file_system", "file_generation", "missing_action_catcher", "project_manager", "slideshow": .actionDocumentText
        case "data_warehouses", "databricks", "query_tables_v2": .actionTable
        case "extract_data": .actionScan
        case "fathom": .fathomLogo
        case "freshservice": .freshserviceLogo
        case "front": .frontLogo
        case "github": .githubLogo
        case "gmail": .gmailLogo
        case "google_calendar": .gcalLogo
        case "google_drive": .driveLogo
        case "google_sheets": .googleSpreadsheetLogo
        case "http_client", "web_search_browse": .actionGlobeAlt
        case "hubspot": .hubspotLogo
        case "image_generation": .actionImage
        case "include_data", "schedules_management": .actionTime
        case "interactive_content": .actionFrame
        case "jira": .jiraLogo
        case "jit_testing", "primitive_types_debugger": .actionEmotionLaugh
        case "luma": .lumaLogo
        case "microsoft_drive": .microsoftLogo
        case "microsoft_excel": .microsoftExcelLogo
        case "microsoft_teams": .microsoftTeamsLogo
        case "monday": .mondayLogo
        case "notion": .notionLogo
        case "openai_usage": .openaiLogo
        case "outlook_calendar", "outlook_mail": .microsoftOutlookLogo
        case "productboard": .productboardLogo
        case "project_conversation", "user_mentions": .actionMegaphone
        case "run_dust_app", "sandbox": .commandLine
        case "salesforce": .salesforceLogo
        case "salesloft": .salesloftLogo
        case "search": .actionMagnifyingGlass
        case "skill_management": .puzzle
        case "slab": .slabLogo
        case "slack_bot", "slack_personal": .slackLogo
        case "snowflake": .snowflakeLogo
        case "sound_studio": .actionNoise
        case "speech_generator": .actionSpeak
        case "statuspage": .statuspageLogo
        case "ukg_ready": .uKGLogo
        case "val_town": .valTownLogo
        case "vanta": .vantaLogo
        case "zendesk": .zendeskLogo
        default: nil
        }
    }
}
