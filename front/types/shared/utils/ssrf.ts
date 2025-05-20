import dns from "dns";
import ipaddr from "ipaddr.js";
import type { Dispatcher } from "undici";
import { promisify } from "util";

import logger from "@app/logger/logger";

export const lookupAsync = promisify(dns.lookup);

export const checkIpIsNotOK = (ip: string) => {
  if (!ipaddr.isValid(ip)) {
    return false;
  }

  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    if (range !== "unicast") {
      return true; // Private IP Range
    }
  } catch (err) {
    return true;
  }
  return false;
};

export const createSSRFInterceptor = () => {
  return (dispatch: Dispatcher["dispatch"]) => {
    return function Intercept(
      opts: Dispatcher.DispatchOptions,
      handler: Dispatcher.DispatchHandler
    ) {
      if (opts.origin) {
        const { hostname } = new URL(opts.origin);
        return lookupAsync(hostname)
          .then(({ address, family }) => {
            if (checkIpIsNotOK(address)) {
              logger.error(
                `Call to ${hostname} that resolves to ${address} of ${family} has been blocked.`,
                {
                  hostname,
                  address,
                  family,
                }
              );
              return false;
            }
            return dispatch(opts, handler);
          })
          .catch((e) => {
            throw e;
          });
      } else {
        return dispatch(opts, handler);
      }
    };
  };
};
