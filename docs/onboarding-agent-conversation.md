# Onboarding Agent Conversation - Technical Design

## Overview

Enhance the Dust global agent to initiate guided onboarding conversations with new users. The agent will teach users how to use the product by guiding them through key actions, highlighting UI elements, and tracking their progress.

## Goals

- Dust agent proactively starts conversation when user first onboards
- Agent can prompt users to connect tools/integrations via interface buttons
- Agent can emphasize UI elements through visual highlights
- Agent tracks user progress toward completing onboarding actions

## Implementation Approach

### 1. Markdown Custom Directives

Extend the existing markdown directive system (`remark-directive`) with two new directive types:

**Connection Button Directive**
- Purpose: Render actionable buttons to connect tools/integrations
- Type: Text directive (inline)
- Triggers: OAuth flow for tool connections or data source integrations
- Integrates with: Existing OAuth and MCP server connection infrastructure

**Highlight Directive**
- Purpose: Emphasize UI elements in the Dust interface
- Type: Text or container directive
- Targets: Specific UI elements (buttons, menus, sections)
- Renders: Visual emphasis overlay or indicator

Both directives follow the existing pattern:
- Plugin function transforms AST node (`visit(tree, ["textDirective"], ...)`)
- React component handles rendering
- Registered in agent message markdown components

### 2. Progress Tracking Memory

Use the existing agent memory MCP server tool:
- Agent stores user progress as memory entries
- Tracks completed actions (e.g., "connected_google_drive", "created_first_agent")
- Memory is user-scoped (per user, per Dust agent)
- Agent queries memory to determine next onboarding steps

Memory operations available:
- `retrieve` - Check current progress
- `record_entries` - Store completed milestones
- `edit_entries` - Update progress state

### 3. Onboarding Flow Integration

**Trigger**: When user completes `/w/[wId]/welcome` page (profile form)

**Redirect**: To conversation with Dust agent (`?welcome=onboarding` or similar)

**Agent Behavior**:
1. Checks memory for existing progress
2. Initiates conversation with greeting and first task
3. Outputs markdown with directives (buttons, highlights)
4. Updates memory as user completes actions
5. Adapts conversation based on progress state

## Architecture Components

### Frontend Components

**New Components**:
- `ConnectionButtonBlock.tsx` - Renders connection buttons from directive
- `HighlightBlock.tsx` - Renders UI highlights from directive

**Modified Components**:
- `AgentMessage.tsx` - Register new directive components
- `ConversationLayout.tsx` - Handle onboarding-specific routing
- Existing connection flows - Support directive-triggered connections

### Backend/Agent Configuration

**Dust Agent Updates**:
- Onboarding-specific instructions (when to guide users)
- Access to memory tool (already configured)
- Tool capabilities for checking workspace state

**API Integration**:
- Directives trigger existing OAuth flows
- Memory API for progress tracking (existing)
- No new endpoints required

### Directive Examples

**Connection Button**:
```
:connect_button[Connect Google Drive]{provider=google_drive useCase=connection}
```

**Highlight**:
```
:highlight[Create Agent button]{target=createAgentButton}
```

## Key Constraints

- Leverages existing systems (markdown directives, memory, OAuth)
- No new database models required
- Directives only work in agent messages (not user messages)
- Memory limited to 16,384 chars per user-agent pair
- Agent must explicitly manage memory (not automatic)

## Success Criteria

- Agent can guide users through first connection setup
- Agent can direct attention to specific UI elements
- Agent maintains progress across conversation sessions
- User can complete onboarding at their own pace
