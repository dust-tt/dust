# Page Layout System — Audit & Strategy

> Living spec. Sections 2 (audit) captured July 2026; section 3 (strategy) is the
> normative part and should be kept up to date as rules are ratified and phases ship.

## 1. TL;DR

Page layout (margins, gutters, max-widths, vertical rhythm) is decided in **three
different packages** (`sparkle`, `front`, `front-spa`) by **at least nine different
mechanisms**, with no written convention. The shell (`AppContentLayout`) is sound but
only 5 of 65 pages tell it what width they want in their own file (14 more inherit a
width from middleman layouts) — everything else gets behavior by accident. The entire
17-page admin cluster bypasses the shell with its own third width (`max-w-6xl` vs
`4xl`) and its own breakpoint (`sm:` vs `md:`).

The strategy: classify every page into one of **five layout archetypes** (Centered,
Wide, Full, Flow, Standalone), make the archetype an **explicit, required declaration**
owned by `AppLayoutContext`, implement widths/gutters **once** in the shell via Sparkle
primitives and tokens, and deprecate the shadow shells (`AdminLayout`,
`GovernancePageLayout`) and duplicated primitives. Rollout is 4 independently
shippable phases: tokens → shell enum → page classification → interior cleanup +
enforcement.

---

## 2. Audit — current state

### 2.1 Inventory: every mechanism that decides layout today

| # | Mechanism | Package | What it decides | Key values | Consumers |
|---|-----------|---------|-----------------|-----------|-----------|
| 1 | Route wiring (`src/app/routes.tsx` + `src/app/routes/*.tsx`, `src/app/layouts/*RouterLayout.tsx`) | `front-spa` | Which shell/scaffold wraps each route group | `AppContentRouterLayout` = `AppLayoutProvider` + `AppContentLayout`; admin routes additionally wrapped by `RequireRoleLayout` → `AdminLayout`; spaces → `SpaceRouterLayout`; apps → `DustAppRouterLayout`; onboarding & builder routes sit **outside** the shell | all routes |
| 2 | `AppContentLayout` (`front/components/sparkle/AppContentLayout.tsx`) | `front` | The app frame: content panel, gutter, max-width, scroll | panel `my-2 mr-2 rounded-xl border h-panel`; gutter `px-4 md:px-8`; `contentWidth === "centered"` → `max-w-4xl` + `pt-4`; `"wide"` → full width + `pt-8`; **unset → children render raw, no gutter, no max-width** | every in-shell page |
| 3 | `AppLayoutContext` (`front/components/sparkle/AppLayoutContext.tsx`) | `front` | Per-page width intent + title/nav | `contentWidth?: "centered" \| "wide"` (optional — `undefined` is a de facto third state) | 8 call sites for `useSetContentWidth` (7 pages + `SpaceLayout`, `DustAppPageLayout`) |
| 4 | Sparkle `Page` (`sparkle/src/components/Page.tsx`) | `sparkle` | Its own page scaffold **and** flex/gap primitives | scaffold: `max-w-4xl`, `py-16`, `gap-6 px-6` (normal) / `py-4 px-2 gap-4` (modal); `Page.Vertical/Horizontal/Fluid` with semantic gap scale `xs..xl` → `gap-1/2/3/5/8` | ~39/65 pages (mostly the primitives, rarely the scaffold) |
| 5 | Sparkle `Container` (`sparkle/src/components/Container.tsx`) | `sparkle` | Scrollable content wrapper with its own padding model | `@container` + container-query padding `px-3 py-8 @sm:px-6 @md:px-9 @lg:px-12`; `fixed` → `max-w-4xl` | sparse |
| 6 | `AdminLayout` (`front/components/layouts/AdminLayout.tsx`) | `front` | A parallel content container for all admin routes | `pt-4 sm:pt-8`, `max-w-6xl px-4 sm:px-8 pb-4 sm:pb-8` — **different max-width and breakpoint than the shell**; wired via `front-spa`'s `RequireRoleLayout`, invisible to the pages it wraps | all manager/admin routes |
| 7 | Page-local layouts (`GovernancePageLayout.tsx`; assorted per-page wrappers) | `front` | Ad-hoc containers re-deciding width/padding inside the shell | varies per file | governance + scattered |
| 8 | `PokeLayout` (`front/components/poke/PokeLayout.tsx`) | `front` | Separate universe for the internal admin tool | flat `p-6`, no max-width, no centering | poke (out of scope; cited as evidence the fragmentation compounds) |
| 9 | Overlays & panels: `Sheet` size map, `Bar`/`HoveringBar`/`Toolbar`, `SidebarLayout` vs `Resizable` | `sparkle` | Panel widths, action-bar chrome, split panes | `Sheet` sizes `md..3xl` → `max-w-md..5xl`; three overlapping toolbar components; **two** resizable-pane systems (`allotment` in `SidebarLayout` — marked "not ready for production" — vs `react-resizable-panels` in `Resizable`) | widespread |

Nothing is written down: `front/AGENTS.md` and `CODING_RULES.md` contain zero layout
rules (and `AGENTS.md` still claims Next.js 14 / Tailwind 3 — the app is Vite +
Tailwind v4; worth fixing for credibility while landing this doc).

### 2.2 Quantified spread

Counts from `front/components` (July 2026, `grep -rhoE` over `*.tsx`).

**`max-w-*` — 8+ competing content widths** (top of the histogram):

| class | count | | class | count |
|---|---|---|---|---|
| `max-w-full` | 18 | | `max-w-xl` | 6 |
| `max-w-md` | 17 | | `max-w-6xl` | 6 |
| `max-w-4xl` | 15 | | `max-w-7xl` | 5 |
| `max-w-conversation` | 14 | | `max-w-5xl` | 5 |
| `max-w-sm` | 12 | | long tail (`xs/2xl/3xl/fit/48/72/…`) | ~20 |

Even inside page files, where the shell is supposed to own width, pages re-declare
`max-w-xl/2xl/3xl/4xl/5xl/72` locally — sometimes *contradicting* the shell width
they inherit.

**Padding — no gutter token, free-for-all**: `p-4` ×175, `py-2` ×102, `pt-4` ×90,
`px-4` ×89, `py-8` ×79, `px-2` ×75, `py-4` ×69, `px-3` ×69, `pb-4` ×60, `p-2` ×52,
`p-3` ×51, `p-6` ×28, `px-6` ×14 … The shell gutter is `px-4 md:px-8`, but nothing
stops (or even documents) pages adding their own horizontal padding on top of it.

**Gaps — numeric beats semantic ~3:1 in page files**: `gap-2` ×47, `gap-4` ×43,
`gap-6` ×18, `gap-8` ×16, `gap-3` ×15, `gap-1` ×13. Sparkle's semantic scale
(`Page.Vertical gap="md"`) exists but even newer Sparkle components hardcode numeric
gaps (`Bar` `gap-3`, `Sheet` `gap-5`, `CardGrid` `gap-2`, `SettingsList` `gap-4`).

**Breakpoints — two conventions**: the shell and conversation surfaces use `md:`
(`md:px-8` ×4, `md:max-w-conversation` ×5, `md:pt-0` ×5); `AdminLayout` and a handful
of components use `sm:` for the same kind of decisions (`sm:px-6` ×5, `sm:pt-8`,
`sm:px-8`). (The biggest `sm:` count, `sm:flex-row` ×19, comes from Sparkle's own
`Page.Horizontal` — the design system itself picked the other breakpoint.)

**`contentWidth` adoption** (full accounting in §2.4): a width is in effect for 19 of
65 pages — only **5 set it in their own file** (`CreateAgentPage`, `ManageAgentsPage`,
`ManageSkillsPage`, `LabsPage`, `TranscriptsPage`); 14 inherit it from middlemen
(6 spaces pages via `SpaceLayout` → wide, 8 dust-app pages via `DustAppPageLayout` →
centered). The **17 admin pages set nothing** — they ride the full-bleed raw path and
rely on `AdminLayout`'s local `max-w-6xl` wrapper instead. The rest are intentionally
full-bleed (conversation, pod) or outside the shell (onboarding, builders,
standalone apps).

**Overlay widths (for scope)**: `Sheet` size usage is already consistent — `lg` ×25,
`xl` ×13, `3xl` ×1. Overlays are explicitly **deferred** from this strategy; the sheet
size map is fine as is.

### 2.3 Named anti-patterns

Names are deliberate — use them in PR reviews. Each maps to a cure in §3.6.

**AP1 — Two sources of `max-w-4xl`.** Sparkle `Page` (scaffold: `max-w-4xl px-6
py-16`, viewport breakpoints) and Sparkle `Container` (`fixed` → `max-w-4xl`,
container-query padding `@sm:px-6 @md:px-9 @lg:px-12`) both implement "the centered
content column" with incompatible padding models — and the shell (`AppContentLayout`)
implements it a *third* time (`max-w-4xl px-4 md:px-8`). Same intent, three
implementations, three different gutters.
*Symptom*: the "same" centered page has different margins depending on which wrapper
it happened to use. *Root cause*: no single owner for the content-column concept.

**AP2 — Default-by-omission.** `contentWidth` is optional and ~58/65 pages don't set
it. Unset means children render **raw** — no gutter, no max-width (see
`AppContentLayout.tsx:174`, `:216`). Whether a page is full-bleed is thus mostly an
accident of what nobody wrote. *Symptom*: new pages look broken-wide until someone
notices; copy-pasted pages inherit invisible behavior. *Root cause*: the enum has no
required `"full"` value, so absence is overloaded to mean it.

**AP3 — Shadow shells.** `AdminLayout` (`max-w-6xl`, `sm:` breakpoints, own `pt`/`pb`)
re-solves what `AppContentLayout` owns — and it's applied in a *different package*
(`front-spa/src/app/layouts/RequireRoleLayout.tsx`), so a page author reading the page
file cannot see why admin pages are wider. `GovernancePageLayout` and `PokeLayout`
repeat the pattern at smaller/larger scale. *Symptom*: admin pages have visibly
different gutters and width than settings pages one click away. *Root cause*: no
sanctioned way to say "this cluster wants a wider column", so clusters fork the shell.

**AP4 — Query duality.** Container queries (`Container`, `CardGrid`,
`InteractiveImageGrid`) and viewport queries (shell, `Page.Horizontal`, `AdminLayout`)
coexist with no rule for which applies where — and within viewport queries, `sm:` vs
`md:` splits by file. *Symptom*: components change layout at different moments than
the page around them, especially inside split panes where viewport width lies.
*Root cause*: convention never written down.

**AP5 — Numeric drift.** The semantic gap scale (`Page.Vertical gap="xs..xl"`) lost to
raw `gap-2/4/6/8` — 3:1 in page files, and even newer Sparkle components hardcode
numeric gaps. Meanwhile both scales are in use, so neither is a reliable signal of
intent. *Symptom*: adjacent sections with 12px vs 16px vs 24px rhythm for no reason.
*Root cause*: the semantic scale maps to odd values (`md` → `gap-3`) and was never
documented as the ramp.

**AP6 — Toolbar trio / resize duo.** `Bar`, `HoveringBar`, `Toolbar` all provide
horizontal action containers (fixed bar / floating pill / inline-or-overlay);
`SidebarLayout` (allotment, marked "not ready for production") and `Resizable`
(react-resizable-panels) both provide resizable panes. *Symptom*: pick-your-own-chrome;
two dependencies for one job. *Root cause*: additive evolution, no deprecation pass.

**AP7 — Split-brain wiring.** The answer to "what layout does this page get?" spans
three packages: `front-spa` decides the wrapper, `front` decides the shell config,
`sparkle` provides the primitives — and the page file itself often shows none of it.
*Symptom*: layout bugs require tracing route wiring across repos-within-the-repo.
*Root cause*: the SPA migration moved routing out of `front` but layout policy
didn't move with it (nor get a contract).

### 2.4 Appendix: page-by-page classification

> Generated per-page inventory: current shell config, wrapper classes, and proposed
> archetype. This table doubles as the Phase 2 migration checklist.

#### Summary

- **Total pages**: 65
- **Per archetype**: Centered 14 · Wide 12 · Full 6 · Flow 9 · Standalone 23 · (1 unclassifiable redirect, see below)
- **Pages with `useSetContentWidth` in effect**: 19 — 5 set it in the page file itself (CreateAgentPage, ManageAgentsPage, ManageSkillsPage, LabsPage, TranscriptsPage); 14 inherit it from a middleman (6 spaces pages via `SpaceLayout` → "wide", 8 dust-app pages via `DustAppPageLayout` → "centered"). The 17 admin pages set **nothing** (full-bleed raw path) and rely on `AdminLayout`'s local `max-w-6xl` wrapper instead.
- **Pages using Sparkle `Page.*` primitives**: 29 (plus 4 more that use only the bare `<Page>` wrapper: InviteChoosePage, NoWorkspacePage, and Join/Welcome via `OnboardingLayout`).
- **Pages with a layout-bearing local `max-w-*` at/near top level**: 8 (SsoEnforcedPage 5xl, InviteChoosePage 2xl, JoinPage md, NoWorkspacePage 2xl, SelectSubscriptionPage 4xl, SubscribePage 2xl, TrialEndedPage 5xl, VerifyPage xl) — all Standalone, so no direct shell conflict, but 6 different widths across one onboarding funnel. Separately, `AdminLayout` imposes `max-w-6xl px-4 sm:px-8` on all 17 admin pages — a width that exists in neither shell mode.
- **Pages that don't cleanly fit an archetype**:
  - `spaces/SpacesRedirectPage` — pure client redirect spinner mounted inside the shell with nothing set (full-bleed by accident, `h-screen` spinner inside the panel). No real archetype; counted separately.
  - `spaces/apps/AppViewPage` — the app block editor rendered inside the Flow-style centered `DustAppPageLayout`; if the editor ever needs real estate it's a Full candidate.
  - `workspace/subscription/ManageSubscriptionPage`, `share/SharedFilePage`, `oauth/OAuthFinalizePage`, `oauth/OAuthSetupRedirectPage` — spinner-then-redirect pages; classified Standalone by host context, but they render no layout of their own.

##### Router layout key

| Router layout (front-spa) | Wraps with (front) | Effective shell config |
|---|---|---|
| `AppContentRouterLayout` | `AppLayoutProvider` + `AppContentLayout` | shell chrome; pages/middlemen declare width |
| `RequireRoleLayout` | `AdminLayout` | subNav only; **no contentWidth**; local `max-w-6xl px-4 sm:px-8 pt-4 sm:pt-8` |
| `SpaceRouterLayout` | `SpaceLayout` | `contentWidth="wide"` + navChildren + breadcrumb header |
| `DustAppRouterLayout` | `DustAppPageLayout` | `contentWidth="centered"` + `contentClassName="pt-0"` + `hideSidebar` + close-title + sticky Tabs |
| `ConversationRouterLayout` | `ConversationLayout` | `hasTitle` only; contentWidth unset (intentional full-bleed) |
| `PodRouterLayout` | `PodLayout` | `hasTitle` when pod active; contentWidth unset (intentional full-bleed) |
| — (builderFullPage / adminFullPage / onboarding routes) | none | outside `AppContentLayout` entirely |
| `UnauthenticatedPage` / `AuthenticatedPage` | none | auth guard only, no chrome |
| separate entry apps (`EmailApp`, `OAuthApp`, `ShareApp`) | none | own HTML entrypoints, no shell |

---

#### Full table

Legend: "Shell config today" = router layout + any AppLayoutContext hooks in effect. "sets nothing" = contentWidth unset → full-bleed raw children path in AppContentLayout.

##### conversation/

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| ConversationPage | ConversationRouterLayout → ConversationLayout (hasTitle; contentWidth unset) | delegates to `ConversationContainerVirtuoso` | no | **Full** | Correct: full-bleed is intentional; component owns scroll. |

##### pod/

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| PodPage | PodRouterLayout → PodLayout (hasTitle; contentWidth unset) | `flex min-h-0 w-full flex-1 flex-col overflow-hidden` + own Tabs | no | **Full** | Correct: owns tabs/scroll; keep full-bleed. |

##### builder/ (agents + skills)

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| ManageAgentsPage | in shell; page sets `contentWidth("wide")` + navChildren | `flex w-full flex-col gap-8 pb-4` | yes | **Wide** | Conforms. |
| ManageSkillsPage | in shell; page sets `contentWidth("wide")` + navChildren | (Page.Vertical stack) | yes | **Wide** | Conforms. |
| CreateAgentPage | in shell; page sets `centered` + `hideSidebar` + close-title | `<Page variant="modal">` + `flex flex-col gap-6` | yes | **Flow** | `Page variant="modal"` adds its own padding on top of shell's centered `px-4 md:px-8` → double gutter; drop the `Page` wrapper padding. |
| NewAgentPage | builderFullPageRoutes — **outside shell** | delegates to `AgentBuilder` (split-panel editor) | no | **Full** | Conforms (full-page editor by design). |
| EditAgentPage | builderFullPageRoutes — outside shell | delegates to `AgentBuilder` | no | **Full** | Conforms. |
| CreateSkillPage | builderFullPageRoutes — outside shell | delegates to `SkillBuilder` | no | **Full** | Conforms. |
| EditSkillPage | builderFullPageRoutes — outside shell | delegates to `SkillBuilder` | no | **Full** | Conforms. |
| NotAvailableErrorPage | outside shell | delegates to `CustomErrorPage` | no | **Standalone** | Conforms. |

##### spaces/

All under SpaceRouterLayout → `SpaceLayout` (`contentWidth="wide"` + navChildren; inner `flex w-full flex-col mb-4`) except SpacesRedirectPage.

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| SpacePage | SpaceLayout (wide) | `SpaceSearchInput` → `Page.Vertical gap="xl"` | yes | **Wide** | Conforms. Loading spinner uses `h-screen` inside panel (minor overflow). |
| SpaceCategoryPage | SpaceLayout (wide) | `SpaceSearchInput` + list | no | **Wide** | Conforms; `h-screen` spinner nit. |
| DataSourceViewPage | SpaceLayout (wide) | `SpaceSearchInput` + content list | no | **Wide** | Conforms; `h-screen` spinner nit. |
| SpaceActionsPage | SpaceLayout (wide) | `SpaceSearchInput` + actions list | no | **Wide** | Conforms. |
| SpaceAppsListPage | SpaceLayout (wide) | `SpaceSearchInput` + apps list | no | **Wide** | Conforms. |
| SpaceTriggersPage | SpaceLayout (wide) | `SpaceSearchInput` + triggers list | no | **Wide** | Conforms. |
| SpacesRedirectPage | in shell, **sets nothing** → full-bleed by accident | `flex h-screen items-center justify-center` (spinner only) | no | *(redirect — none)* | Transient redirect; full-bleed accident is harmless but `h-screen` inside panel overflows. If kept, declare centered or render a plain panel-height spinner. |

##### spaces/apps/ (Dust Apps)

All under DustAppRouterLayout → `DustAppPageLayout` (`centered` + `pt-0` + `hideSidebar` + `AppLayoutSimpleCloseTitle` + sticky Tabs) = Flow chrome.

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| AppViewPage | DustAppPageLayout (centered, hideSidebar, title) | `mt-8 flex flex-auto flex-col` | no | **Flow** | Borderline Full: block editor lives in a 4xl centered column; revisit if editor needs width. `mt-8` duplicates vertical rhythm the layout should own. |
| AppSpecificationPage | DustAppPageLayout | `mt-8 flex flex-col gap-4` | no | **Flow** | Conforms; move `mt-8` into layout. |
| AppSettingsPage | DustAppPageLayout | `mt-8 flex flex-1` | no | **Flow** | Conforms; move `mt-8` into layout. |
| DatasetsPage | DustAppPageLayout | `mt-8 flex flex-col` | no | **Flow** | Conforms. |
| NewDatasetPage | DustAppPageLayout | `mt-8 flex flex-col` | no | **Flow** | Conforms (the taxonomy's canonical "dataset creation" Flow). |
| DatasetPage | DustAppPageLayout | `mt-8 flex flex-col` | no | **Flow** | Conforms. |
| RunsPage | DustAppPageLayout | `mt-8 flex` | no | **Flow** | Conforms. |
| RunPage | DustAppPageLayout | `mt-8 flex flex-col` | no | **Flow** | Conforms. |

##### workspace/ (admin cluster)

All under RequireRoleLayout → `AdminLayout`: subNavigation only, **no contentWidth declared** (shell full-bleed raw), local wrapper `max-w-6xl px-4 sm:px-8 pt-4 sm:pt-8 items-center`. Every row below inherits the note: *"6xl AdminLayout wrapper exists in neither shell mode; migrate to `useSetContentWidth` and delete the local wrapper (its `px-4 sm:px-8` duplicates the shell's `px-4 md:px-8`)."*

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| MembersPage | AdminLayout (local 6xl; sets nothing) | `mb-4` → `flex flex-col gap-6` + Tabs | yes | **Wide** | People table wants full width; today capped at 6xl → should declare `wide`. |
| AnalyticsPage | AdminLayout | `Page.Vertical align="stretch" gap="xl"` | yes | **Wide** | Chart grid; declare `wide`. |
| UsagePage | AdminLayout | `Page.Vertical` + charts/tables | yes | **Wide** | Data-dense; declare `wide`. |
| GovernancePage | AdminLayout → GovernancePageLayout (`flex flex-col gap-6` + Page.Header) | via GovernancePageLayout | via layout | **Centered** | Settings toggles; declare `centered` (4xl), today 6xl. GovernancePageLayout stays as content header only. |
| WorkspaceSettingsPage | AdminLayout | `Page.Vertical align="stretch" gap="xl"` | yes | **Centered** | Declare `centered`; today 6xl. |
| WorkspaceBrandingPage | AdminLayout | `Page.Vertical align="stretch" gap="xl"` | yes | **Centered** | Declare `centered`. |
| WorkspaceIdentityProvisioningPage | AdminLayout | `mb-4` → `Page.Vertical gap="lg"` | yes | **Centered** | Declare `centered`; stray `mb-4` wrapper. |
| ModelProvidersPage | AdminLayout | `Page.Vertical align="stretch" gap="xl"` | yes | **Centered** | Declare `centered`. |
| SubscriptionPage | AdminLayout | `Page.Vertical` (+ overlay dialogs) | yes | **Centered** | Declare `centered`. |
| billing/BillingPage | AdminLayout | `Page.Vertical gap="xl" align="stretch"` | yes | **Centered** | Declare `centered`. |
| developers/APIKeysPage | AdminLayout | `Page.Vertical gap="xl"` + trailing `<div class="h-12">` spacer | yes | **Centered** | Declare `centered`; replace `h-12` spacer with layout bottom padding. |
| developers/CreditsUsagePage | AdminLayout | `Page.Vertical` + stat tiles/tables | yes | **Wide** | Usage dashboards read better wide; declare `wide`. |
| developers/ProvidersPage | AdminLayout | `Page.Vertical gap="xl"` | yes | **Centered** | Declare `centered` (`max-w-72` is a field width, not layout). |
| developers/SecretsPage | AdminLayout | `Page.Vertical` (+ dialogs) | yes | **Centered** | Declare `centered`. |
| developers/SandboxPage | AdminLayout | `Page.Vertical gap="xl" align="stretch"` | yes | **Centered** | Declare `centered`. |
| developers/SelfImprovingSkillsPage | AdminLayout | `Page.Vertical` sections | yes | **Centered** | Declare `centered`. |
| subscription/ManageSubscriptionPage | adminFullPageRoutes — **outside shell** | `flex h-dvh w-full items-center justify-center` (spinner → Stripe portal redirect) | no | **Standalone** | Redirect page; fine as-is. |

##### workspace/labs/

Direct children of AppContentRouterLayout (no middleman).

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| LabsPage | page sets `centered` + navChildren | `Page.Header` + `Page.Layout direction="vertical"` | yes | **Centered** | Conforms — one of only 5 pages doing it "right" today. |
| TranscriptsPage | page sets `centered` + navChildren | `Breadcrumbs` + `Page.Layout direction="vertical"` | yes | **Centered** | Conforms. |

##### onboarding/ (all outside AppContentLayout)

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| WelcomePage | onboardingRoutes, no shell | `OnboardingLayout` (bare `<Page>`) | via layout | **Standalone** | Conforms. |
| JoinPage | UnauthenticatedPage, no shell | `OnboardingLayout` + `flex h-full flex-col gap-8`, inner `max-w-md` | yes | **Standalone** | Conforms; width set ad hoc. |
| SubscribePage | onboardingRoutes | `BarHeader` + Page.* stack, `max-w-2xl` | yes | **Standalone** | Own top bar + 2xl column — visually a Flow, but correctly outside the shell. |
| SelectSubscriptionPage | onboardingRoutes | `BarHeader` + `min-h-screen items-center px-4 py-16`, `max-w-4xl` | no | **Standalone** | Conforms. |
| TrialPage | onboardingRoutes | `<Page>` + `Page.Horizontal/Vertical` | yes | **Standalone** | Conforms. |
| TrialEndedPage | onboardingRoutes | `<main min-h-screen items-center px-4 py-8>`, `max-w-5xl` | no | **Standalone** | Conforms. |
| VerifyPage | onboardingRoutes | `<Page>` + centered `max-w-xl` columns | yes | **Standalone** | Conforms. |
| CheckoutPage | onboardingRoutes | `<main h-screen overflow-hidden>` split panel (Stripe embed) | no | **Standalone** | Conforms (immersive checkout). |
| PaymentProcessingPage | onboardingRoutes | `BarHeader` + `<Page>` centered | yes | **Standalone** | Conforms. |
| InviteChoosePage | AuthenticatedPage, no shell | `<Page variant="normal">` + BarHeader + `mx-auto mt-40 max-w-2xl` | bare `<Page>` | **Standalone** | Conforms. |
| NoWorkspacePage | AuthenticatedPage | `<Page variant="normal">` + BarHeader + `mx-auto mt-40 max-w-2xl` | bare `<Page>` | **Standalone** | Conforms. |
| LoginErrorPage | UnauthenticatedPage | `Page.H` + text column | yes | **Standalone** | Conforms. |

*Cluster note: 6 different column widths (`md`, `xl`, `2xl`, `4xl`, `5xl`, bare `<Page>`) across one funnel — consolidate on a shared onboarding width token.*

##### share/ + email/ + oauth/ (separate entry apps — ShareApp, EmailApp, OAuthApp)

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| share/SharedFramePage | ShareApp entry, no shell | `flex h-dvh w-full` → `PublicInteractiveContentContainer` | no | **Standalone** | Conforms. |
| share/SharedFilePage | ShareApp entry | `h-dvh` spinner → redirects to `/share/frame/:token` | no | **Standalone** | Pure redirect. |
| share/ShareOgPage | ShareApp entry | `h-screen w-screen bg-muted-background` decorative OG card | no | **Standalone** | OG-image render target; exempt from taxonomy rules. |
| email/ValidationPage | EmailApp entry | `fixed inset-0 bg-primary-800` + centered column | yes (Page.Header) | **Standalone** | Conforms. |
| oauth/OAuthFinalizePage | OAuthApp entry | `h-64` spinner → finalize + redirect | no | **Standalone** | Pure redirect. |
| oauth/OAuthSetupRedirectPage | OAuthApp entry | `h-64` spinner → redirect | no | **Standalone** | Pure redirect. |

##### global / error

| Page | Shell config today | Top wrapper classes | Uses Page.*? | Archetype | Migration note |
|---|---|---|---|---|---|
| CustomErrorPage | no shell (error fallbacks, NotAvailableErrorPage) | `flex h-dvh items-center justify-center` | no | **Standalone** | Conforms. |
| MaintenancePage | UnauthenticatedPage route `/maintenance` | `fixed inset-0 bg-primary-800` + `<main mx-6>` | yes (Page.Header) | **Standalone** | Conforms. |
| SsoEnforcedPage | AuthenticatedPage `/sso-enforced` | `fixed bg-primary-800` + `container mx-auto sm:max-w-3xl…xl:max-w-5xl` | no | **Standalone** | Conforms; legacy responsive max-w ladder differs from every other standalone page. |

---

#### Key systemic findings

1. **The admin cluster (17 pages) is the big divergence**: none declares a contentWidth; `AdminLayout` (`front/components/layouts/AdminLayout.tsx`) fakes a third width (`max-w-6xl`) with its own gutter on the shell's full-bleed path. Fix once in AdminLayout (declare centered/wide per page, delete local wrapper) and 17 pages fall in line.
2. **Middleman layouts otherwise work well**: `SpaceLayout` (wide) and `DustAppPageLayout` (centered Flow chrome) give 14 pages consistent behavior with zero per-page config.
3. **Only 5 pages self-declare width** — the pattern is healthy where used (labs, builder list/create pages).
4. **Repeated `mt-8` in all 8 dust-app pages** and stray `mb-4`/`h-12` spacers in admin pages are vertical-rhythm ownership leaks — the layout should own top/bottom spacing.
5. **`h-screen`/`h-dvh` loading spinners inside the shell panel** (spaces pages, SpacesRedirectPage) overflow the rounded panel; should be `h-full`.

### 2.5 Screenshots

> **TODO (non-blocking)**: capture against a running dev stack — one exemplar per
> archetype plus 1–2 worst-offender comparisons. Suggested shots:
> 1. `WorkspaceSettingsPage` (Centered exemplar)
> 2. `ManageAgentsPage` (Wide exemplar)
> 3. `ConversationPage` (Full exemplar)
> 4. `CreateAgentPage` (Flow exemplar)
> 5. Onboarding step (Standalone exemplar)
> 6. Side-by-side: a settings page (`max-w-4xl`, `md:` gutter) vs an admin page
>    (`max-w-6xl`, `sm:` gutter) — the AP3 money shot.
>
> Store under `design_docs/assets/layout/` and embed here.

---

## 3. Strategy

### 3.1 Principles

1. **Width is decided once, at the shell.** A page declares its archetype; it never
   sets its own `max-w-*` or horizontal padding at the top level.
2. **Pages own rhythm, never gutters.** Inside the column, pages control vertical
   spacing (the gap ramp); the shell owns everything horizontal.
3. **One layout breakpoint (`md:`) for viewport decisions; container queries for
   anything reusable.** Viewport queries are a shell privilege.
4. **Explicit beats default.** No layout behavior may depend on the *absence* of a
   declaration.

### 3.2 Layout archetypes

Five archetypes cover the product. The first three are values of the shell enum;
Flow and Standalone are scaffolds that live outside `AppContentRouterLayout`
(which is exactly how `front-spa` already treats onboarding and the builders).

| Archetype | Definition | Width | Gutter | Vertical rhythm | Scroll owner | Exemplars |
|---|---|---|---|---|---|---|
| **Centered** | Single-column reading/settings surface | `max-w-content` (= `max-w-4xl`) centered | `page-gutter` | `pt-4`, sections `gap-8` | shell | `WorkspaceSettingsPage`, `LabsPage`, most of `workspace/` |
| **Wide** | Lists, tables, card grids | full available width | `page-gutter` | `pt-8`, sections `gap-8` | shell | `ManageAgentsPage`, `MembersPage`, `AnalyticsPage`, spaces pages |
| **Full** | Immersive; component owns everything incl. scroll | none (explicit opt-out) | none | component-defined | page component | `ConversationPage` (`max-w-conversation` internally), `PodPage`, agent/skill builder editors |
| **Flow** | Focused task/wizard, bar-framed, no sidebar | `max-w-flow` (≈ `max-w-3xl`) centered | `page-gutter` | `BarHeader`/`BarFooter` framing, body `gap-6` | scaffold | `CreateAgentPage`, `NewDatasetPage` |
| **Standalone** | Outside the app shell entirely | `max-w-narrow` (≈ `max-w-md`) centered card/column | own | scaffold-defined | scaffold | `onboarding/*`, `oauth/*`, `share/*`, error pages |

Classification of all 65 pages (§2.4): **Centered 14 · Wide 12 · Full 6 · Flow 9 ·
Standalone 23** (+1 pure-redirect outlier, `SpacesRedirectPage`).

**Admin pages are Centered or Wide like everyone else.** `AdminLayout`'s `max-w-6xl`
is not an archetype; per-cluster width forks are exactly what this system removes.
(If team review concludes admin tables genuinely need more room, those pages are
`Wide` — not a sixth width.)

### 3.3 Tokens & rules

Tokens land in `sparkle/src/styles/theme.css` next to `--container-conversation`:

| Token | Value | Replaces |
|---|---|---|
| `--spacing-page-gutter` | `1rem` mobile / `2rem` from `md:` (today's `px-4 md:px-8`) | every top-level `px-*` in pages, `AdminLayout`'s `sm:px-8` |
| `--container-narrow` | `28rem` (`max-w-md`) | ad-hoc narrow columns |
| `--container-flow` | `48rem`-ish, ratify in review (`max-w-3xl` = 48rem/768px) | wizard column widths |
| `--container-content` | `56rem` (`max-w-4xl`) | the three competing `max-w-4xl`s |
| `--container-conversation` | `70ch` (reading measure, ~620px at 16px base; was 48rem) | — |

Rules (the PR-review checklist):

- **R1**: No `max-w-*` or `px-*`/`pl-*`/`pr-*` on the top-level wrapper of a page
  file. The archetype provides both. (Lint target, Phase 4.)
- **R2**: Vertical rhythm uses the **numeric gap ramp** — `gap-2` (tight, within a
  control cluster), `gap-4` (default, between related elements), `gap-6` (between
  blocks), `gap-8` (between page sections). `gap-3`/`gap-5` and larger ad-hoc values
  are review flags. `Page.Vertical`'s semantic props get remapped onto this ramp
  (`sm`→2, `md`→4, `lg`→6, `xl`→8) rather than the reverse — codifying the convention
  that already won 3:1, instead of fighting 100+ usages.
- **R3**: `md:` is the only viewport breakpoint for layout decisions. `sm:`
  layout usage is legacy (`AdminLayout`, `Page.Horizontal`) and is retired with them.
  `xxs`/`xs` remain available for component-internal, not page-level, decisions.
- **R4**: Reusable Sparkle components use container queries (`@container` +
  `@sm/@md/@lg`), never viewport queries — split panes and sheets make viewport width
  meaningless. Only the shell may use viewport queries.
- **R5**: Sheets/dialogs keep the existing size map (already consistent: `lg` ×25,
  `xl` ×13); overlay layout is out of scope for this doc.

### 3.4 Ownership: policy in `AppLayoutContext`, mechanism in Sparkle

- `contentWidth` (rename candidate: `layout`) becomes **the** per-page declaration:
  `"centered" | "wide" | "full"` — extended with explicit `"full"`, and eventually
  **required** (no `undefined`). Declared at route registration or the top of the page
  component, never deep in the tree.
- `AppContentLayout` implements the archetypes using Sparkle `Container` + the tokens,
  so the width/padding implementation has exactly one home.
- Sparkle `Page` **keeps** its flex/gap helpers (`Page.Vertical/Horizontal/Fluid`,
  `Page.Header`, `Page.SectionHeader`) and **sheds** its scaffold role (`max-w-4xl
  px-6 py-16`) — the shell owns that now.
- Flow and Standalone get dedicated scaffolds (`FlowLayout`, `StandaloneLayout`) in
  `front-spa/src/app/layouts/`, matching how router layouts are already organized.

### 3.5 Deprecations

| What | Fate |
|---|---|
| `AdminLayout` (`front/components/layouts/`) | Dissolved: admin routes declare Centered/Wide; sub-navigation concern moves to the router layout |
| `GovernancePageLayout` | Dissolved into archetype + local composition |
| Sparkle `Page` scaffold role (root `max-w`/`px`/`py`) | Deprecated; primitives retained |
| `Container` `fixed` prop | Folded into shell archetype implementation |
| Unset-`contentWidth` full-bleed fallback | Removed (breaking, Phase 2) — `"full"` must be declared |
| `SidebarLayout` (allotment) | Removed in favor of `Resizable`; drops the `allotment` dependency |
| One or two of `Bar`/`HoveringBar`/`Toolbar` | Consolidation review in Phase 1 (likely: keep `Bar` + one floating variant) |

### 3.6 Anti-pattern ↔ cure cross-reference

| Anti-pattern | Cured by |
|---|---|
| AP1 Two sources of `max-w-4xl` | §3.3 `--container-content` token + §3.4 single implementation in shell |
| AP2 Default-by-omission | §3.4 required enum with explicit `"full"` |
| AP3 Shadow shells | §3.2 archetypes replace `AdminLayout`/`GovernancePageLayout` (§3.5) |
| AP4 Query duality | §3.3 R3 (one breakpoint) + R4 (container queries for reusables) |
| AP5 Numeric drift | §3.3 R2 (documented numeric ramp; semantic props remapped) |
| AP6 Toolbar trio / resize duo | §3.5 consolidation |
| AP7 Split-brain wiring | §3.4 declaration at route/page top + scaffolds colocated with router layouts |

### 3.7 Adoption & enforcement

- **Docs**: distill R1–R5 + the archetype table into `front/CODING_RULES.md` (new
  `## LAYOUT` section) once ratified; add a pointer in `front/AGENTS.md` (and fix its
  stale Next.js/Tailwind claims); Storybook stories for the archetypes in Sparkle.
- **Review vocabulary**: anti-pattern names (AP1–AP7) are the shared shorthand.
- **Lint (Phase 4)**: an ESLint rule (or simple CI grep) flagging `max-w-*`/`px-*` on
  page-file top-level wrappers and `sm:` layout classes in `front/components`.
- **This doc** is the source of truth; changes to rules land as PRs against it.

### 3.8 Roadmap

- **Phase 0 — Ratify.** ✅ (this doc, landed with the `layout-system` PR).
- **Phase 1 — Sparkle foundations.** ✅ Tokens in `theme.css` (`content`, `narrow`;
  `conversation` re-based to 70ch); `Foundations/Layout` storybook story; `Page`
  scaffold deprecated. *(Deferred: `SidebarLayout` removal, toolbar consolidation.)*
- **Phase 2 — Shell.** ✅ `"full"` added to the enum; every in-shell surface declares
  (pages, middlemen, or cluster layouts); `AdminLayout` dissolved (admin snap);
  dev warning for undeclared pages. *(Hard requirement deferred — see §3.9 #10.)*
- **Phase 3 — Interiors.** ◐ Semantic gaps remapped onto the numeric ramp
  (`md`→gap-4, `lg`→gap-6); targeted fixes landed (CreateAgentPage double gutter,
  GovernancePageLayout → header-only, spacer/margin/`h-screen` cleanups).
  *(Deferred: Flow/Standalone scaffolds, `--container-flow`, onboarding width
  consolidation, full cluster sweep, `page-gutter` utility.)*
- **Phase 4 — Enforcement.** ✅ Grit rules `noRawContentWidthInPages` +
  `noSmLayoutBreakpointInPages` (page files, standalone clusters excluded);
  `CODING_RULES.md` `## LAYOUT` section ([LAYOUT1–5]); `AGENTS.md` tech-stack fix.
  *(Deferred: warn→error escalation — see §3.9 #12.)*

### 3.9 Open questions / decision log

| # | Question | Status |
|---|---|---|
| 1 | Rename `contentWidth` → `layout` when extending the enum? | open |
| 2 | Exact `--container-flow` value (3xl vs 2xl) — measure `CreateAgentPage` | open |
| 3 | Do any admin tables genuinely need Wide, or is Centered enough post-`6xl`? | open — decide during Phase 2 cluster review |
| 4 | Toolbar consolidation: which of `Bar`/`HoveringBar`/`Toolbar` survives? | open — Phase 1 |
| 5 | Poke: permanently separate, or should tokens be adoptable there later? | leaning: tokens live in Sparkle so Poke *can* adopt; no active migration |
| 6 | Designer counterpart: Figma templates per archetype? | open — needs design owner |
| 7 | Implement shell archetypes as a fluid grid (Linear-style, §4.2) instead of `Container` + max-w? | **decided (2026-07)**: keep flex + centralize; fluid grid stays a future spike |
| 8 | Is `max-w-4xl` (896px) too wide for settings-style Centered pages? Linear uses 640px (§4.2) | open — decide with design |
| 9 | Gap remap (`md`→gap-4, `lg`→gap-6) | **decided (2026-07)**: shipped; +4px product-wide on md/lg semantic gaps, design review on the PR |
| 10 | Onboarding width consolidation (6 variants → tokens) | **deferred (2026-07)**: document-only; target mapping = `narrow` for auth/join cards, a future `flow` token for content steps |
| 11 | Interior cleanup scope | **decided (2026-07)**: targeted fixes only; full cluster sweep is a follow-up |
| 12 | Escalate undeclared-width dev warn to an error? | **decided (2026-07)**: no — transient `undefined` is structural (lazy loads, redirects); lint + warn suffice |

---

## 4. Prior art: Linear

Linear is the strongest public example of the model this doc proposes: a small,
closed set of view types with layout owned entirely by the system. Two sources:
their published design writing, and direct measurement of the live app (July 2026,
1728px viewport, via DOM inspection).

### 4.1 What they've published

- **Layout is a property of the view type, not the page.** Linear has a closed
  taxonomy — **list, board, timeline, split, fullscreen** — and every screen is an
  instance of one. Their 2024 redesign was executed *by view type*: "I mostly worked
  by type of view (list, board, split, etc.) as I found it easier to focus and ensure
  that every decision worked in all cases" (Yann-Edern Gillet). There is no "unset"
  view type — our AP2 (Default-by-omission) is structurally impossible there.
- **One shell, redesigned holistically.** Sidebar, tabs, app headers, and view
  headers were a distinct redesign milestone with defined behaviors for each. Their
  rationale for system-wide rather than per-screen work: "the product experience is
  holistic and visual. You cannot predict which path the user takes" (Karri Saarinen,
  *A design reset*).
- **Chrome comes in standardized slots**: a view header holding filters + display
  options (always top-right), a right side panel for meta properties, tabs. Pages
  fill slots; they don't invent chrome.
- **Layout flexibility is a product feature, not ad-hoc code.** Display options let
  users switch list↔board, change grouping/density per view, and save personal or
  workspace defaults — only possible because layout has one owner.
- **No layout grid; consistency from a tight spacing scale** (4/8px rhythm) and
  modular, content-first components. Token minimalism as philosophy: their theming
  rebuild went from 98 variables to 3 (base, accent, contrast, derived in LCH).
- **Attention management**: the latest refresh de-emphasized the sidebar (contrast,
  padding) so the content panel commands attention, and softened borders that had
  "proliferated without clear purpose".

Sources: [A design reset (part I)](https://linear.app/now/a-design-reset) ·
[How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) ·
[A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) ·
[Docs: Display options](https://linear.app/docs/display-options)

### 4.2 What the live app measures

| Surface | Layout | Measured values |
|---|---|---|
| App shell | flex row: sidebar + rounded main panel | sidebar `244px` (`--sidebar-width`); `<main>` inset **8px** top/right, **12px radius**, **0.5px hairline border** |
| Board / list views | full-bleed inside panel | two stacked **44px** header bars (app header + view header), `padding: 0 8px`; content owns horizontal scroll |
| Issue detail | one fluid 4-track grid | `grid-template-columns: 51px \| 805px \| 400px \| 51px`, `column-gap: 56px` (gutter / content / properties / gutter) |
| Inbox | split view | `max-width: 400px` list pane + detail pane hosting the **same** issue grid, re-resolved to `0 \| 614px \| 346px \| 0`, gap 38px |
| Settings | centered column | `max-width: 640px`, mathematically centered; 64px header; same shell, sidebar swaps to settings nav |

Notable implementation details:

- **Our shell frame is already theirs.** Linear's main panel (8px inset, 12px radius,
  hairline border) is measure-for-measure our `AppContentLayout` panel (`my-2 mr-2
  rounded-xl border`). We copied the frame; this doc adds the system behind it.
- **The reading measure lives on the grid track, not the content.** The issue view's
  content column has no `max-width` anywhere in its ancestor chain — the grid template
  owns it. When the same component renders inside the narrower Inbox split pane, the
  identical grid re-resolves (gutters collapse to 0 first, then content/panel/gap
  compress). One layout definition adapts to any host width with **neither viewport
  nor container queries** — their answer to our AP4.
- **"Content + properties panel" is a first-class archetype shape**, not something
  each page reinvents — relevant to how our Full pages each hand-roll split layouts.
- **Headers are fixed-height slots** (44px / 64px) owned by the system; pages never
  render their own top chrome.
- **Settings uses a 640px measure** — much narrower than our `max-w-4xl` (896px)
  Centered default; see open question #8.

### 4.3 Implications adopted / to evaluate

| Linear practice | Status in this strategy |
|---|---|
| Closed view-type taxonomy, always declared | **Adopted** — the five archetypes + required enum (§3.2, §3.4) |
| System-owned chrome slots | **Partially adopted** — Flow scaffold's `BarHeader`/`BarFooter`; consider making the view-header slot mandatory in Phase 2 |
| Fluid-grid shell implementation | **To evaluate** — Phase 1 spike (open question #7); could replace the `Container`-based plan and give split-pane composition for free |
| Narrower settings measure (640px) | **To evaluate** — open question #8 |
| User-facing display options | **Future** — becomes cheap once width has one owner; out of scope for Phases 0–4 |
