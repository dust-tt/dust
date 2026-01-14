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
  | {
      event: "hubspot_form_submitted";
    }
  | {
      event: "contact_form_submitted";
      is_qualified: boolean;
    }
  | {
      event: "contact_form_qualified_lead";
    };

interface Signals {
  identify: (data: { email: string; name: string }) => void;
}

// Default.com SDK configuration
interface DefaultConfig {
  form_id?: number;
  team_id?: number;
  listenToIds?: string[];
  email?: string;
  first_name?: string;
  last_name?: string;
}

// Default.com SDK methods
interface DefaultSDK {
  identify: (data: {
    email: string;
    first_name?: string;
    last_name?: string;
  }) => void;
  book: () => void;
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
    // Default.com SDK
    __default__?: DefaultConfig;
    Default?: DefaultSDK;
  }
}

export {};
