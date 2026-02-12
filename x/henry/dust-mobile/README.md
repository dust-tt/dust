# Dust Mobile

React Native (Expo) iOS app for Dust. Chat-only MVP using `@dust-tt/client` SDK with OAuth PKCE authentication.

## Prerequisites

- Node.js >= 20
- Xcode with iOS Simulator (not compatible with Expo Go — requires custom dev client)
- `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

## Setup

```bash
npm install
```

## Running

```bash
# Generate native project + build + run on simulator
npx expo prebuild --platform ios --clean
npx expo run:ios

# Or after first build, just start Metro
npx expo start --dev-client
```

## Auth

Uses OAuth PKCE flow via `expo-web-browser`. The redirect URI `dust://auth/callback` must be registered in the WorkOS dashboard.

## Architecture

```
src/
├── services/       # Auth (OAuth PKCE, token refresh), storage (SecureStore, MMKV)
├── context/        # AuthContext provider
├── hooks/          # useDustAPI, useConversations, useStreamingMessage, useSubmitMessage
├── lib/            # messageReducer, SSE stream transport, SWR config
├── navigation/     # React Navigation (auth guard → main stack)
├── screens/        # Login, WorkspaceSelection, ConversationList, Conversation
├── components/     # MessageList, AgentMessage, InputBar, AgentPicker, etc.
└── types/          # Shared TypeScript types
```

### Key decisions

- **Streaming**: Uses `EventSourcePolyfill` (XHR-based SSE) instead of the SDK's `streamAgentMessageEvents` (which requires ReadableStream, unavailable in RN)
- **Token refresh**: Proactive refresh 60s before expiry, deduplicates concurrent refresh calls
- **New Architecture**: Enabled (`newArchEnabled: true`) for react-native-mmkv 3.x compatibility
- **Polyfills**: `Buffer` polyfilled globally before SDK import (required by SDK's Zod schemas)
