# InputBar — @mention collapse animation

## Trigger

A `mention` node is present in the editor (user selects a name from the @mention dropdown).

## Timing

- **Duration:** `200ms`
- **Easing:** `cubic-bezier(0.34, 1.15, 0.64, 1)` — slight overshoot bounce
- All animated elements share the same duration and easing for synchronized movement.

## What animates

| Element                                   | Property    | Default state              | Collapsed state                                       |
| ----------------------------------------- | ----------- | -------------------------- | ----------------------------------------------------- |
| Text area wrapper                         | `max-height`| `24rem` (auto-expanding)   | `3rem` (single line)                                  |
| Toolbar row (attach, bolt, robot buttons) | `max-height`| `4rem`                     | `0`                                                   |
| Toolbar row                               | `padding-y` | `0.5rem`                   | `0`                                                   |
| Toolbar buttons (attach, bolt, robot)     | `opacity`   | `1`                        | `0`                                                   |
| Send/Mic buttons                          | vertical position | Aligned with toolbar (bottom of bar) | Aligned with text (same `bottom: 10px`) |

### Toolbar button fade

- **Fade out** (collapsing): `50ms` ease-out — near-instant disappearance
- **Fade in** (expanding): `150ms` ease-out — gentle reappearance

## What does NOT animate

- **Bar width** — stays constant
- **Left padding** — stays constant (no horizontal text movement)
- **Send/Mic buttons** — no opacity change, no horizontal movement; they are absolutely positioned at `bottom: 10px`, `right: 16px` and move purely vertically as the container height changes

## Layout details

- Send/Mic buttons are **absolutely positioned** (`bottom: 10px`, `right: 16px`) relative to the outer container. Their vertical movement is a natural consequence of the container shrinking — no explicit `translateY` needed.
- Collapsed text area padding: `12px` top/bottom, `16px` left, `80px` right (to clear the send/mic buttons).
- The `overflow: hidden` on the text area wrapper clips content during the height transition.

## Autocomplete behavior

- **Tab**, **Space**, and **Enter** all confirm the selected mention from the dropdown.
- **Escape** dismisses the dropdown.
- **Arrow Up/Down** navigates the dropdown list.
