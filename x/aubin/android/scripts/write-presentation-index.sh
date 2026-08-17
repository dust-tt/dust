#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"
LOCAL_PREVIEW_DIR="$OUT_DIR/local-preview-flow"
INDEX_HTML="$OUT_DIR/presentation-index.html"
MANIFEST="$OUT_DIR/presentation-index.txt"

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required presentation artifact: $path" >&2
    exit 1
  fi
}

require_file "$OUT_DIR/prod-review.html"
require_file "$OUT_DIR/login.png"
require_file "$OUT_DIR/frame-login.png"
require_file "$OUT_DIR/authenticated-preflight.png"
require_file "$OUT_DIR/authenticated-preflight.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-review.html"
require_file "$LOCAL_PREVIEW_DIR/local-preview-inbox.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-file-viewer.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.png"

DEMO_SCREENS=(loading session-expired inbox-loading inbox empty-inbox compose detail thinking streaming files)
AUTHENTICATED_SCREENS=(inbox account-menu compose)

has_demo_artifacts() {
  local screen
  for screen in "${DEMO_SCREENS[@]}"; do
    if [[ -f "$OUT_DIR/demo-$screen.png" || -f "$OUT_DIR/demo-$screen.xml" ]]; then
      return 0
    fi
  done
  return 1
}

require_demo_artifacts() {
  local screen
  for screen in "${DEMO_SCREENS[@]}"; do
    require_file "$OUT_DIR/demo-$screen.png"
    require_file "$OUT_DIR/demo-$screen.xml"
  done
  require_file "$OUT_DIR/demo-copy-leaks.log"
}

has_authenticated_artifacts() {
  local screen
  for screen in "${AUTHENTICATED_SCREENS[@]}"; do
    if [[ -f "$OUT_DIR/authenticated-$screen.png" || -f "$OUT_DIR/authenticated-$screen.xml" ]]; then
      return 0
    fi
  done
  [[ -f "$OUT_DIR/authenticated-review.html" || -f "$OUT_DIR/authenticated-artifacts.txt" ]]
}

require_authenticated_artifacts() {
  local screen
  require_file "$OUT_DIR/authenticated-review.html"
  require_file "$OUT_DIR/authenticated-artifacts.txt"
  require_file "$OUT_DIR/authenticated-failures.log"
  for screen in "${AUTHENTICATED_SCREENS[@]}"; do
    require_file "$OUT_DIR/authenticated-$screen.png"
    require_file "$OUT_DIR/authenticated-$screen.xml"
  done
}

generated_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
authenticated_section=""
authenticated_manifest=""
authenticated_review_link=""
presentation_summary="Credential-free Samsung readiness artifacts for the current prodDebug build."
authenticated_status="Real WorkOS E2E: not captured"
authenticated_note="Real signed-in account screenshots still require a manual WorkOS session."
authenticated_next_step_html='      <p class="note"><strong>Next WorkOS step:</strong> run <code>make presentation-capture-workos</code> from the visible emulator, then reopen this index. Override the 900s default with <code>PRESENTATION_AUTH_TIMEOUT_SECONDS=&lt;seconds&gt;</code>.</p>'
authenticated_next_step_manifest="$(cat <<MANIFEST

Next WorkOS step:
- make presentation-capture-workos
- Override timeout with PRESENTATION_AUTH_TIMEOUT_SECONDS=<seconds>.
- Use make presentation-check-workos for the full gate plus manual sign-in.
MANIFEST
)"
credential_screenshot_heading="Credential-free screenshots:"
if has_authenticated_artifacts; then
  require_authenticated_artifacts
  presentation_summary="Samsung readiness artifacts for the current prodDebug build, including manually authenticated WorkOS screenshots."
  authenticated_status="Real WorkOS E2E: captured"
  authenticated_note="Real signed-in account screenshots are included in the authenticated review."
  authenticated_next_step_html=""
  authenticated_next_step_manifest=""
  credential_screenshot_heading="Credential-free and pre-auth screenshots:"
  authenticated_section="$(cat <<HTML
      <article>
        <div>
          <h2>Authenticated inbox</h2>
          <p><a href="authenticated-review.html">Open authenticated review</a></p>
        </div>
        <img src="authenticated-inbox.png" alt="Authenticated inbox screen">
      </article>
      <article>
        <div>
          <h2>Authenticated account menu</h2>
          <p><a href="authenticated-review.html">Open authenticated review</a></p>
        </div>
        <img src="authenticated-account-menu.png" alt="Authenticated account menu">
      </article>
      <article>
        <div>
          <h2>Authenticated compose</h2>
          <p><a href="authenticated-review.html">Open authenticated review</a></p>
        </div>
        <img src="authenticated-compose.png" alt="Authenticated compose screen">
      </article>
HTML
)"
  authenticated_manifest="$(cat <<MANIFEST

Authenticated screenshots:
- $OUT_DIR/authenticated-inbox.png
- $OUT_DIR/authenticated-account-menu.png
- $OUT_DIR/authenticated-compose.png
MANIFEST
)"
  authenticated_review_link="- $OUT_DIR/authenticated-review.html"
fi
demo_section=""
demo_manifest=""
if has_demo_artifacts; then
  require_demo_artifacts
  demo_section="$(cat <<HTML
      <article>
        <div>
          <h2>Demo loading</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-loading.png" alt="Demo loading screen">
      </article>
      <article>
        <div>
          <h2>Demo session expired</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-session-expired.png" alt="Demo session expired screen">
      </article>
      <article>
        <div>
          <h2>Demo inbox</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-inbox.png" alt="Demo inbox screen">
      </article>
      <article>
        <div>
          <h2>Demo inbox loading</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-inbox-loading.png" alt="Demo inbox loading screen">
      </article>
      <article>
        <div>
          <h2>Demo empty inbox</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-empty-inbox.png" alt="Demo empty inbox screen">
      </article>
      <article>
        <div>
          <h2>Demo compose</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-compose.png" alt="Demo compose screen">
      </article>
      <article>
        <div>
          <h2>Demo detail</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-detail.png" alt="Demo conversation detail screen">
      </article>
      <article>
        <div>
          <h2>Demo thinking</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-thinking.png" alt="Demo thinking screen">
      </article>
      <article>
        <div>
          <h2>Demo answer streaming</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-streaming.png" alt="Demo streaming screen">
      </article>
      <article>
        <div>
          <h2>Demo files</h2>
          <p><a href="prod-review.html">Open demo states review</a></p>
        </div>
        <img src="demo-files.png" alt="Demo files screen">
      </article>
HTML
)"
  demo_manifest="$(cat <<MANIFEST

Demo state screenshots:
- $OUT_DIR/demo-loading.png
- $OUT_DIR/demo-session-expired.png
- $OUT_DIR/demo-inbox.png
- $OUT_DIR/demo-inbox-loading.png
- $OUT_DIR/demo-empty-inbox.png
- $OUT_DIR/demo-compose.png
- $OUT_DIR/demo-detail.png
- $OUT_DIR/demo-thinking.png
- $OUT_DIR/demo-streaming.png
- $OUT_DIR/demo-files.png
MANIFEST
)"
fi

cat >"$INDEX_HTML" <<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dust Android presentation pack</title>
  <style>
    :root {
      color-scheme: light;
      --background: #f7f6f2;
      --surface: #ffffff;
      --border: #d7d3cb;
      --text: #171717;
      --muted: #6f6b64;
      --chip: #efede7;
      --accent: #2563eb;
    }
    body {
      margin: 0;
      background: var(--background);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px;
    }
    header {
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 30px;
      line-height: 1.12;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .meta li {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--chip);
      color: var(--text);
      font-size: 13px;
      line-height: 1.2;
      padding: 7px 10px;
    }
    .note {
      margin-top: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
      align-items: start;
    }
    article {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    article > div {
      padding: 14px;
    }
    h2 {
      margin: 0 0 6px;
      font-size: 18px;
      line-height: 1.2;
    }
    a {
      color: var(--accent);
      font-weight: 650;
      text-decoration: none;
    }
    code {
      border: 1px solid var(--border);
      border-radius: 5px;
      background: var(--chip);
      padding: 2px 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
    img {
      display: block;
      width: 100%;
      max-height: 620px;
      height: auto;
      object-fit: contain;
      background: #fff;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Dust Android presentation pack</h1>
      <p>$presentation_summary</p>
      <ul class="meta" aria-label="Run metadata">
        <li>Generated: $generated_at</li>
        <li>Viewport: 1080x2340 @ 425 dpi</li>
        <li>Variant: prodDebug</li>
        <li>URLs: https://dust.tt + https://app.dust.tt</li>
        <li>$authenticated_status</li>
      </ul>
      <p class="note">$authenticated_note</p>
$authenticated_next_step_html
    </header>
    <section class="grid">
      <article>
        <div>
          <h2>Production login</h2>
          <p><a href="prod-review.html">Open prod smoke review</a></p>
        </div>
        <img src="login.png" alt="Production login screen">
      </article>
      <article>
        <div>
          <h2>Shared frame sign-in gate</h2>
          <p><a href="prod-review.html">Open prod smoke review</a></p>
        </div>
        <img src="frame-login.png" alt="Shared frame sign-in gate">
      </article>
      <article>
        <div>
          <h2>Prod sign-in preflight</h2>
          <p>WorkOS sign-in is ready on the Samsung viewport; signed-in account data still requires credentials.</p>
        </div>
        <img src="authenticated-preflight.png" alt="Authenticated preflight login screen">
      </article>
$authenticated_section
      <article>
        <div>
          <h2>Sample workspace login</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-login.png" alt="Sample workspace login screen">
      </article>
      <article>
        <div>
          <h2>Sample workspace inbox</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-inbox.png" alt="Sample workspace inbox">
      </article>
      <article>
        <div>
          <h2>Sample workspace account menu</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-account-menu.png" alt="Sample workspace account menu">
      </article>
      <article>
        <div>
          <h2>Sample workspace switcher</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-workspace-menu.png" alt="Sample workspace switcher">
      </article>
      <article>
        <div>
          <h2>Launch Team inbox</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-workspace-launch.png" alt="Launch Team workspace inbox">
      </article>
      <article>
        <div>
          <h2>Workspace return menu</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-workspace-menu-return.png" alt="Workspace return menu">
      </article>
      <article>
        <div>
          <h2>Sample workspace compose</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-compose.png" alt="Sample workspace compose screen">
      </article>
      <article>
        <div>
          <h2>Sample workspace typed draft</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-compose-filled.png" alt="Sample workspace typed draft">
      </article>
      <article>
        <div>
          <h2>Sample workspace detail</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-detail.png" alt="Sample workspace conversation detail">
      </article>
      <article>
        <div>
          <h2>Sample workspace generated file</h2>
          <p><a href="local-preview-flow/local-preview-review.html">Open sample workspace review</a></p>
        </div>
        <img src="local-preview-flow/local-preview-file-viewer.png" alt="Sample workspace generated file viewer">
      </article>
$demo_section
    </section>
  </main>
</body>
</html>
HTML

{
  echo "Dust Android presentation pack"
  echo "Generated: $generated_at"
  echo "$authenticated_status"
  echo "$authenticated_note"
  printf "%s\n" "$authenticated_next_step_manifest"
  echo
  echo "Entry point:"
  echo "- $INDEX_HTML"
  echo
  echo "Linked review pages:"
  echo "- $OUT_DIR/prod-review.html"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-review.html"
  if [[ -n "$authenticated_review_link" ]]; then
    echo "$authenticated_review_link"
  fi
  echo
  echo "$credential_screenshot_heading"
  echo "- $OUT_DIR/login.png"
  echo "- $OUT_DIR/frame-login.png"
  echo "- $OUT_DIR/authenticated-preflight.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-login.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-inbox.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-account-menu.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-workspace-menu.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-workspace-launch.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-compose.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-compose-filled.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-detail.png"
  echo "- $LOCAL_PREVIEW_DIR/local-preview-file-viewer.png"
  printf "%s\n" "$authenticated_manifest"
  printf "%s\n" "$demo_manifest"
} >"$MANIFEST"

echo "Presentation index: $INDEX_HTML"
