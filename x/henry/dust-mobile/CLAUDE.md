# Dust Mobile App

React Native (Expo) iOS app. Chat-only MVP using `@dust-tt/client` SDK.

## Build & Run

```bash
npm install
npx expo prebuild --platform ios --clean
npx expo run:ios
```

After first build, use `npx expo start --dev-client` to just start Metro.

## Type Check

```bash
npx tsc --noEmit
```

## Project Structure

- `App.tsx` — Root: polyfills + providers + navigation
- `src/services/auth.ts` — OAuth PKCE flow (expo-web-browser + expo-crypto), token refresh
- `src/services/storage.ts` — SecureStore (tokens), MMKV (user data)
- `src/hooks/` — React hooks for SDK integration (useDustAPI, useConversations, useStreamingMessage, useSubmitMessage)
- `src/lib/sseStream.ts` — EventSourcePolyfill-based SSE transport (bypasses SDK's ReadableStream requirement)
- `src/lib/messageReducer.ts` — Agent message state machine (thinking/acting/writing/done)
- `src/navigation/` — React Navigation stack with auth guard
- `src/screens/` — Login, WorkspaceSelection, ConversationList, Conversation
- `src/components/` — MessageList, AgentMessage, InputBar, AgentPicker, etc.

## Key Architecture Decisions

- **No Expo Go** — requires EAS Build / custom dev client (native modules: MMKV, gesture-handler)
- **New Architecture enabled** — required by react-native-mmkv 3.x
- **Buffer polyfill** — must load before any `@dust-tt/client` import (SDK uses `z.instanceof(Buffer)`)
- **SSE via EventSourcePolyfill** — SDK's `streamAgentMessageEvents` needs ReadableStream (unavailable in RN); we use XHR-based SSE with manual reconnect instead
- **Token refresh** — proactive (60s before expiry), deduplicates concurrent refresh calls, in-memory cache for hot-path reads
- **OAuth redirect** — `dust://auth/callback` (registered in WorkOS)

## SDK Integration

The app links `@dust-tt/client` from `../../../sdks/js` via Metro's `watchFolders`. If SDK types change, Metro picks them up automatically.

## Common Issues

- **"Buffer is not defined"** — polyfills.ts must be imported first in App.tsx
- **MMKV TurboModules error** — ensure `newArchEnabled: true` in app.json
- **"main" not registered** — package.json `main` must be `"expo/AppEntry"`
- **Metro can't resolve SDK deps** — install `eventsource-parser` and `zod` in this package
