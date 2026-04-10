export const DEV_MODE_STORAGE_KEY = "dust_dev_mode";

// Cached once at module load — no per-render localStorage reads.
export const DEV_MODE_ACTIVE =
  typeof window !== "undefined" &&
  localStorage.getItem(DEV_MODE_STORAGE_KEY) === "true";
