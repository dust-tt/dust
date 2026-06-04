# Dust iOS

The native Swift/SwiftUI client for Dust. This file fixes the vocabulary the codebase
uses so reviews and refactors stay consistent with the web frontend (`front/`) where the
two share a behaviour model.

## Language

### Conversation & messages

**Conversation**:
A thread of messages between a user and one or more agents.

**ConversationMessage**:
One entry in a conversation — either a user message or an agent message. Modelled as the
`.user` / `.agent` enum the message list holds.

**AgentMessage**:
A message produced by an agent. While it is being produced its content arrives over a
stream; once finished it is a persisted record.

### Streaming

**AgentMessageStream**:
The pure value type that reduces a sequence of streaming events into the live state of the
one agent message currently being produced — accumulating content and chain-of-thought,
the activity lifecycle, running actions, completed steps, and any error. Holds no
SwiftUI, network, or concurrency; events in, snapshot out.
_Avoid_: AgentTurn, StreamingTurn, reducer, message reducer

**Activity**:
The lifecycle of a streaming agent message: `thinking` then `generating`. Absence of a
stream is the idle state (no `AgentMessageStream`). Distinct from a BlockedAction, which
outlives the stream.
_Avoid_: phase, agentState, status (status is the persisted terminal state of the message)

**ActivityStep**:
A completed entry in the agent's timeline — a finished thinking segment or a finished
action.
_Avoid_: inline activity step, timeline item

**ActiveAction**:
A tool currently executing within the streaming message.
_Avoid_: pending tool call, running tool

**BlockedAction**:
A point where the agent is waiting on the user before it can continue — approval of a tool
call, personal authentication, or file authorization. A concern separate from
AgentMessageStream: it is seeded by a REST reconciliation on load as well as by stream
events, and it persists past the end of the stream until resolved.
_Avoid_: blocking phase, approval state, gate
