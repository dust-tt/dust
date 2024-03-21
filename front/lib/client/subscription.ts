// If mention the price of the PRO plan in a few different places in the code base,
// so this is just a way to have that value hardcoded in one place.
// Changing this value only changes the value displayed on the webapp and the website,
// not on the Stripe dashboard.
export const PRO_PLAN_29_COST = 29;

export const getPriceWithCurrency = (price: number): string => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isLikelyInUS = timeZone.startsWith("America");
  return isLikelyInUS ? `$${price}` : `${price}€`;
};
