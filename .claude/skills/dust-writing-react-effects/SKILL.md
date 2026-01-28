---
name: writing-react-effects
description: Writes React components without unnecessary useEffect. Use when creating/reviewing React components, refactoring effects, or when code uses useEffect to transform data or handle events.
---

# Writing React Effects Skill

Guides writing React components that avoid unnecessary `useEffect` calls.

## Core Principle

> Effects are an escape hatch for synchronizing with **external systems** (network, DOM, third-party widgets). If there's no external system, you don't need an Effect.

## Decision Flowchart

When you see or write `useEffect`, ask:

```
Is this synchronizing with an EXTERNAL system?
├─ YES → useEffect is appropriate
│   Examples: WebSocket, browser API subscription, third-party library
│
└─ NO → Don't use useEffect. Use alternatives:
    │
    ├─ Transforming data for render?
    │   → Calculate during render (inline or useMemo)
    │
    ├─ Handling user event?
    │   → Move logic to event handler
    │
    ├─ Expensive calculation?
    │   → useMemo (not useEffect + setState)
    │
    ├─ Resetting state when prop changes?
    │   → Pass different `key` to component
    │
    ├─ Adjusting state when prop changes?
    │   → Calculate during render or rethink data model
    │
    ├─ Subscribing to external store?
    │   → useSyncExternalStore
    │
    └─ Fetching data?
        → Framework data fetching or custom hook with cleanup
```

## Anti-Patterns to Detect

| Anti-Pattern                              | Problem                                          | Alternative                         |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `useEffect` + `setState` from props/state | Causes extra re-render                           | Compute during render               |
| `useEffect` to filter/sort data           | Unnecessary effect cycle                         | Derive inline or `useMemo`          |
| `useEffect` for click/submit handlers     | Loses event context                              | Event handler                       |
| `useEffect` to notify parent              | Breaks unidirectional flow                       | Call in event handler               |
| `useEffect` with empty deps for init      | Runs twice in dev; conflates app init with mount | Module-level code or `didInit` flag |
| `useEffect` for browser subscriptions     | Error-prone cleanup                              | `useSyncExternalStore`              |

## When useEffect IS Appropriate

- Syncing with external systems (WebSocket, third-party widgets)
- Setting up/cleaning up subscriptions
- Fetching data based on current props (with cleanup for race conditions)
- Measuring DOM elements after render
- Syncing with non-React code
