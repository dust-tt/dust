# Dust Mobile App

React Native/Expo mobile app for Dust, part of the extension multi-platform architecture.

## Architecture

This mobile app shares code with the browser extension:
- `@app/shared/services/` - Auth, storage service abstractions
- `@app/shared/lib/` - Shared utilities and config
- `@dust-tt/client` - Dust API SDK (from `sdks/js/`)

## Development Setup

### Prerequisites

1. Build the Dust SDK first (required for `@dust-tt/client`):
   ```bash
   cd /path/to/dust/sdks/js
   npm install
   npm run build
   ```

2. Install extension dependencies:
   ```bash
   cd /path/to/dust/extension
   npm install
   ```

### Running the App

**From extension root:**
```bash
# Install mobile dependencies
npm run install:mobile

# Start Expo dev server
npm run dev:mobile

# Or run on specific platform
npm run dev:mobile:ios
npm run dev:mobile:android
```

**Or directly from mobile directory:**
```bash
cd platforms/mobile
npm install
npx expo start
```

### Development Options

In the Expo dev server, you can:
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Scan QR code with Expo Go app on your device

## Project Structure

```
platforms/mobile/
├── app/                    # Expo Router screens
├── components/             # React Native components
├── contexts/               # React contexts (Auth)
├── hooks/                  # Custom hooks (useConversation, useSendMessage)
├── lib/
│   ├── services/           # Mobile-specific service implementations
│   │   ├── auth.ts         # MobileAuthService (extends shared AuthService)
│   │   ├── storage.ts      # MobileStorageService (implements shared interface)
│   │   └── api.ts          # API wrapper using @dust-tt/client SDK
│   ├── types/              # Type re-exports from SDK
│   ├── config/             # Mobile-specific config
│   └── markdown/           # Dust markdown renderer
└── assets/                 # Images, fonts
```

## Shared Code

The mobile app imports shared code from the extension:

```typescript
// Import shared services
import { AuthService } from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";

// Import SDK types
import { DustAPI, type ConversationPublicType } from "@dust-tt/client";
```

Path aliases:
- `@/*` - Mobile local files (`./`)
- `@app/*` - Extension root (`../../`)
