export type BillingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type BillingProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: BillingAddress | null;
};

export type BillingPaymentMethod = {
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  bankName: string | null;
  country: string | null;
};

export type BillingInfo = {
  profile: BillingProfile;
  paymentMethod: BillingPaymentMethod | null;
};

export type GetBillingInfoResponseBody = {
  billingInfo: BillingInfo | null;
};
