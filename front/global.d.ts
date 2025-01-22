declare global {
  // eslint-disable-next-line no-var
  var wakeLocks: Set<string> | undefined;

  interface Window {
    gtag: (command: string, action: string, params: object) => void;
    dataLayer: any[];
  }
}

export {};
