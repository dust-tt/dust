type ContactFormEventData = {
  user_email: string;
  user_phone: string | undefined;
  user_first_name: string | undefined;
  user_last_name: string | undefined;
  user_language: string;
  user_headquarters_region: string | undefined;
  user_company_headcount: string;
};

/**
 * Attribution data included in GTM events for conversion tracking.
 */
type AttributionEventData = {
  // Last-touch (for conversion credit)
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  li_fat_id?: string;
  // First-touch (for analysis)
  first_touch_source?: string;
  first_touch_medium?: string;
  first_touch_campaign?: string;
  first_touch_gclid?: string;
};

type DataLayer =
  | {
      event: "userIdentified";
      userId: string;
    }
  | ({
      event: "signup_completed";
      user_email: string;
      company_name: string;
    } & AttributionEventData)
  | ({
      event: "contact_form_submitted";
      is_qualified: boolean;
    } & ContactFormEventData &
      AttributionEventData)
  | {
      event: "contact_form_qualified_lead";
    };

interface Signals {
  identify: (data: { email: string; name: string }) => void;
}

declare global {
  interface Window {
    gtag: (command: string, action: string, params: object) => void;
    dataLayer?: DataLayer[];
    signals?: Signals;
    DD_RUM: {
      clearUser: () => void;
      onReady: (callback: () => void) => void;
      setUser: (user: { id: string; name?: string; email?: string }) => void;
      setGlobalContext: (context: { [key: string]: string }) => void;
    };
  }
}

export {};
