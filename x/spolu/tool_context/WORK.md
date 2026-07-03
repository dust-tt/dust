# Failing files post introduction of SandboxFunctionRunContextType

+ means compatible and done
~ means compatible and needs work (asserts now)
- means should be filtered (some are libs so all callers should be filtered)

[-]     4  front/lib/actions/mcp_internal_actions/utils/file_utils.ts:109
[+]     3  front/lib/actions/mcp_internal_actions/wrappers.ts:141
[-]     5  front/lib/api/actions/servers/agent_memory/tools/index.ts:53
[-]     1  front/lib/api/actions/servers/ask_user_question/tools/index.ts:18
[+]     1  front/lib/api/actions/servers/common_utilities/tools/index.ts:100
[-]     1  front/lib/api/actions/servers/conversation_files/index.ts:19
[-]     4  front/lib/api/actions/servers/conversation_files/tools/index.ts:98
[+]     1  front/lib/api/actions/servers/data_sources_file_system/tools/cat.ts:169
[+]     1  front/lib/api/actions/servers/data_sources_file_system/tools/search.ts:55
[~]     1  front/lib/api/actions/servers/data_warehouses/tools/index.ts:262
           // TODO: migrate to CSV output to DFS
[-]     2  front/lib/api/actions/servers/extract_data/tools/index.ts:56
[-]     1  front/lib/api/actions/servers/files/tools/agent_loop_fs.ts:15
[+]     1  front/lib/api/actions/servers/google_calendar/helpers.ts:176
           // TODO: user timezone for calendar, once we have it in invocations
[+]     2  front/lib/api/actions/servers/google_drive/tools/index.ts:300
[ ]     1  front/lib/api/actions/servers/helpers.ts:44
[ ]     1  front/lib/api/actions/servers/image_generation/helpers.ts:217
[ ]     4  front/lib/api/actions/servers/include_data/tools/index.ts:33
[ ]     7  front/lib/api/actions/servers/interactive_content/tools/index.ts:52
[ ]     3  front/lib/api/actions/servers/microsoft_teams/tools/index.ts:532
[ ]     2  front/lib/api/actions/servers/notion/tools/index.ts:118
[ ]     3  front/lib/api/actions/servers/plan_mode/tools/index.ts:28
[ ]     2  front/lib/api/actions/servers/pod_manager/helpers.ts:147
[ ]    11  front/lib/api/actions/servers/pod_manager/tools/index.ts:986
[ ]     3  front/lib/api/actions/servers/pod_tasks/tools/index.ts:303
[ ]     1  front/lib/api/actions/servers/query_tables_v2/tools/index.ts:284
[ ]     6  front/lib/api/actions/servers/run_agent/index.ts:224
[ ]     3  front/lib/api/actions/servers/run_dust_app/index.ts:141
[ ]     7  front/lib/api/actions/servers/sandbox/tools/index.ts:231
[ ]     4  front/lib/api/actions/servers/schedules_management/tools/index.ts:35
[ ]     2  front/lib/api/actions/servers/search/tools/index.ts:65
[ ]     4  front/lib/api/actions/servers/skill_management/tools/index.ts:103
[+]     3  front/lib/api/actions/servers/slack_personal/tools/index.ts:449
[ ]     2  front/lib/api/actions/servers/snowflake/tools/index.ts:42
[ ]     4  front/lib/api/actions/servers/toolsets/tools/index.ts:25
[ ]     1  front/lib/api/actions/servers/user_mentions/tools/index.ts:44
[ ]     5  front/lib/api/actions/servers/wakeups/tools/index.ts:92
[ ]     4  front/lib/api/actions/servers/web_search_browse/tools/index.ts:59
[ ]     1  front/lib/api/mcp/run_tool.ts:91

## notes

Ideally if createServer returns 0 tools we should not expose the server at all. Would be a nice way
to dynamically express that a server is not usable.

### files server

Maybe:
  getDustFileSystemForAgentLoop => 
    getDustFileSystemForToolContext + getDustFileSystemForSandboxFunction

But since we're in a sandbox we should never call these tools?
