type ContactFormEventData = {
  user_email: string | undefined;
  user_phone: string | undefined;
  user_first_name: string | undefined;
  user_last_name: string | undefined;
  user_language: string;
  user_headquarters_region: string | undefined;
  user_company_headcount: string;
  consent_marketing: boolean;
};

type DataLayer =
  | {
      event: "userIdentified";
      userId: string;
    }
  | {
      event: "signup_completed";
      user_email: string;
      company_name: string;
      gclid: string | null;
    }
  | ({
      event: "contact_form_submitted";
      is_qualified: boolean;
    } & ContactFormEventData)
  | ({
      event: "contact_form_qualified_lead";
    } & ContactFormEventData);

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
