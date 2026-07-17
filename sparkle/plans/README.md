# Animation Plans

| # | Title | Severity | Status |
|---|-------|----------|--------|
| [001](001-tooltip-animation-speed.md) | Speed up tooltip animation | HIGH | DONE |
| [002](002-notification-entry-animation.md) | Add entry animation to Notification toast | HIGH | DONE |
| [003](003-notification-dark-mode-shadow.md) | Fix Notification card shadow in dark mode | MEDIUM | DONE |

## Execution order

002 → 003 (both target the same file; apply in order to avoid conflicts)

## Dependencies

- 002 and 003 are independent of 001
- 002 and 003 both edit `sparkle/src/components/Notification.tsx` — apply sequentially
