interface DataLayer {
  event: "userIdentified";
  userId: string;
}

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
