declare global {
  interface ImportMeta {
    env?: {
      MODE?: string;
      VITE_BASE_PATH?: string;
      VITE_DUST_API_URL?: string;
      VITE_DUST_API_URL_EU?: string;
      VITE_DUST_API_URL_US?: string;
      VITE_DUST_API_URL_CELL_00002?: string;
      VITE_DUST_CLIENT_FACING_URL?: string;
      VITE_DUST_REGION?: string;
      VITE_DUST_REGION_STORAGE_KEY?: string;
      VITE_DUST_CELL?: string;
      VITE_DUST_CELL_STORAGE_KEY?: string;
      VITE_DUST_COLLAB_URL?: string;
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
