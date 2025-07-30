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
  // eslint-disable-next-line no-var
  var wakeLocks: Set<string> | undefined;

  interface Window {
    gtag: (command: string, action: string, params: object) => void;
    dataLayer?: DataLayer[];
    signals?: Signals;
  }
}

export {};
