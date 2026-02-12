#!/bin/bash
# dustcat CLI — manage DustHiveCat
# Usage: dustcat <command>

set -e

# Resolve project directory (works whether called via symlink or directly)
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
    DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

APP_NAME="DustHiveCat"
APP_BUNDLE="$PROJECT_DIR/.build/$APP_NAME.app"
INSTALL_DIR="/Applications"
NOTIFY_DEST="$HOME/.claude/dustcat-notify.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ─── Helpers ───

build() {
    echo "  Building $APP_NAME..."
    "$SCRIPT_DIR/bundle-app.sh" > /dev/null 2>&1
}

quit_app() {
    if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "  Stopping running instance..."
        pkill -x "$APP_NAME" 2>/dev/null || true
        sleep 1
    fi
}

install_app() {
    echo "  Installing app to $INSTALL_DIR/"
    rm -rf "$INSTALL_DIR/$APP_NAME.app"
    cp -r "$APP_BUNDLE" "$INSTALL_DIR/"
}

install_notify_script() {
    echo "  Installing notify script to $NOTIFY_DEST"
    mkdir -p "$(dirname "$NOTIFY_DEST")"
    cp "$SCRIPT_DIR/dustcat-notify.sh" "$NOTIFY_DEST"
    chmod +x "$NOTIFY_DEST"
}

print_hook_config() {
    if grep -q "dustcat-notify" "$SETTINGS_FILE" 2>/dev/null; then
        echo "  Claude Code hooks already configured."
    else
        echo ""
        echo "  Add the following hooks to $SETTINGS_FILE:"
        echo ""
        echo '    "hooks": {'
        echo '      "Stop": [{"hooks": [{"type": "command", "command": "~/.claude/dustcat-notify.sh"}]}],'
        echo '      "Notification": [{"matcher": "permission_prompt", "hooks": [{"type": "command", "command": "~/.claude/dustcat-notify.sh"}]}]'
        echo '    }'
    fi
}

install_cli() {
    local dest="$HOME/.local/bin/dustcat"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$SCRIPT_DIR/cli.sh" "$dest"
    echo "  Symlinked CLI to $dest"

    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
        echo ""
        echo "  Add to your shell profile:"
        echo '    export PATH="$HOME/.local/bin:$PATH"'
    fi
}

launch_app() {
    echo "  Launching $APP_NAME..."
    open "$INSTALL_DIR/$APP_NAME.app"
}

is_installed() {
    [ -d "$INSTALL_DIR/$APP_NAME.app" ]
}

# ─── Commands ───

cmd_install() {
    echo "Installing DustHiveCat..."
    echo ""
    if ! is_installed; then
        build
        install_app
    else
        echo "  App already installed, skipping build."
    fi
    if [ ! -f "$NOTIFY_DEST" ]; then
        install_notify_script
    else
        echo "  Notify script already installed, skipping."
    fi
    if [ ! -L "$HOME/.local/bin/dustcat" ]; then
        install_cli
    else
        echo "  CLI already linked, skipping."
    fi
    print_hook_config
    if ! pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo ""
        launch_app
    fi
    echo ""
    echo "Done! Run 'dustcat update' anytime to get the latest version."
}

cmd_update() {
    if ! is_installed; then
        echo "DustHiveCat is not installed. Run 'dustcat install' first."
        exit 1
    fi

    echo "Updating DustHiveCat..."
    echo ""
    build
    quit_app
    install_app
    install_notify_script
    echo ""
    launch_app
    echo ""
    echo "Done!"
}

cmd_start() {
    if ! is_installed; then
        echo "DustHiveCat is not installed. Run 'dustcat install' first."
        exit 1
    fi
    if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "DustHiveCat is already running."
        exit 0
    fi
    launch_app
    echo "Done!"
}

cmd_stop() {
    if ! pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "DustHiveCat is not running."
        exit 0
    fi
    quit_app
    echo "Done!"
}

cmd_uninstall() {
    echo "Uninstalling DustHiveCat..."
    echo ""
    quit_app
    if [ -d "$INSTALL_DIR/$APP_NAME.app" ]; then
        echo "  Removing $INSTALL_DIR/$APP_NAME.app"
        rm -rf "$INSTALL_DIR/$APP_NAME.app"
    fi
    if [ -f "$NOTIFY_DEST" ]; then
        echo "  Removing $NOTIFY_DEST"
        rm -f "$NOTIFY_DEST"
    fi
    if [ -L "$HOME/.local/bin/dustcat" ]; then
        echo "  Removing ~/.local/bin/dustcat"
        rm -f "$HOME/.local/bin/dustcat"
    fi
    echo ""
    echo "Done! You may also want to remove the dustcat hooks from $SETTINGS_FILE."
}

cmd_help() {
    echo "dustcat — manage DustHiveCat"
    echo ""
    echo "Usage: dustcat <command>"
    echo ""
    echo "Commands:"
    echo "  install     First-time setup: build, install app + notify script, add CLI to PATH"
    echo "  update      Rebuild from source, replace app, restart"
    echo "  start       Launch DustHiveCat"
    echo "  stop        Quit DustHiveCat"
    echo "  uninstall   Remove app, notify script, and CLI"
    echo "  help        Show this help"
}

# ─── Main ───

case "${1:-help}" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    start)     cmd_start ;;
    stop)      cmd_stop ;;
    uninstall) cmd_uninstall ;;
    help)      cmd_help ;;
    *)
        echo "Unknown command: $1"
        echo ""
        cmd_help
        exit 1
        ;;
esac
