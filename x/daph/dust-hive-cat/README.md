# DustHiveCat

A macOS app that displays a roaming cat on your screen. When Claude Code needs your attention (via hooks), the cat alerts you - click it to jump to the right tmux session.

## Features

- Roaming cat that walks and sleeps around your screen (like a real cat!)
- Integrates with Claude Code hooks via `dustcat://` URL scheme
- Click the cat when it's bouncing to switch to the correct tmux pane
- Click status bar icon to do the same (left-click = cat action, right-click = menu)
- Drag and drop the cat anywhere on screen
- Preferences window (via menu bar) to customize:
  - Pet (Soupinou, Chawy, Pistache, Chalom, Sundae)
  - Size (0.5x - 2x)
  - Speed (0.5x - 2x)
  - Activity (10% - 90% walk probability, default 40%)
- Status bar icon animates when notification is active
- Lightweight (~15-20MB memory)

## Quick Install (for coworkers)

Download `DustHiveCat.app` from releases, move to Applications, double-click.

## Build from Source

### 1. Build the App

```bash
cd x/daph/dust-hive-cat
./Scripts/bundle-app.sh
```

The app will be at `.build/DustHiveCat.app`

### 2. Install & Run

```bash
# Copy to Applications (optional)
cp -r .build/DustHiveCat.app /Applications/

# Run it
open .build/DustHiveCat.app
```

### 3. Configure Claude Code Hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -n \"$TMUX\" ]; then TARGET=$(tmux display-message -p '#S:#I.#P'); else TARGET='default'; fi; TARGET_ENCODED=$(echo \"$TARGET\" | sed 's/:/%3A/g; s/\\./%2E/g'); open \"dustcat://notify?target=${TARGET_ENCODED}&title=Claude+ready\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "if [ -n \"$TMUX\" ]; then TARGET=$(tmux display-message -p '#S:#I.#P'); else TARGET='default'; fi; TARGET_ENCODED=$(echo \"$TARGET\" | sed 's/:/%3A/g; s/\\./%2E/g'); open \"dustcat://notify?target=${TARGET_ENCODED}&title=Permission+needed\""
          }
        ]
      }
    ]
  }
}
```

The cat bounces when:
- Claude finishes a response (Stop hook)
- Claude needs your permission (Notification hook)

Clicking it switches to the exact tmux pane.

## URL Scheme

The app responds to `dustcat://` URLs:

- `dustcat://notify?target=SESSION%3AWINDOW.PANE&title=MESSAGE` - Alert the user, store tmux target for click action
- `dustcat://reset` - Return cat to normal idle state

Note: The target uses URL encoding (`:` → `%3A`, `.` → `%2E`).

## Project Structure

```
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
- **Launch at Login**: Start automatically when you log in

Settings are saved automatically and persist across app restarts.

## Credits

- Inspired by [Dockitty](https://www.dockitty.app/)

## License

MIT
