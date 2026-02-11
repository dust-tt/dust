# Conversation Display Improvements - Summary

## Current State Analysis

### What Works Well ✅
- Clean, minimal interface
- Real-time streaming
- Basic tool execution display
- Token tracking
- Input handling

### Pain Points ❌
1. **Poor visual hierarchy** - Hard to distinguish messages
2. **Truncated tool output** - Loses important information (max 60 chars input, 200 chars result)
3. **No context indicators** - Missing welcome screen, status, metadata
4. **Basic input** - Single line, no cursor position feedback
5. **Minimal tool feedback** - Just spinner, no progress or details
6. **No error styling** - Errors blend with content
7. **Limited spacing** - Messages run together

## Top 5 High-Impact Improvements

### 1. 🎨 **Add Visual Hierarchy & Spacing** (1 hour)
**Impact:** Huge - Makes conversation readable

**Changes:**
- Add proper margins between messages (currently marginBottom={1})
- Bold colored headers: "You" (green) vs "Assistant" (blue)
- Indent message content (marginLeft={2})
- Add separator lines between exchanges
- Use different text treatments (bold, dim, colors)

**Before:**
```
You: Fix the bug
Assistant: I'll help you fix that...
⟳ read_file file_path=src/index.ts
```

**After:**
```
You
  Fix the bug

Assistant
  I'll help you fix that...
  
  📁 read_file
     file_path: src/index.ts
     ✓ Read 145 lines (0.2s)
─────────────────────────
```

### 2. 🛠️ **Improve Tool Execution Display** (1.5 hours)
**Impact:** High - Core functionality, currently hard to read

**Changes:**
- Add emoji icons per tool type
- Don't truncate parameters - show full paths/commands
- Don't truncate results - show expandable content
- Add timing information
- Better status indicators (⟳ → ✓ / ✗)
- Group multiple tool calls visually

**Current issues:**
```typescript
// Truncates to 60 chars!
formatInput(input: Record<string, unknown>): string {
  parts.push(`${key}=${truncate(val, 60)}`);
}

// Truncates results to 200 chars!
{tc.result && (
  <Text color="gray" dimColor>
    {truncate(tc.result, 200)}
  </Text>
)}
```

**Proposed:**
```typescript
const TOOL_ICONS = {
  read_file: '📁',
  write_file: '📝', 
  edit_file: '✏️',
  bash: '⚙️',
  grep: '🔍',
  glob: '📂',
  ask_user: '❓',
  call_dust_agent: '🤖',
  task: '📋',
};

// Show full content, make expandable if > 500 chars
<ToolResult content={tc.result} maxLines={20} />
```

### 3. 🎯 **Add Welcome Header** (30 min)
**Impact:** Medium-High - Sets context, professional feel

**Add:**
- ASCII logo (like main CLI)
- Version number
- Current directory (with ~/relative paths)
- Git branch & status
- Quick tips for commands

**Example:**
```
 ▌▀▄ █ █    ▌█▀▀ ▀█▀
 ▌▄▀ █▄█    ▌▄██  █

Dust Coding CLI v0.1.0 · ~/projects/myapp
Branch: feature/fixes · Status: M src/index.ts
Type your request or use /help for commands
─────────────────────────────────────────────
```

### 4. 💬 **Enhance Input Box** (1 hour)
**Impact:** Medium - Better UX for typing

**Current:** Basic single-line with simple placeholder
**Improve:**
- Multi-line support (from main CLI)
- Show actual cursor position with highlight
- Round borders (looks more polished)
- Show keyboard shortcuts below
- Visual state for disabled/enabled

**From main CLI's InputBox.tsx:**
```typescript
<Box borderStyle="round" borderColor="gray" paddingX={1}>
  {lines.map((line, index) => (
    <Box key={index}>
      {index === cursorLine && (
        <Text backgroundColor="blue" color="white">
          {line.charAt(cursorPosInLine) || " "}
        </Text>
      )}
    </Box>
  ))}
</Box>
<Text dimColor>↵ to send · \↵ for new line · ESC to clear</Text>
```

### 5. 📊 **Better Status & Error Display** (1 hour)
**Impact:** Medium - Helps understand what's happening

**Status improvements:**
- Show what the agent is doing ("Reading files...", "Running tests...")
- Progress indication for multi-step operations
- Live token counter
- Show active tool name

**Error improvements:**
- Red bordered box for errors (not inline text)
- Error icon ❌
- Structured error message
- Suggested actions
- Stack trace in collapsed section

**Example:**
```typescript
// Current
<Text>Error: {event.message}</Text>

// Improved
<Box borderStyle="round" borderColor="red" padding={1}>
  <Text color="red">❌ Error</Text>
  <Text>{event.message}</Text>
  <Text dimColor>Suggestion: Check file permissions</Text>
</Box>
```

## Additional Nice-to-Haves

### 6. 🎭 **Thinking Process Display**
Show agent's chain-of-thought (thinkingText) more prominently:
```typescript
{thinking && (
  <Box borderLeft borderColor="gray" paddingLeft={1} marginLeft={2}>
    <Text color="gray" italic>💭 {thinking}</Text>
  </Box>
)}
```

### 7. 🎨 **Code Syntax Highlighting**
For bash outputs and code snippets, add basic highlighting

### 8. ⌨️ **Slash Commands**
Add `/help`, `/clear`, `/exit` commands (low effort, nice UX)

### 9. 📝 **Message Metadata**
Show timestamps, token usage per message

### 10. 📏 **Terminal Resize Handling**
Like main CLI - clear and rerender on resize to prevent artifacts

## Recommended Implementation Order

### Phase 1: Core Readability (3 hours)
1. Welcome header (30 min)
2. Visual hierarchy & spacing (1 hour)
3. Tool execution display (1.5 hours)

### Phase 2: Polish (2 hours)
4. Input box improvements (1 hour)
5. Status & error display (1 hour)

### Phase 3: Nice-to-Have (2-3 hours)
6. Thinking display (30 min)
7. Slash commands (30 min)
8. Terminal resize handling (1 hour)
9. Message metadata (30 min)

## Files to Modify

1. `src/ui/Chat.tsx` - Main conversation container
2. `src/ui/MessageStream.tsx` - Streaming message display
3. `src/ui/ToolExecution.tsx` - Tool call rendering
4. `src/ui/InputBox.tsx` - User input component
5. **New:** `src/ui/WelcomeHeader.tsx` - Welcome screen
6. **New:** `src/ui/Message.tsx` - Individual message component

## Quick Wins to Start With

If you want to see immediate improvement with minimal code:

1. **Better spacing** (5 min):
   ```typescript
   // In Chat.tsx, change marginBottom={1} to marginBottom={2}
   // Add separators between messages
   ```

2. **Tool icons** (10 min):
   ```typescript
   // In ToolExecution.tsx, add emoji map and show icons
   ```

3. **Don't truncate** (5 min):
   ```typescript
   // In ToolExecution.tsx, remove truncate() calls
   ```

4. **Better colors** (10 min):
   ```typescript
   // Use consistent color scheme throughout
   // Green for user, Blue for assistant, Yellow for tools
   ```

These 4 changes (30 min total) would make a noticeable difference!

## Questions for Discussion

1. **Truncation policy**: Should tool results be fully shown, or expandable?
2. **Terminal width**: Handle narrow terminals (< 80 cols) differently?
3. **History**: Keep all messages or limit to recent N?
4. **Auto-scroll**: Should conversation auto-scroll to bottom?
5. **Persistence**: Save conversation history to file?
6. **Theme**: Add dark/light theme support?
7. **Performance**: For long conversations, need virtualization?

## Comparison with Main CLI

The main Dust CLI (`../../../cli/src/ui/commands/Chat.tsx`) has:
- ✅ Welcome header with logo
- ✅ Multi-line input with cursor positioning
- ✅ Proper message spacing and indentation
- ✅ Slash commands (/switch, /attach, etc.)
- ✅ File attachment display
- ✅ Terminal resize handling
- ✅ Conversation history preservation
- ✅ Better status indicators

We should adopt these patterns for consistency!
