# Failing files post introduction of SandboxFunctionRunContextType

+ means compatible and done
~ means compatible and needs work (asserts now)
- means should be filtered (some are libs so all callers should be filtered)

[-]     4  front/lib/actions/mcp_internal_actions/utils/file_utils.ts:109
[-]     5  front/lib/api/actions/servers/agent_memory/tools/index.ts:53
[-]     1  front/lib/api/actions/servers/ask_user_question/tools/index.ts:18
[-]     1  front/lib/api/actions/servers/conversation_files/index.ts:19
[-]     4  front/lib/api/actions/servers/conversation_files/tools/index.ts:98
[-]     2  front/lib/api/actions/servers/extract_data/tools/index.ts:56
[-]     1  front/lib/api/actions/servers/files/tools/agent_loop_fs.ts:15
[-]     3  front/lib/api/actions/servers/plan_mode/tools/index.ts:28
[-]     6  front/lib/api/actions/servers/run_agent/index.ts:224
           // Deeply tied to main conversation for now :/
[-]     7  front/lib/api/actions/servers/sandbox/tools/index.ts:231
[-]     4  front/lib/api/actions/servers/schedules_management/tools/index.ts:35
           // Agent specific
[-]     4  front/lib/api/actions/servers/skill_management/tools/index.ts:103
[-]     4  front/lib/api/actions/servers/toolsets/tools/index.ts:25
[-]     5  front/lib/api/actions/servers/wakeups/tools/index.ts:92
[-]     1  front/lib/api/actions/servers/helpers.ts:44
           // TODO: sidekick should be removed from list

[~]     1  front/lib/api/actions/servers/data_warehouses/tools/index.ts:262
           // TODO: end state is a migration of the whole system here but today it relies on table
                    query. To re-enable likely different path when sandbox function that writes to
                    the pod tool outputs. Will need to change the tool return (currently returns a
                    file should now be a path for that flow). See TODOs below.
[~]     1  front/lib/api/actions/servers/image_generation/helpers.ts:217
           // TODO: similar to data_warehouse, we need a specific flow to write to the pod
                    tool_outputs when in sandbox function. See TODOs below.
[~]     7  front/lib/api/actions/servers/interactive_content/tools/index.ts:52
           // We don't know how to create frames directly in pods for now.
           // Create still conversation tied. Will have to skip for now the server.
[~]     1  front/lib/api/actions/servers/query_tables_v2/tools/index.ts:284
           // TODO: similar to data_warehouse, relies on generateCSVFileAndSnippet.

[+]     1  front/lib/api/actions/servers/data_sources_file_system/tools/cat.ts:169
[+]     1  front/lib/api/actions/servers/data_sources_file_system/tools/search.ts:55
[+]     1  front/lib/api/actions/servers/common_utilities/tools/index.ts:100
[+]     3  front/lib/actions/mcp_internal_actions/wrappers.ts:141
[+]     1  front/lib/api/actions/servers/google_calendar/helpers.ts:176
           // TODO: user timezone for calendar, once we have it in invocations
[+]     2  front/lib/api/actions/servers/google_drive/tools/index.ts:300
[+]     4  front/lib/api/actions/servers/include_data/tools/index.ts:33
[+]     3  front/lib/api/actions/servers/microsoft_teams/tools/index.ts:532
[+]     2  front/lib/api/actions/servers/notion/tools/index.ts:118
[+]     2  front/lib/api/actions/servers/pod_manager/helpers.ts:147
[+]    11  front/lib/api/actions/servers/pod_manager/tools/index.ts:986
           // TODO: create_conversation should have timezone
                    origin defaults to "web" which is fine for now
[+]     3  front/lib/api/actions/servers/pod_tasks/tools/index.ts:303
[+]     3  front/lib/api/actions/servers/run_dust_app/index.ts:141
[+]     2  front/lib/api/actions/servers/search/tools/index.ts:65
[+]     3  front/lib/api/actions/servers/slack_personal/tools/index.ts:449
[+]     2  front/lib/api/actions/servers/snowflake/tools/index.ts:42
[+]     1  front/lib/api/actions/servers/user_mentions/tools/index.ts:44
[+]     4  front/lib/api/actions/servers/web_search_browse/tools/index.ts:59
[+]     1  front/lib/api/mcp/run_tool.ts:91

## notes

Ideally if createServer returns 0 tools we should not expose the server at all. Would be a nice way
to dynamically express that a server is not usable.

### TODOs:

- [x] run_tool/mcp_execution: introduce pod tool_outputs (action_output_fs, persistToolOutput)
- [ ] data_warehouse: flow to tool_outputs if in sandbox function
- [ ] image_generation: flow to tool_outputs if in sandbox function
- [ ] query_tables_v2: flow to tool_outputs if in sandbox function
- [ ] interactive_content: allow converstaion less create and publish (big one, flavien has context)
- [ ] pod_manager: filter add_message_to_conversation tool when in sandbox function 
- [ ] timezone on invocation for:
      - google_calendar
      - pod_manager/create_conversation
- [ ] runToolWithStreaming is highly conversation centric, maybe dsbx does not use it.

### files server

Maybe:
  getDustFileSystemForAgentLoop => 
    getDustFileSystemForToolContext + getDustFileSystemForSandboxFunction

But since we're in a sandbox we should never call these tools?

### interactive_content server

Interestingly only create/revert *require* an agent. I don't believe we know how to create a frame
directly in the pod through these tools. Maybe we should only have the publish action here?
