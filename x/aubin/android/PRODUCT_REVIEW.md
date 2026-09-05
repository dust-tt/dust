# Mobile product and engineering review

Reviewed on September 5, 2026. This review prioritizes opening something that needs attention,
asking an agent, continuing a conversation, finding previous work, and using the answer elsewhere.

## Product direction

Keep the inbox as the home screen. “Needs you” makes the next action clear, while “Recent” supports
continuing work. Keep search and compose within thumb reach above the keyboard. Agent and context
selection belong in temporary pickers so the conversation keeps most of the screen.

The visual system already gives content a clear hierarchy. The highest-value improvements are
predictable scrolling, durable work, useful search, reversible triage, and visible recovery when an
action fails. Extra home-screen cards would compete with those daily flows.

## Engineering choices

| Choice | Assessment |
| --- | --- |
| Kotlin, Compose, and a platform-neutral core | Appropriate for the existing Android scope. Keep protocol models, parsing, and send rules testable without a device; use Android adapters for lifecycle, keyboard, files, voice, and system surfaces. |
| Feature-owned state and small controllers | Keep this structure. Inbox discovery and actions now have independent coroutine tests, while platform publishing stays outside their state logic. |
| Encrypted snapshots and a durable outbox | Valuable for mobile interruptions. Accepted results must survive until the screen acknowledges them; retention must never silently evict unsent work. |
| Existing backend APIs | All implementation changes stay in `x/aubin/android`. Title search filters existing list pages locally. Unconfirmed sends require manual review because the existing APIs do not deduplicate retries. |
| Shared semantic colors, dimensions, and motion policy | Keep these as the owners of appearance. Shared touch targets are now 48 dp and controls expose their labels and selection state to accessibility services. |

## Improvements made

| Flow | Result |
| --- | --- |
| Read a long response | Incoming content preserves the reader's position. “Jump to latest” returns to the bottom. Readers already at the bottom continue following new replies. |
| Compose repeatedly | Draft saving continues after the first successful send. Knowledge selections restore with both new-conversation and reply drafts. |
| Send through interruptions | A successful send can navigate even if the subsequent metadata fetch fails. Queue errors preserve the draft and clear the sending state. |
| Keep queued work | Unsent messages and unacknowledged conversation results survive retention, including outboxes larger than 50 items. |
| Find older work | Inbox pagination and local title filtering reach beyond the first page through “Search older conversations.” Query text stays on the device. Obsolete requests are cancelled and cached matches remain visible on failure. |
| Change workspaces or display settings | Old discovery requests cannot replace the new workspace. Activity recreation preserves an active search. |
| Mark read or delete | Inbox and search results stay consistent. Failures restore only the affected item and show feedback; duplicate pending actions are suppressed. |
| Catch Up | Completion is explicit, Undo restores the previous review step, and read status saves before leaving. Failed saves offer retry. Reopening starts a fresh session, and each card starts at its own top. |
| Reuse an answer | Completed responses offer Copy with confirmation and the native Share chooser. User messages support text selection. |
| Answer a question or approve an action | Question input survives saved-state restoration, selection controls expose their state, long approval inputs remain readable and selectable, and duplicate submissions are guarded. |

## Validation and release boundaries

The review uses JVM regressions, Android instrumented tests, existing-API request-contract tests, and the sample-workspace smoke script. Manual emulator checks cover search, keyboard
dismissal, copy feedback, the Share chooser, dark mode, and 2× text size.

The sample workspace validates presentation and navigation. It does not establish production
OAuth, live streaming reconnect, real microphone quality, or behavior on a
physical Samsung device. Use the authenticated and physical-device procedures in
[DEVELOPMENT.md](DEVELOPMENT.md) for those release checks. Release signing remains a distribution requirement. Remote push registration is unavailable because
it would require backend changes; the app does not register devices or alter server configuration.
