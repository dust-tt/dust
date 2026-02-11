# DustHiveCat

A macOS app that displays a roaming cat on your screen. When Claude Code needs your attention (via hooks), the cat alerts you - click it to jump to the right tmux session.

## Features

- Roaming cat that walks and sleeps around your screen (like a real cat!)
- Integrates with Claude Code hooks via `dustcat://` URL scheme
- Click the cat when it's bouncing to switch to the correct tmux pane
- Auto-dismisses when you manually switch to the target tmux pane
- Click status bar icon to do the same (left-click = cat action, right-click = menu)
- Double-tap Option key (⌥⌥) as a global hotkey to jump to the tmux session
- Never steals focus from your current app
- Drag and drop the cat anywhere on screen or to another monitor (sets new "home" position)
- Cat roams within a configurable radius of its home position
- Preferences window (via menu bar) to customize:
  - Pet (Soupinou, Chawy, Pistache, Chalom, Sundae)
  - Size (0.5x - 2x)
  - Speed (0.5x - 2x)
  - Activity (10% - 90% walk probability, default 40%)
- Status bar icon animates when notification is active
- Lightweight (~15-20MB memory)

## Install

```bash
cd x/daph/dust-hive-cat
./Scripts/cli.sh install
```

This builds the app, installs it to `/Applications/`, sets up the notify script, and adds the `dustcat` CLI to your PATH.

Then add the following hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{"hooks": [{"type": "command", "command": "~/.claude/dustcat-notify.sh"}]}],
    "Notification": [{"matcher": "permission_prompt", "hooks": [{"type": "command", "command": "~/.claude/dustcat-notify.sh"}]}]
  }
}
```

The cat bounces when Claude finishes a response or needs your permission. Click it to switch to the exact tmux pane.

## CLI

After install, the `dustcat` command is available:

```
dustcat install     # First-time setup
dustcat update      # Rebuild from source, replace app, restart
dustcat start       # Launch the app
dustcat stop        # Quit the app
dustcat uninstall   # Remove everything
```

## URL Scheme

The app responds to `dustcat://` URLs:

- `dustcat://notify?target=SESSION%3AWINDOW.PANE&title=MESSAGE` - Alert the user, store tmux target for click action
- `dustcat://reset` - Return cat to normal idle state

Note: The target uses URL encoding (`:` → `%3A`, `.` → `%2E`).

## Project Structure

```
Scripts/
├── cli.sh                 # dustcat CLI (install/update/start/stop/uninstall)
├── bundle-app.sh          # Build .app bundle from Swift source
├── dustcat-notify.sh      # Notify script installed to ~/.claude/
└── codex-notify.sh        # Notify script for OpenAI Codex

DustHiveCat/
├── App/
│   ├── DustHiveCatApp.swift       # App entry point
│   └── AppDelegate.swift           # URL handling, status bar
├── Views/
│   ├── CatWindowController.swift   # Main window management
│   └── CatView.swift               # Cat rendering & interaction
├── Models/
│   ├── CatState.swift              # State definitions
│   ├── CatPreferences.swift        # User preferences (UserDefaults)
│   └── RoamingBehavior.swift       # Movement logic
├── Animation/
│   ├── CatAnimator.swift           # Frame animation
│   └── SpriteManager.swift         # Asset loading
├── Resources/                       # Pet sprite PNGs (organized by pet)
└── Info.plist
```

## Customization

Right-click the status bar icon to access settings directly in the menu:

- **Pet**: Soupinou, Chawy, Pistache, Chalom, Sundae
- **Size**: 0.5x to 2x scale
- **Speed**: 0.5x to 2x walk speed
- **Activity**: 10% to 90% walk probability (default 40%, so 60% sleep - he's a cat!)
- **Roaming Radius**: How far the cat wanders from its "home" position
  - Small (100px), Medium (150px, default), Large (250px), Extra Large (400px), Unlimited
  - Home is set on spawn and updated when you drag & drop the cat
- **Hotkey (⌥⌥)**: Enable/disable double-tap Option key to jump to tmux session
- **Show env tooltip**: Show worktree/session name above the cat on notification (disabled by default)
- **Launch at Login**: Start automatically when you log in

Settings are saved automatically and persist across app restarts.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AppDelegate                               │
│  • URL scheme handler (dustcat://)                              │
│  • Status bar icon + menu                                        │
│  • Status bar animation (6 frames @ 5fps during notification)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CatWindowController                           │
│  • Borderless floating window (.floating level)                 │
│  • Coordinates roaming behavior + animator                      │
│  • Handles tmux session switching on click                      │
└──────────┬─────────────────────────────────┬────────────────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────┐           ┌─────────────────────┐
│   RoamingBehavior   │           │     CatAnimator     │
│                     │           │                     │
│ • State machine:    │           │ • Sprite animation  │
│   idle/walking/     │           │ • 3 fps frame rate  │
│   sleeping/attention│           │ • Per-pet sprites   │
│                     │           │                     │
│ • Decision timer    │           └─────────────────────┘
│   (4s interval)     │
│                     │
│ • Movement timer    │
│   (60fps, only when │
│   walking/bouncing) │
└─────────────────────┘
```

### State Machine

The cat has 4 states:
- **idle**: Transitional state
- **walking**: Moving toward a random target position
- **sleeping**: Stationary, wakes up after 8-20 seconds
- **attentionNeeded**: Bouncing in place, waiting for click

State transitions:
```
start → makeDecision() → walking (40%) or sleeping (60%)
walking → reaches target → makeDecision()
sleeping → 8-20s timeout → makeDecision()
notification URL → attentionNeeded
click on attention → tmux switch → makeDecision()
```

### CPU Optimization

1. **Movement timer only when needed**: The 60fps timer only runs during `walking` or `attentionNeeded` states. When sleeping/idle, no timer runs.

2. **Pause when hidden**: When "Hide Cat" is clicked, all timers stop completely. The status bar icon remains but uses 0 CPU.

3. **Low-frequency animation**: Sprite animation runs at 3fps (sufficient for pixel art).

### URL Scheme Flow

```
Claude Code hook fires
        │
        ▼
open "dustcat://notify?target=session%3Awindow.pane&title=..."
        │
        ▼
AppDelegate.handleURLEvent()
        │
        ▼
CatWindowController.triggerAttention(target, title)
        │
        ├──► RoamingBehavior.state = .attentionNeeded
        │    (starts 60fps bounce timer)
        │
        └──► CatAnimator.play(.notification)
             (starts notification sprite loop)
        │
        ▼
Status bar starts animating (icon_1..6.png @ 5fps)
        │
        ▼
User clicks cat or status bar
        │
        ▼
openTmuxSession()
        │
        ├──► tmux switch-client -t "session:window.pane"
        │
        └──► AppleScript: tell "Alacritty" to activate
        │
        ▼
resetToIdle() → makeDecision() → normal roaming
```

### Security

The tmux target from URL is validated before shell execution:
- Regex whitelist: `^[A-Za-z0-9_.:-]+$`
- Single quote escaping as defense in depth

This prevents command injection via malicious `dustcat://` URLs.

## Credits

- Inspired by [Dockitty](https://www.dockitty.app/)

## License

MIT
