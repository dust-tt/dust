# Frames seed

Publishes two Frames v2 covering the current feature set, each with a conversation linking to it:

- `SalesDashboard`: client-only Frame, shared publicly.
- `TeamTasks`: Frame with a database and one function per caller policy, shared with the
  workspace.

It enables `frames_v2` and `frames_v2_functions` and sets the workspace sharing policy to
`all_scopes` first. Re-running republishes the Frames and keeps
their data and existing conversations.

## Prerequisites

Frames with functions run in an E2B sandbox that calls back into local front-api. Set
`E2B_API_KEY`, `SBX_DEV_FRONT_URL` (a public tunnel to front-api), `SBX_DEV_VIZ_URL` and
`SBX_DEV_UNRESTRICTED_EGRESS=true` before running it. See `dev/scripts/ensure-ngrok.sh`.

## Usage

```bash
npx tsx scripts/seed/frames/seed.ts --execute
```

To test with a second user, sign in once with that user, then pass their email. The seed adds them
as a workspace member:

```bash
npx tsx scripts/seed/frames/seed.ts --execute --viewerEmail viewer@example.com
```

Frame sources live in `assets/`. TypeScript files end in `.txt` so front's typecheck and lint skip
them, and `seedFrames` strips the suffix when it writes them to the conversation or Pod files.
