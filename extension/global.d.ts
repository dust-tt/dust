declare global {
  interface ImportMeta {
    env?: {
      VITE_BASE_PATH?: string;
      VITE_DUST_CLIENT_FACING_URL?: string;
      VITE_DUST_REGION?: string;
      VITE_DUST_REGION_STORAGE_KEY?: string;
    };
  }
}

// Augment webextension-polyfill to include `data_collection`, a Firefox-specific
// field for built-in data consent permissions not yet in @types/webextension-polyfill.
// See: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
declare module "webextension-polyfill" {
  namespace Permissions {
    interface AnyPermissions {
      data_collection?: string[];
    }
  }
}

export {};
