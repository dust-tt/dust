# Frame UI linting

Enabling Create Frames copies `lint.sh`, `tsconfig.json`, `oxlintrc.json` and `frame-rules.cjs` into the
conversation through the existing skill attachment loader. These files stay with the
conversation. There are no versioned attachment paths or automatic script upgrades.

```sh
bash "/files/conversation-<conversationId>/skills/Create Frames/lint.sh" "$FRAME"
```

Pass a Frame folder containing `manifest.json` or `index.tsx`. On first use, the script copies
the checker files to local sandbox disk and runs that copy. Later calls reuse it.
The script fetches the Viz declarations and runs Oxlint from a temporary local directory
containing standard configs and symlinks to the Frame source. This avoids repeated config
reads and writes through GCS Fuse. Oxlint still reads the current source on each run.
Keep server code in `functions/` and database schemas in `databases/`, which are excluded from UI checks.
Type and lint errors report file, line and column and fail the command. Source is never executed.

The [oxlint-tailwindcss](https://github.com/sergioazoc/oxlint-tailwindcss) plugin's
`tailwindcss/no-arbitrary-value` rule rejects classes such as `h-[600px]` in `className`,
templates and class helpers such as `cn` and `clsx`. Use predefined classes or the `style`
prop for exact values. This is a static check, with gaps for expressions such as `.join()`
and TypeScript assertions. It does not evaluate Frame code or load a Tailwind config.

The attached `dust/relative-package-files` rule checks UI and backend source for absolute scoped
paths to files inside the Frame and suggests the portable `./…` form. This replaces the server's
publish-time package-path validator. It uses a local file listing, so checking each reference
does not make another GCS Fuse request. External scoped paths and file IDs remain supported.

The `dust/declared-frame-functions` rule checks literal function names passed to `useFrameFunction`,
`useFrameFunctionMutation` and their legacy Pod aliases against `manifest.json`. It follows named,
aliased and namespace imports from `@dust/react-hooks` and lists the declared functions on errors.
Computed names and legacy Frames without a manifest are skipped. This replaces the function-name
check at publish time. Declared function entry points are still built when publishing.

The temporary directory is removed after linting. Source files and existing project configs
are left untouched. Project configs do not override the checker settings.

The sandbox provides `DUST_VIZ_URL`, Oxlint and the Tailwind plugin. Declarations are cached by
manifest id in `$XDG_CACHE_HOME/dust/frame-types` or `$HOME/.cache/dust/frame-types`. Override the
cache with `DUST_FRAME_TYPES_CACHE`. Downloads are checked against the manifest checksum and size.
Checker files are cached in the sibling `frame-checker` directory. Override this location with
`DUST_FRAME_CHECKER_CACHE`. Remove that cache after editing the skill assets locally.

For local development, install Oxlint and run the script from this directory:

```sh
npm install --global oxlint@1.83.0 oxlint-tsgolint@7.0.2001 oxlint-tailwindcss@1.12.0
DUST_VIZ_URL=http://localhost:3007 DUST_FRAME_ROOT=conversation-abc/MyFrame \
  bash assets/lint.sh /path/to/Frame
```

The script also needs Bash, curl, jq, tar and a SHA-256 tool, all present in the sandbox image.
The Viz hostname must be reachable through the sandbox egress policy.
In the sandbox the scoped Frame root comes from its `/files/…` path. For a local copy, set
`DUST_FRAME_ROOT` to the original scoped folder so the rule can recognize in-package references.

`files.ts` reads the assets using package resolution, so it also works from bundled API
and worker entry points. The worker image explicitly includes these files. The API image
already copies the Front workspace. Publish enforcement remains a separate change.
