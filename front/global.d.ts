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
