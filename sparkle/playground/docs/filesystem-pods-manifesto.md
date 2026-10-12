# Company knowledge and the work that changes it

## The company has memory. Pods put it to work.

A SaaS company produces knowledge continuously: customer calls and recordings, sales emails, support tickets, product decisions, campaign results, account notes, proposals, and conversations with agents. Much of its work consists of finding the relevant pieces, interpreting them, and producing something another person can use.

Dust should give that knowledge a durable home and give work an explicit shape. The filesystem is the company's shared memory. A pod brings together an outcome, the relevant sources, the people and agents doing the work, and the tools and instructions they need. A pod can finish a job or keep an outcome current.

For an engineer, the filesystem resembles the company's database and a pod resembles a function over it. In the product, we speak about **sources, work, and outcomes**. People should see what a pod is trying to achieve, what it uses, what has changed, and what needs their attention. They should not need to learn database or programming concepts.

The same evidence can support many kinds of work. A customer call can inform the Voice of Customer snapshot, a large enterprise proposal, an account review, and a product decision. Those pods reference the same call. The call keeps its identity, location, history, and permissions.

## Files are the foundation, not the whole interface

Everything people work with has a file identity: documents, recordings, emails, notes, conversations, frames, agents, skills, tools, triggers, and folders. This gives them a common way to be found, linked, moved, shared, and cited.

A common identity does not imply a common editor. An agent opens its instructions, model, skills, and usage. A tool opens its connection and operation settings. A recording opens a player and transcript. A frame opens a rendered artifact. A conversation opens its messages and the files created or attached while doing the work.

The canonical file supplies the name, content, location, ownership, and permissions. A linked record supplies the configuration or runtime metadata that belongs to that type. The product resolves both into the appropriate view. A configuration record does not create a second route around file access.

The filesystem should be easy to reach without becoming the default experience everywhere. The original New Navigation remains intact: Work, Build, Admin, Inbox, Requests, Free conversations, Automated work, Starred, and Pods. The filesystem adds three distinct entry points:

- **My files**: files whose canonical home is personal storage.
- **Workspace files**: the company's organized knowledge, with access determined by each branch.
- **Shared with me**: accessible entry points into someone else's files or restricted workspace branches. It is a view, not a new storage owner. It reveals the shared entry and its accessible descendants, never inaccessible ancestors.

Folder nesting belongs in the sidebar because location matters. Expandable branches support orientation; the main panel displays their contents. Conversations also appear as expandable containers when they have children.

## Pods give work an outcome

A pod is a reusable arrangement of sources, agents, skills, tools, frames, settings, and triggers. Instructions belong to agents, not to the pod as an agent in disguise. Its configuration is metadata, including references to the files it uses and produces. Pods do not create folders, own files, or impose a storage hierarchy.

A pod's overview should answer four questions:

1. What result are we maintaining or trying to deliver?
2. Which sources support it?
3. What work has happened, manually or automatically?
4. What needs a decision next?

The whole Overview tab is a tailored embedded frame, backed by a canonical file. It runs as a standalone, sandboxed iframe: its interactions stay inside the document and cannot open application panels. There is no fixed product overview or trigger sidebar around it. Settings → Customization reuses the existing file-backed tabs UI. Users can pin files, rename tab titles, choose icons, reorder tabs, and remove a tab without deleting its file. The initial Overview is a pinned frame, and its edit icon opens the frame’s parent conversation. Tab configuration persists across reloads. Trigger management lives directly in Settings → General, with a side panel only for creating or editing a trigger: users can view enabled triggers, create event or scheduled triggers, select an agent and message, and pause or edit them. Entering a pod opens its first pinned file, initially the frame; a pod with no pinned files opens Conversations. It does not open an empty conversation. Starting a conversation is a basic action and uses the existing Dust input bar in the pod header, above the existing compact pod tabs. The composer stays available across pod views and preserves its draft. It is not attached to the bottom of the pod as if the entire pod were a chat thread.

The interface uses Dust's existing primitives: navigation, folder browser, input bar, typed object views, and the P2/P3/P4 panel architecture. Sources and outputs open beside the work. A detail view should not unexpectedly replace the workspace with a modal or introduce a second panel system.

A snapshot describes the maintained outcome in this manifesto; it is not a product object or action label. Copy describes the work directly: “Files,” “Customer feedback summary,” “Review roadmap updates,” “Draft response,” “Needs confirmation.” It should explain a real consequence when needed, without narrating the storage implementation throughout the interface.

## Linking creates context, not ownership

A pod has references in its configuration, with no corresponding pod folder. Adding an existing file creates a reference to its stable identity. Removing the reference removes it from the pod and leaves the source intact. Renaming or moving the original does not break references. Copying a file or folder link preserves its stable ID and reopens that exact file panel. Sending the link in a conversation automatically adds a reference to its context without moving or sharing the original.

Dropping files into a pod stages them. **Choose location** opens the filesystem browser; the person selects a destination and confirms the upload. Only then are the originals saved and their stable IDs linked to the pod. A batch uses one chosen destination. No automatic `pod-…` folder is created.

```text
Workspace files/
  Customers/
    Northstar/
      procurement-questions.pdf

Northstar tender configuration:
  references: [procurement-questions file ID]
```

`ln -s` is the engineering analogy for a reference. References use stable IDs rather than paths that can change. Files can also contain ordinary links to other files or containers.

**Add files** is the entry point for linking existing files to a pod or conversation. It provides a searchable, expandable picker with explicit selection and confirmation. There is no separate Browse files panel or dragging existing files between explorers. Uploads from the computer remain staged until a destination is chosen. Both staging and the destination picker show previews, filenames, types, and sizes.

An uploaded file starts with the permissions of its canonical parent. Dropping it into a shared pod does not silently share it with every member. Adding context and granting access are separate actions.

Inputs can be folders as well as individual files. A folder reference is live: new accessible children become available to subsequent work. A run records the actual input IDs and revisions it used, so a live collection and a historical result can coexist.

## Conversations are files with contents

A conversation uses the normal conversation interface: user messages, agent responses, citations, generated files, and the conversation composer. Files open in the adjacent panel. Location and sharing remain available through its toolbar. A conversation has readable content and can contain other files. It is both a document and a container. The transcript is its content; uploads, generated drafts, frames, and references are its children.

```text
My files/
  Review deployment requirements/       [conversation]
    content                             [messages]
    procurement-questions.pdf           [uploaded file]
    Draft response.md                    [output]
    Coverage review                     [frame]
    Meridian deployment call -> ...     [reference]
```

The explorer shows Name, Type, Edited by, and Updated in aligned columns. Arrows expand children in place; folder names navigate into the folder. File names open the appropriate view. A conversation’s files panel uses **Add files** to link more context. The upload destination picker uses the same tree and metadata columns. Text previews and destination selection stay in panels without fullscreen controls.

This is one conversation identity with content and children, not two unrelated objects the user must reconcile. It can be moved as a unit, linked into another pod, and revisited through either conversation or filesystem navigation. Its children move with it. References to it keep working.

The user's sharing preference determines the initial audience of a new conversation: private, shared with the pod, or shared with the workspace. That audience is applied to the conversation container. Files created underneath inherit it. A file attached by reference retains its original permissions; a reference cannot make a private source public.

## Permissions follow the canonical hierarchy

A file inherits its canonical parent’s permissions by default. People can override access on an individual file or folder: add someone by name or email, assign Viewer, Commenter, or Editor, or remove access. An explicit person rule overrides workspace-wide access, including an explicit denial. Choosing custom access stops inheritance; choosing parent access discards local overrides. This replaces the earlier additive-only proposal. The owner retains access.

A pod's membership controls access to the pod and its reference entries. The target file's access controls whether someone can read or use the target. Agents and triggered work use an explicit execution identity and the same source access rules.

A shared conversation can only use sources available to its audience in this prototype. Private sources remain visible to their owner, but are excluded from work that would expose their content to a wider audience. Runs report excluded sources. A generated output records its provenance; publishing or sharing it checks that provenance rather than treating generated text as automatically safe to distribute.

Moving a file changes its parent. A file that inherits permissions can gain access from a new parent; custom permissions stay independent. Moving it into a narrower folder preserves existing access as direct grants. Moving into itself or a descendant is invalid. Moving a source never turns its pod references into owners.

The Share dialog separates individual roles from general workspace access. All edits are staged until Save changes; Cancel discards them. The prototype stores the roles and uses effective read access when selecting sources for shared runs. It does not send invitations or simulate a separate signed-in session for each person. Production enforcement of comment and edit operations and ownership transfer remains to be designed.

## One company, two forms of work

Recurring and one-off describe these examples, not pod types. Pods have no completion or reopening controls.

The example workspace represents a SaaS company modeled on Dust. Its customers, commercial details, product claims, calls, recordings, and operational data are fictional. They are coherent sample evidence, not assertions about Dust's actual customers or capabilities.

The company acquires customers through content, events, referrals, and a sales motion. Calls create recordings and transcripts. Follow-up emails describe requirements. CRM records add account context. Support tickets and product usage reveal recurring problems. Agents turn this material into briefs, summaries, answers, and decisions. MCP servers provide connections to the systems where this work already happens.

### Voice of Customer is a loop

**Outcome:** a concise, queryable snapshot of customer feedback by topic, supported by evidence, with proposed roadmap updates when patterns deserve attention.

The pod references the customer call library, feedback emails, support tickets, account context, a research agent, synthesis skills, and relevant tools. It does not import private copies of those sources.

A human can ask, “What are customers saying about admin controls?” and get a sourced answer. A new-call trigger can refresh the snapshot and create a reviewable roadmap proposal. A run produces a conversation showing the work, an updated snapshot, a frame for scanning the topics, and any proposals requiring a decision.

Roadmap proposals are suggestions, not automatic commitments. A human reviews the evidence and approves an update. The prototype records the resulting issue in the simulated Linear connection. It sends nothing to a real external system.

The loop has memory: the latest output, previous runs, the sources each run used, and pending proposals. Re-running it updates the maintained snapshot and does not manufacture duplicate roadmap issues.

### Northstar tender is a bounded job

**Outcome:** an evidence-backed response to a large customer's tender, with requirement coverage, open questions, and a reviewable submission draft.

The pod references the tender packet, procurement emails, current product and security documentation, CRM context, and selected calls from comparable customers. Some of those calls are already sources for Voice of Customer. That reuse is the point: assembling a pod is cheaper and safer than assembling another copy of company knowledge.

The owner can upload additional questions, link another call, start a conversation, draft the response, inspect the coverage frame, and resolve gaps. Unsupported claims stay marked “Needs confirmation.” The prototype does not turn an absent source into an assertion that the product meets a requirement.

The final response and review frame remain ordinary files, with a known location, audience, and provenance. Finishing the work does not require marking the pod complete or deleting its sources, conversations, or outputs. The outputs can become inputs to the next deal or to the Voice of Customer loop.

## Try the company workspace

Open `http://localhost:3008/#Pod_Workspace`. Both pods already contain completed work. Voice of Customer opens with four accounts in its snapshot, two historical runs, an approved roadmap issue, and a proposal awaiting review. Northstar tender already has a response, a coverage review, an uploaded clarification linked from My files, and conversations showing how the work was done.

Start with the customer findings on the overview or open the tender response. Further updates are optional; triggers are managed in Settings. Drop files onto **Files**, choose their destination, and confirm the upload. Use file toolbar icons or row menus to copy a link, share, move, or link the original to another pod. Double-click a file title to rename it. The conversation composer’s sharing selector determines who inherits access to new attachments.

The sidebar contains canonical folders and expandable conversations. Search finds files across accessible locations. Local changes survive reloads. Text uploads are readable and searchable. Binary uploads can be downloaded; the demo accepts up to 1.5 MB per upload and does not extract their contents.

## What makes the prototype working

The prototype must make the consequences observable:

- Browse and search the company hierarchy, including calls, recordings, transcripts, emails, notes, product knowledge, and typed agent/tool/skill/frame files.
- Link one canonical source into both pods, move it, and see both references still resolve.
- Stage a batch of uploads, choose their canonical destination, and confirm. Find the originals there and their references in the pod.
- Start and continue a conversation; inspect its files; move or link the entire conversation.
- Change the initial sharing preference, then inspect inherited access on a generated child.
- Browse and filter the tailored frames. Open evidence and roadmap proposals from Files or conversations; open each frame’s editing conversation from Settings.
- Create event and scheduled triggers, pause or edit them, and inspect local test-run conversations. Scheduled execution and connected events remain simulated.
- Expand context folders in a tree, select entries independently, and preview files in the next panel.
- Prepare the tender response and coverage frame from the linked evidence; inspect and resolve gaps.
- Persist local changes across reloads.

Agents, incoming events, MCP connections, and external writes are simulated. The browser performs real local state transitions, access checks, linking, moves, queries, output generation, and persistence. Simulation details belong in prototype documentation rather than persistent product navigation.

## Questions this foundation leaves open

Production work must resolve execution identities for unattended loops, revocation of already-generated outputs, connector-owned files versus editable local files, version retention, deletion and broken links, and how a reviewed output may be deliberately shared more widely than its inputs.

Those questions should strengthen a common foundation. They should not force users to learn a separate ownership and permission model for every new capability.

The product promise is straightforward: give company knowledge a durable home, assemble the context needed for an outcome, and let people and agents do work whose results remain useful afterward.
