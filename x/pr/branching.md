## Conversation Forking

### Problem

As part of the sessions initiative, we want users to be able to start a new
conversation from an existing one while keeping enough context to continue the
work naturally.

Constraints:

1. forking must not disrupt the parent conversation
2. the fork must start with enough context to feel continuous
3. the fork must have its own mutable working files / filesystem
4. the lineage must be explicit in the data model, not inferred indirectly

Side note: this is not the same as the existing "branch" concept in Projects. That older
feature creates an alternate path inside a single conversation for restricted
agents. The sessions work is about creating a brand new standalone
conversation, with explicit lineage back to its parent.

### Related Context

- Sessions discussion: `#initiative_sessions`
- Main Slack thread:
  `https://dust4ai.slack.com/archives/C0AQ23Y6JGH/p1775655809989229`
- Compaction proposal:
  `https://github.com/dust-tt/dust/pull/23974/changes`
- Figma: https://www.figma.com/design/wJJMfVF6bluurSKfrEuysc/Product---WIP?node-id=5347-9855&t=uWJaIVJ4CZsDIcN0-0
- Existing intra-conversation branch model:
  `front/lib/models/agent/conversation_branch.ts`

### Solution Overview

Forking creates a new conversation, not a new branch inside the existing one.

At fork time:

- we create a new child conversation (in the same space project as the parent if applicable)
- we persist an explicit lineage row between parent and child
- we seed the child with the parent's conversation-level setup that the forking user can read
- we deep-copy the parent conversation files / filesystem into the child
- we initialize the child with a compaction message at the top of the child
- we leave the parent unchanged

For the first version, lineage is surfaced as a parent link in the forked
conversation. We do not build a full branch tree (yet).

The UI supports both:

- fork from the conversation's current visible state (= last message)
- fork from a specific earlier message

The backend always persists the resolved source message so both entry points
share the same creation flow.

### Multiple Streams

Changes naturally split into 4 streams.

#### 1. Fork Lineage and Creation

This stream introduces the new fork lineage table, the fork creation service,
and the API endpoint that creates the child conversation.

This is the foundation. It also carries the naming decision: we do not use
`conversation_branches` for this work because that name is already taken by the
existing intra-conversation branch feature.

#### 2. Fork Checkpoint / Compaction Integration

This stream is responsible for the message injected at the top of the child
conversation.

The target design uses the compaction flow from the parallel compaction proposal:

- a `CompactionMessage` is the first real message of the child conversation
- the fork creation flow relies on the `compactConversation` lifecycle and
  `CompactionMessage` shape
- the child starts from the compaction boundary rather than from copied raw
  conversation history
- the child remains blocked for posting while the initial compaction is in the
  `created` state

Until compaction ships, the fork flow can use an artificial compaction
placeholder internally. That placeholder reuses the rendered
conversation-for-model view at the resolved source message of the parent
conversation and stores it as the initial message in the child, explicitly
stating that it is a forked starting point.

Compaction happens after the fork is created. We never compact the
parent conversation as part of the fork action.

This placeholder path exists only to unblock internal development and
integration work while compaction is still in flight. Before release, fork
initialization switches to the shipped compaction flow.

#### 3. Filesystem and File Seeding

This stream gives the forked conversation its own working files.

The important decision here is that the child gets a hard / deep copy of the
parent conversation files and filesystem state. We do not keep shallow
references to parent files because the filesystem is becoming mutable and the
fork must be isolated. A notable exception is Dust knowledge (connections, folders), since it is read-only reference nodes to data (content nodes); for that we can only reuse the content node pointer.

This stream is written behind a small abstraction so the current
conversation datasource implementation can later be replaced by the proper
filesystem / MCP version without rewriting the fork flow.

#### 4. UI Surfaces

This stream adds:

- the `Branch conversation` action in the conversation menu
- the `Branch conversation` action in the per-message menu
- the lightweight lineage surface in the child conversation
- the lightweight lineage surface in the parent conversation

### Main Changes

#### New Database Table

```text
                                           Table "public.conversation_forks"
        Column         |           Type           | Collation | Nullable |                  Default
-----------------------+--------------------------+-----------+----------+--------------------------------------------
 id                    | bigint                   |           | not null | generated by default as identity
 createdAt             | timestamp with time zone |           | not null | now()
 updatedAt             | timestamp with time zone |           | not null | now()
 workspaceId           | bigint                   |           | not null |
 parentConversationId  | bigint                   |           | not null |
 childConversationId   | bigint                   |           | not null |
 createdByUserId       | bigint                   |           | not null |
 sourceMessageId       | bigint                   |           | not null |
 branchedAt            | timestamp with time zone |           | not null |
Indexes:
    "conversation_forks_pkey" PRIMARY KEY, btree (id)
    "conversation_forks_workspace_id_child_conversation_id_key" UNIQUE, btree ("workspaceId", "childConversationId")
    "conversation_forks_workspace_id_parent_conversation_id_idx" btree ("workspaceId", "parentConversationId")
    "conversation_forks_workspace_id_source_message_id_idx" btree ("workspaceId", "sourceMessageId")
Foreign-key constraints:
    "conversation_forks_workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspace(id) ON DELETE RESTRICT
    "conversation_forks_parent_conversation_id_fkey" FOREIGN KEY ("parentConversationId") REFERENCES conversation(id) ON DELETE RESTRICT
    "conversation_forks_child_conversation_id_fkey" FOREIGN KEY ("childConversationId") REFERENCES conversation(id) ON DELETE RESTRICT
    "conversation_forks_created_by_user_id_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"(id) ON DELETE RESTRICT
    "conversation_forks_source_message_id_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES message(id) ON DELETE RESTRICT
```

#### New Fork Creation Flow

The fork flow is:

1. validate read access on the parent conversation and on the concrete setup / resources that will be copied
2. resolve the source message if the UI did not specify one
3. create the child conversation in the same space/project
4. copy readable conversation-level setup from the parent and recompute child access requirements from what was actually copied
5. persist the lineage row with `branchedAt`
6. seed the child files / filesystem
7. create the initial compaction message in the child

In the target design, step 7 uses the real compaction shape:

- the child starts with a `CompactionMessage`
- that message is the history boundary for the child
- the compaction payload explicitly states that the child is a fork
- the child remains blocked for posting until the compaction status leaves
  `created`

Until compaction ships, step 7 uses an artificial placeholder with the same
product role: the placeholder reuses the conversation rendering for model at
the resolved source message and explicitly states that it is a forked message.

The child carries forward:

- the same space / project
- the parent's conversation-level enabled MCP server views that the forking
  user can read
- the parent's conversation skills that the forking user can read
- the copied files / filesystem state that the forking user can read

The child access model is derived from the setup, tools, skills, and data that
were actually copied into the child.

That means:

- we do not blindly copy the parent's `requestedSpaceIds`
- we recompute child access requirements from the copied setup and files
- the child inherits access rights from the resources it is actually given

The child does not inherit:

- the full participant roster
- read state
- unread state

The user who forked becomes the initial participant of the child.

#### Read-Side Lineage

Private conversation payloads expose fork lineage so the UI can render a
small "Branched from ..." surface in the child conversation.

#### Files and Filesystem Isolation

This is the critical behavior boundary of the feature.

Forked conversations must not share mutable working files with the parent.

That means:

- copied files in the child must point to the child conversation metadata
- mounted file paths must resolve in the child namespace
- future edits or generated files in the child must stay local to the child

This also means we do not reuse the current inferred parent/child traversal
logic used for `run_agent` file access. Fork lineage must be first-class.

### Sequence

#### 1: Fork Lineage Model

Scope:

- add the new `conversation_forks` table
- add the model / resource layer
- add the new feature flag
- add read-side lineage types for private conversations

Small, low-risk foundation, unblocks all later streams

#### 2: Backend Fork Creation

Scope:

- add the fork creation service
- add the private fork endpoint
- create the child conversation
- copy conversation-level setup
- persist `sourceMessageId` and `branchedAt`
- initialize the child with the compaction entry point
- respect compaction blocking semantics in the child when real compaction is
  available

Until compaction is shipped, this uses the artificial
placeholder behind the same fork initialization seam.

This lands before filesystem seeding is complete as long as the feature
remains internal / flagged. That gives us a usable backend slice for text-only
conversations and lets compaction work proceed in parallel.

#### 3: Filesystem / File Seeding

Scope:

- implement hard-copy seeding of conversation files into the child
- remap child file metadata
- ensure child mount paths / filesystem state are isolated

This is the part most exposed to the ongoing filesystem rework.

#### 4: Menu Action and Child Lineage UI

Scope:

- add `Branch conversation` to the conversation menu
- add `Branch conversation` to the per-message menu
- add the lightweight "Branched from ..." UI in the child conversation
- add the lightweight "XXX branched this conversation: " UI in the parent conversation
- wire the UI to the backend endpoint

#### 5: Switch Fork Initialization to Shipped Compaction

Scope:

- switch the fork initialization seam from the artificial placeholder to the
  shipped compaction flow
- keep the same fork API and lineage model

Why separate:

- compaction is already being developed independently
- this keeps the forking work moving internally without blocking on compaction
  shipping
- this is the release gate for broad exposure of the feature

### Non-Goals for the First Version

- full branch tree UI
- removing the old intra-conversation branch feature
- shared parent/child mutable filesystem state
