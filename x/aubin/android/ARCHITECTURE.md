# Android Architecture And UI Contract

The Android app is feature-oriented. Package boundaries are part of the design, not just source
organization, and `make check-architecture` enforces the measurable rules below.

## Dependency Direction

```text
ui/DustApp
    +-- auth
    +-- frame shares
    +-- navigation
            +-- composer <-------- conversation/detail
            +-- inbox -----------> message
            +-- conversation/files -> frame + message
            +-- conversation/detail -> message
```

All UI layers may depend on common, theme, and their explicitly allowed feature dependencies.
Preview fixtures are injected only by local-preview paths.

- `ui/DustApp.kt` is the app entry point. It owns authentication, deep links, and session-scoped
  ViewModel lifetime. It is the only Kotlin file allowed directly in the root UI package.
- `ui/navigation` owns authenticated destinations, back behavior, top chrome, and feature routing.
  It coordinates features but does not own feature state or rendering. Expanded windows keep the
  inbox in a list pane while inbox-owned destinations render in a detail pane.
- `ui/auth` owns authentication state, browser-return handling, and the login screen.
- `ui/composer` owns draft input, focus and IME policy, attachments, realtime voice transcription,
  agent and context pickers, and skill slash suggestions.
- `ui/inbox` owns the conversation list, Catch Up, row actions, grouping, and inbox search. Its
  `pod` subpackage owns the four-tab Pod workspace, including tasks, files, settings, and pinned
  Frame presentation.
- `ui/conversation/detail` owns conversation state, streaming, blocked actions, replies, continuous
  voice-turn orchestration, and scroll follow policy.
- `ui/conversation/files` owns file lists and attachment viewers.
- `ui/frame` owns WebView lifecycle, embedded navigation policy, and shared-frame presentation.
- `ui/message` owns message, Markdown, attachment, timeline, and blocked-action rendering.
- `ui/common` contains stateless primitives shared by multiple features, shared loading states, and
  the ViewModel factory. Feature-specific policy does not belong here.
- `ui/preview` contains deterministic local-preview fixtures. Production behavior must not depend
  on preview data.
- `ui/theme` is the only owner of the general color, type, and shape system. The explicit avatar
  palette is the sole raw-color exception outside the theme.

The Android shell keeps operating-system adapters outside UI packages:

- `data/persistence` stores encrypted session navigation, drafts, widget state, and outbox entries;
  `data/outbox` owns durable dispatch and retry policy; `data/offline` stores bounded, encrypted,
  user-scoped read snapshots. `AppGraph` is their composition root.
- `audio` owns Android microphone capture, output audio focus, and text-to-speech playback. It does
  not choose which conversation turn should be spoken.
- `notifications`, `shortcuts`, `share`, `search`, `widget`, and `quicksettings` own their matching
  platform contracts. They may translate platform events into destinations or repository work, but
  they do not render feature screens.
- `preview` provides Android Studio Compose/Glance previews. `baselineprofile/` is a separate
  test-only module that drives release journeys and never participates in app runtime.

Dependencies point toward shared packages. Features do not import the app shell or unrelated
features. The detail feature may reuse the composer and message layers; files may reuse frame and
message; inbox may reuse message. Composables render state and emit events. ViewModels own async
work and repository calls. Platform-independent protocol and business rules belong in `core`.

## Source Rules

- Use one ViewModel per `*ViewModel.kt` file.
- Keep normal UI files at or below 300 lines and controller or ViewModel files at or below 350
  lines. These are ceilings, not targets. Split a file earlier when it owns
  independent UI flows, async lifecycles, fixture domains, or reusable controls.
- Keep non-UI app and core production files at or below 350 lines and debug presentation files at
  or below 300 lines. Repository clients, serializers, parser stages, and demo screens each live in
  files named after the domain behavior they own.
- Name files after the behavior or component they own. A screen coordinates its layout; pickers,
  viewers, controls, data fixtures, stream lifecycles, and message stores live in focused files.
- Do not add catch-all files such as `UiConstants.kt`, `*Support.kt`, `*Utils.kt`, or `*Helpers.kt`.
  Constants live beside the behavior they tune.
- Use explicit imports. Wildcard UI imports hide boundary violations.
- Keep Android and AndroidX APIs out of `core`.
- Add focused pure-state tests for focus, send readiness, stream reduction, navigation policy, and
  other behavior that does not require a device.
- Persist user-authored work before network dispatch. Pending work can send when connectivity returns. Unconfirmed deliveries require manual review;
  the existing API does not provide send deduplication. Platform entry points restore through the
  same session and navigation reducers as app UI.

## Mobile UI Rules

- Primary compose and search input stays docked above the bottom system/IME inset. A search field
  may sit at the top only inside a transient picker sheet.
- Do not copy desktop layout mechanically. The keyboard is intrusive, so request focus for a new
  draft or an active editing continuation, restore it after a temporary picker only when editing
  was active, and clear it when navigation or explicit dismissal ends editing.
- Agent avatars are square with an 8 dp corner radius. User avatars are round. Conversations,
  workspaces, files, skills, tools, and actions use icons or status marks, never decorative avatars.
- Use a 4 dp spacing grid. Interactive targets are at least 48 dp. Main page sections are unframed;
  cards are reserved for repeated items, blocked actions, and genuinely bounded tools.
- Generic controls and cards use at most an 8 dp corner radius. Message bubbles and modal sheets are
  deliberate exceptions.
- Use Material semantic colors or named tokens from `ui/theme`. Do not define ad hoc feature colors.
- Use familiar icons for icon-only actions, always with a content description. Text buttons are for
  clear commands, not as substitutes for standard icons.
- Compact windows use one destination at a time. Expanded windows may use list/detail only when the
  detail returns to the inbox; fold hinges must be treated as pane boundaries rather than content.

## Design Language

The UI is quiet, content-first, and touch-first. Styling communicates meaning; feature screens do
not choose colors or geometry independently.

| Meaning | Treatment |
| --- | --- |
| Page and reading surface | Neutral `background`; sections remain unframed |
| Quiet interactive surface | `interactiveSurface`, subtle border, 8 dp radius |
| Bounded tool or state | `boundedSurface`, subtle border, 8 dp radius |
| Forward or commit action | Blue `action` with `onAction` content |
| Current selection or focus | Blue `actionContainer`, blue icon/check/border |
| Action required | Yellow status mark only |
| Error or destructive action | Red error role only |
| Supporting content | `contentMuted`; never use opacity alone to invent a hierarchy |

The action hierarchy is explicit:

- `DustButton` owns all text actions. Primary is blue, secondary is a quiet fill, outline is a
  neutral alternative, neutral text is for dismissal or skipping, and destructive is red.
- `DustIconButton` owns standard icon commands. It is 48 dp with a 20 dp icon. A blue container is
  reserved for a primary command or active selection.
- Circular icon buttons are limited to recording controls. Other commands use the shared 8 dp
  action shape.
- Every primary workflow has one visually dominant action. Equal-weight alternatives use secondary
  or outline treatment.

The layout scale is defined in `ui/theme/Layout.kt`:

- Page edge: 16 dp. Bottom command edge: 12 dp. Standard internal gap: 12 dp. Compact gap: 8 dp.
- Touch target: 48 dp minimum. Field and text-action height: 48 dp. Navigation row: 56 dp minimum.
- Generic controls and bounded surfaces: 8 dp radius. User message bubbles: 16 dp. Modal sheets use
  the platform sheet shape.
- Page title: `titleMedium`. Section label: muted `labelMedium`. Row title: strong body or label.
  Metadata: muted `bodySmall`.

Component placement follows mobile behavior:

- Primary search and message input live at the bottom. Picker-sheet search lives below the sheet
  header at the top because it filters the transient list.
- `DustSearchField` is the only search presentation: 48 dp, quiet fill, blue focus border, leading
  search/back icon, trailing clear action, and IME Search dismissal.
- The composer is one bounded 8 dp panel above system and IME insets. Tools are 48 dp, agent identity
  is the only avatar in the toolbar, and send becomes blue only when it can commit.
- Sheets use `boundedSurface`, `DustModalHeader`, a top search when needed, and rows of at least 56 dp.
- Empty and error states are unframed icon/title/body/action layouts. Brand art is not a fallback
  avatar or generic feedback icon.
- Loading skeletons match the dimensions and radii of the content they replace to avoid layout
  shifts.

Identity is strict: agents use square avatars, users use round avatars, and nothing else is an
avatar. Conversations, workspaces, files, Frames, capabilities, skills, tools, and statuses use
icons or status marks. Selection controls use radio or checkbox icons rather than avatar-like
circles.

`make verify` runs the architecture check, unit tests, all supported builds, Android lint, brand
validation, and build-configuration checks. Run the Samsung smoke suite after changes to layout,
focus/IME behavior, authentication, deep links, streaming, attachments, Frames, or voice input.
