#!/bin/bash

# Sparkle Development Helper Script
# 
# This script automates the process of building and publishing the Sparkle
# design system package for local development using yalc.
# 
# Usage:
#   ./sparkle_dev.sh           # Build and publish
#   ./sparkle_dev.sh --restore # Restore npm version of Sparkle

set -e

# Colors
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPARKLE_DIR="$(cd "$SCRIPT_DIR/../../sparkle" && pwd)"
FRONT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROLLUP_CONFIG="$SPARKLE_DIR/rollup.config.mjs"

log() {
    local message="$1"
    local color="${2:-$RESET}"
    echo -e "${color}${message}${RESET}"
}

# No longer needed - using environment variable instead

build_sparkle() {
    log "🔨 Building Sparkle (without terser)..." "$BLUE"
    
    # Build in sparkle directory with terser disabled
    cd "$SPARKLE_DIR"
    
    if DISABLE_TERSER=1 npm run build > /dev/null 2>&1; then
        log "✅ Sparkle built successfully" "$GREEN"
    else
        log "❌ Sparkle build failed" "$RED"
        exit 1
    fi
}

publish_to_yalc() {
    log "📦 Publishing to yalc..." "$BLUE"
    
    cd "$SPARKLE_DIR"
    
    # Publish to yalc store
    if "$FRONT_DIR/node_modules/.bin/yalc" publish > /dev/null 2>&1; then
        log "✅ Published to yalc store" "$GREEN"
        
        # Add/update link in front
        cd "$FRONT_DIR"
        if "$FRONT_DIR/node_modules/.bin/yalc" add @dust-tt/sparkle > /dev/null 2>&1; then
            log "✅ Updated front with yalc link" "$GREEN"
        else
            log "❌ Failed to update front with yalc link" "$RED"
            exit 1
        fi
    else
        log "❌ Yalc publish failed" "$RED"
        exit 1
    fi
}

build_and_publish() {
    build_sparkle
    publish_to_yalc
    log "🎉 Sparkle development build complete!" "$GREEN"
}

restore_npm_sparkle() {
    log "🔄 Restoring npm version of Sparkle..." "$BLUE"
    
    cd "$FRONT_DIR"
    
    # Remove yalc link and restore npm version
    if "$FRONT_DIR/node_modules/.bin/yalc" remove @dust-tt/sparkle > /dev/null 2>&1; then
        log "✅ Removed yalc link" "$GREEN"
        
        # Reinstall npm version
        if npm install @dust-tt/sparkle > /dev/null 2>&1; then
            log "✅ Restored npm version of @dust-tt/sparkle" "$GREEN"
            log "🎉 Sparkle restored to npm version!" "$GREEN"
        else
            log "❌ Failed to reinstall npm version" "$RED"
            exit 1
        fi
    else
        log "❌ Failed to remove yalc link" "$RED"
        exit 1
    fi
}

main() {
    # Parse arguments
    if [[ "$1" == "--restore" ]] || [[ "$1" == "-r" ]]; then
        restore_npm_sparkle
        exit 0
    fi
    
    # Check if we're in the right directory structure
    if [[ ! -d "$SPARKLE_DIR" ]] || [[ ! -f "$ROLLUP_CONFIG" ]]; then
        log "❌ Cannot find Sparkle directory or rollup config" "$RED"
        log "   Expected: $SPARKLE_DIR" "$DIM"
        exit 1
    fi
    
    build_and_publish
}

main "$@"