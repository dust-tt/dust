import {
  buildDustAidCookieString,
  getRootCookieDomain,
} from "@marketing/lib/utils/anonymous_id";
import { posthog } from "posthog-js";

export const MARKETING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "li_fat_id",
  "posthog_id",
] as const;

export type UTMParams = Partial<
  Record<(typeof MARKETING_PARAMS)[number], string>
>;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

const UTM_COOKIE_EXPIRY_DAYS = 30;

const CLICK_ID_KEYS = ["gclid", "fbclid", "msclkid", "li_fat_id"] as const;

const CLICK_ID_COOKIE_EXPIRY_DAYS: Record<
  (typeof CLICK_ID_KEYS)[number],
  number
> = {
  li_fat_id: 30,
  gclid: 90,
  fbclid: 7,
  msclkid: 90,
};

export const extractUTMParams = (searchParams: {
  [key: string]: string | string[] | undefined;
}): UTMParams => {
  const utmParams: UTMParams = {};

  for (const key of MARKETING_PARAMS) {
    const value = searchParams[key];
    if (typeof value === "string") {
      utmParams[key] = value;
    }
  }

  return utmParams;
};

export function persistClickIdCookies(params: UTMParams): void {
  if (typeof document === "undefined") {
    return;
  }

  const domain = getRootCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";

  for (const key of CLICK_ID_KEYS) {
    const value = params[key];
    if (value) {
      const expiryDays = CLICK_ID_COOKIE_EXPIRY_DAYS[key];
      const expires = new Date(
        Date.now() + expiryDays * 24 * 60 * 60 * 1000
      ).toUTCString();
      document.cookie = `_dust_${key}=${encodeURIComponent(value)}; expires=${expires}; path=/${domainPart}; SameSite=Lax; Secure`;
    }
  }
}

export function persistDustAidFromURL(): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const dustAid = params.get("dust_aid");
  if (dustAid) {
    document.cookie = buildDustAidCookieString(encodeURIComponent(dustAid));
  }
}

export function persistUTMCookies(params: UTMParams): void {
  if (typeof document === "undefined") {
    return;
  }

  const domain = getRootCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";

  for (const key of UTM_KEYS) {
    const value = params[key];
    if (value) {
      const expires = new Date(
        Date.now() + UTM_COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      ).toUTCString();
      document.cookie = `_dust_${key}=${encodeURIComponent(value)}; expires=${expires}; path=/${domainPart}; SameSite=Lax; Secure`;
    }
  }
}

function getUTMCookies(): UTMParams {
  if (typeof document === "undefined") {
    return {};
  }

  const params: UTMParams = {};
  const cookies = document.cookie.split("; ");

  for (const key of UTM_KEYS) {
    const prefix = `_dust_${key}=`;
    const cookie = cookies.find((c) => c.startsWith(prefix));
    if (cookie) {
      params[key] = decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return params;
}

function getClickIdCookies(): UTMParams {
  if (typeof document === "undefined") {
    return {};
  }

  const params: UTMParams = {};
  const cookies = document.cookie.split("; ");

  for (const key of CLICK_ID_KEYS) {
    const prefix = `_dust_${key}=`;
    const cookie = cookies.find((c) => c.startsWith(prefix));
    if (cookie) {
      params[key] = decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return params;
}

export const getStoredUTMParams = (): UTMParams => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const clickIdCookieParams = getClickIdCookies();
    const utmCookieParams = getUTMCookies();
    const storedData = sessionStorage.getItem("utm_data");
    const sessionParams: UTMParams = storedData ? JSON.parse(storedData) : {};

    return { ...clickIdCookieParams, ...utmCookieParams, ...sessionParams };
  } catch {
    return {};
  }
};

const LANDING_COOKIE = "_dust_landing";
const LANDING_COOKIE_EXPIRY_DAYS = 30;

interface LandingContext {
  referrer: string | null;
  host: string;
  url: string;
  pathname: string;
}

export function persistLandingContext(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (getStoredLandingContext()) {
    return;
  }

  let referrer: string | null = null;
  if (document.referrer) {
    try {
      const refHost = new URL(document.referrer).hostname;
      if (refHost !== "localhost" && !refHost.endsWith(".dust.tt")) {
        referrer = document.referrer;
      }
    } catch {
      // Malformed referrer.
    }
  }

  const context: LandingContext = {
    referrer,
    host: window.location.hostname,
    url: window.location.href,
    pathname: window.location.pathname,
  };

  const domain = getRootCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  const expires = new Date(
    Date.now() + LANDING_COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toUTCString();

  document.cookie = `${LANDING_COOKIE}=${encodeURIComponent(JSON.stringify(context))}; expires=${expires}; path=/${domainPart}; SameSite=Lax; Secure`;
}

export function getStoredLandingContext(): LandingContext | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${LANDING_COOKIE}=`;
  const cookie = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!cookie) {
    return null;
  }

  try {
    return JSON.parse(
      decodeURIComponent(cookie.slice(prefix.length))
    ) as LandingContext;
  } catch {
    return null;
  }
}

export function getStoredReferrer(): string | null {
  return getStoredLandingContext()?.referrer ?? null;
}

export const appendUTMParams = (url: string, utmParams?: UTMParams): string => {
  if (typeof window === "undefined") {
    return url;
  }

  const params = utmParams ?? getStoredUTMParams();

  const posthogId = posthog.get_distinct_id();
  if (posthogId) {
    params.posthog_id = posthogId;
  }

  if (Object.keys(params).length === 0) {
    return url;
  }

  const [baseUrl, existingQuery] = url.split("?");
  const searchParams = new URLSearchParams(existingQuery ?? "");

  for (const [key, value] of Object.entries(params)) {
    if (!searchParams.has(key)) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};
