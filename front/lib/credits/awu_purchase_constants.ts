// TODO: Replace static cap with a dynamic formula once we finalize rules for AWU purchase limits
export const MAX_AWU_PURCHASE_CREDITS_PER_CYCLE = 1_000_000;
export const MIN_AWU_PURCHASE_CREDITS = 100;

// Max discount that can be applied to an AWU credit purchase. AWU has its
// own economics (sold at a fixed per-credit rate), so the programmatic
// `MAX_DISCOUNT_PERCENT` (derived from token-pricing markup) does not apply.
export const MAX_AWU_DISCOUNT_PERCENT = 15;
