# Frames seed

Publishes Frames v2 covering the current feature set, each with a conversation linking to it:

- `SalesDashboard`: client-only Frame, shared publicly.
- `TeamTasks`: Frame with a database and one function per caller policy, shared with the
  workspace.
- `PublicTodo`, `FeedbackForm`, `TeamDirectory` and `StatusDashboard`: Frames with `public`
  functions, published unshared into the "Frames v2 playground" Pod. Each has a private
  `reset-demo-data` function that fills its database with sample rows.

It enables `frames_v2`, `frames_v2_functions` and `frames_v2_public_functions` and sets the
workspace sharing policy to `all_scopes` first. Re-running republishes the Frames and keeps
their data and existing conversations.

## Prerequisites

Frames with functions run in an E2B sandbox that calls back into local front-api. Set
`E2B_API_KEY`, `SBX_DEV_FRONT_URL` (a public tunnel to front-api), `SBX_DEV_VIZ_URL` and
`SBX_DEV_UNRESTRICTED_EGRESS=true` before running it. See `dev/scripts/ensure-ngrok.sh`. The
`public` functions need a sandbox image whose `dsbx` accepts that policy (0.1.68 or later).

## Usage

```bash
npx tsx scripts/seed/frames/seed.ts --execute
```

To test with a second user, sign in once with that user, then pass their email. The seed adds them
as a workspace member:

```bash
npx tsx scripts/seed/frames/seed.ts --execute --viewerEmail viewer@example.com
```

Add `--viewerPodAccess member` to make them a Pod member, which gives them write access to the Pod
Frames, or `--viewerPodAccess none` to remove it.

Frame sources live in `assets/`. TypeScript files end in `.txt` so front's typecheck and lint skip
them, and `seedFrames` strips the suffix when it writes them to the conversation or Pod files.
