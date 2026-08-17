// Hard cap on exported records to keep responses and API usage bounded. The
// export helpers that enforce it land in a follow-up PR.
export const MAX_EXPORT_ITEMS = 1_000;
