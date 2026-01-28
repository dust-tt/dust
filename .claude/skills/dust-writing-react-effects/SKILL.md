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

## Calculate Derived State During Rendering

If a value can be computed from current props/state, do not store it in state or update it in an effect. Derive it during render to avoid extra renders and state drift. Do not set state in effects solely in response to prop changes; prefer derived values or keyed resets instead.

**Incorrect (redundant state and effect):**

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    setFullName(firstName + ' ' + lastName)
  }, [firstName, lastName])

  return <p>{fullName}</p>
}
```

**Correct (derive during render):**

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const fullName = firstName + ' ' + lastName

  return <p>{fullName}</p>
}
```

References: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
