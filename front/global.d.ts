interface DataLayer {
  event: "userIdentified";
  userId: string;
}

declare global {
  // eslint-disable-next-line no-var
  var wakeLocks: Set<string> | undefined;

  interface Window {
    gtag: (command: string, action: string, params: object) => void;
    dataLayer?: DataLayer[];
  }
}

export {};
