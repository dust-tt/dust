# Before & After Mockups

## CURRENT STATE (Before)

```
Dust Coding CLI | /Users/adrien/git/dust/x/adrsimon/coding

You: Create a new component for user profiles

⟳ read_file file_path=src/components/UserProfile.tsx
⟳ write_file file_path=src/components/UserProfile.tsx, co...

I'll create a new UserProfile component. First, let me check if...

Tokens: 450 in / 892 out

> _
```

### Issues:
- No welcome/context
- Tool calls truncated and hard to read
- No visual separation between elements
- Thinking text not distinguished
- Basic input box
- Results truncated (see "co..." above)
- No tool status feedback
- Messages run together

---

## PROPOSED STATE (After - Phase 1)

```
┌────────────────────────────────────────────────────────────┐
│  ▌▀▄ █ █    ▌█▀▀ ▀█▀                                       │
│  ▌▄▀ █▄█    ▌▄██  █                                        │
│                                                             │
│  Dust Coding CLI v0.1.0 · ~/git/dust/x/adrsimon/coding    │
│  Branch: main · Status: M src/ui/Chat.tsx                  │
│  Type your request or use /help for commands               │
└────────────────────────────────────────────────────────────┘

You
  Create a new component for user profiles

Assistant
  💭 I need to first check if a UserProfile component already exists,
     then create a new one with proper TypeScript types...

  📁 read_file
  │  file_path: src/components/UserProfile.tsx
  │  ✓ File not found (0.1s)

  📝 write_file  
  │  file_path: src/components/UserProfile.tsx
  │  content: import React from 'react';\n\nexport function Use...
  │  ✓ Wrote 147 lines (0.3s)
  │  
  │  Result:
  │  File created successfully at src/components/UserProfile.tsx
  │  Added TypeScript interface for UserProfileProps
  │  Included basic styling and props

  I've created a new UserProfile component with TypeScript types,
  basic props handling, and a clean structure. The component includes:
  
  - UserProfileProps interface with name, email, avatar
  - Responsive layout
  - Default props handling
  - Export for easy importing

  Would you like me to add any specific features like edit mode,
  profile picture upload, or form validation?

────────────────────────────────────────────────────────────────

╭─ Input ────────────────────────────────────────────────────╮
│ > _                                                         │
╰─────────────────────────────────────────────────────────────╯
↵ send · Shift+↵ new line · ESC clear · Ctrl+C exit

Tokens: 450 in / 892 out · 1.2s
```

### Improvements:
✅ Welcome header with context
✅ Clear visual hierarchy (bold headers, indentation)
✅ Full tool parameters shown
✅ Tool status with icons and timing
✅ Tool results fully displayed (not truncated)
✅ Thinking process shown separately
✅ Better input box with hints
✅ Message separator
✅ Proper spacing throughout

---

## PROPOSED STATE (After - Phase 2 with Multi-line)

```
┌────────────────────────────────────────────────────────────┐
│  ▌▀▄ █ █    ▌█▀▀ ▀█▀                                       │
│  ▌▄▀ █▄█    ▌▄██  █                                        │
│                                                             │
│  Dust Coding CLI v0.1.0 · ~/git/dust/x/adrsimon/coding    │
│  Branch: main · Status: M src/ui/Chat.tsx                  │
│  Type your request or use /help for commands               │
└────────────────────────────────────────────────────────────┘

You
  Create a new component for user profiles with:
  - Edit mode
  - Avatar upload
  - Form validation

Assistant
  💭 This requires multiple files: component, validation hook, and
     types. I'll create them in the proper structure...

  📁 read_file
  │  file_path: src/types/user.ts
  │  ✓ Read 45 lines (0.1s)

  📝 write_file
  │  file_path: src/components/UserProfile.tsx
  │  ✓ Wrote 234 lines (0.4s)

  📝 write_file
  │  file_path: src/hooks/useProfileValidation.ts
  │  ✓ Wrote 78 lines (0.2s)

  ⚙️  bash
  │  command: npm run type-check
  │  ✓ Completed (2.3s)
  │
  │  Result:
  │  ✓ Type checking passed
  │  ✓ No errors found
  │  Checked 15 files

  I've created a complete UserProfile component with all requested
  features:

  1. **UserProfile.tsx** - Main component with edit/view modes
  2. **useProfileValidation.ts** - Custom hook for form validation
  3. **Avatar upload** - Integrated with file upload handler
  4. **Validation** - Email, name length, file size checks

  The component uses existing user types and follows the project's
  patterns. Type checking passed successfully.

  Try it by importing: `import { UserProfile } from './components'`

────────────────────────────────────────────────────────────────

╭─ Input ────────────────────────────────────────────────────╮
│ > Run the tests for this component                         │
│   █                                                         │
╰─────────────────────────────────────────────────────────────╯
↵ send · Shift+↵ new line · ESC clear · Ctrl+C exit
⚡ auto accept edits off

Tokens: 1,245 in / 2,156 out · 4.8s
```

### Additional Improvements (Phase 2):
✅ Multi-line input with proper cursor
✅ Multiple tool calls grouped visually
✅ Expanded result sections with syntax
✅ Better timing and status feedback
✅ Auto-accept toggle indicator
✅ Full command output (not truncated)

---

## PROPOSED STATE (After - Phase 3 with Error Handling)

```
You
  Deploy this to production

Assistant
  💭 I'll check the current git status and run the deployment script...

  ⚙️  bash
  │  command: git status --short
  │  ✓ Completed (0.1s)
  │
  │  Result:
  │  M src/components/UserProfile.tsx
  │  M src/hooks/useProfileValidation.ts
  │  ?? tests/UserProfile.test.tsx

  ⚙️  bash
  │  command: npm run deploy:prod
  │  ✗ Failed (1.2s)
  │
  ╭─ Error ──────────────────────────────────────────────────╮
  │ ❌ Deployment Failed                                      │
  │                                                            │
  │ Command exited with code 1                                │
  │                                                            │
  │ Error: You have uncommitted changes. Please commit or     │
  │ stash them before deploying.                              │
  │                                                            │
  │ 💡 Suggestions:                                           │
  │   • Commit your changes: git commit -am "message"         │
  │   • Stash changes: git stash                              │
  │   • Force deploy: npm run deploy:prod --force             │
  ╰────────────────────────────────────────────────────────────╯

  The deployment failed because you have uncommitted changes.
  Would you like me to:
  1. Commit the changes with a message
  2. Stash them temporarily
  3. Show you what changed

────────────────────────────────────────────────────────────────
```

### Additional Improvements (Phase 3):
✅ Structured error display with box
✅ Error icon and suggestions
✅ Better error context
✅ Actionable next steps
✅ Clear failure indication

---

## Key Visual Design Principles

### Colors
- 🟢 **Green** - User messages, success states
- 🔵 **Blue** - Assistant messages, info
- 🟡 **Yellow** - Warnings, in-progress, thinking
- 🔴 **Red** - Errors, failures
- ⚪ **Gray** - Metadata, hints, secondary info
- 🔷 **Cyan** - Tool names, code, technical elements

### Typography
- **Bold** - Headers, important elements
- *Italic* - Thinking, internal monologue
- `Monospace` - Code, file paths, commands
- Dimmed - Secondary information, hints

### Spacing
- 1 line between UI sections
- 2 lines between conversation exchanges
- Indentation (2 spaces) for nested content
- Borders for containers (input, errors)

### Icons
- 📁 read_file
- 📝 write_file
- ✏️ edit_file
- ⚙️ bash
- 🔍 grep
- 📂 glob
- ❓ ask_user
- 🤖 call_dust_agent
- 📋 task
- ✓ success
- ✗ error
- ⟳ loading
- 💭 thinking
- ❌ error box
- 💡 suggestion

### Layout
```
┌─ Container ─┐
│ Content     │  ← Padded
│   Nested    │  ← Indented
└─────────────┘

Regular text
  Indented content
    Double indented

─────────────────  ← Separator
```
