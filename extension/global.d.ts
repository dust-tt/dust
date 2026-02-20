declare global {
  interface ImportMeta {
    env?: {
      VITE_BASE_PATH?: string;
      VITE_DUST_CLIENT_FACING_URL?: string;
      VITE_DUST_REGION_STORAGE_KEY?: string;
    };
  }
}

export {};
