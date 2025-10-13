// Extract UTM parameters from query string
export const extractUTMParams = (searchParams: {
  [key: string]: string | string[] | undefined;
}) => {
  const utmParams: { [key: string]: string } = {};

  // Define standard UTM parameter keys
  const utmKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "msclkid",
  ];

  // Extract only string values from query parameters
  utmKeys?.forEach((key) => {
    const value = searchParams[key];
    if (typeof value === "string") {
      utmParams[key] = value;
    }
  });

  return utmParams;
};

// Get stored UTM parameters from sessionStorage
export const getStoredUTMParams = (): { [key: string]: string } => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedData = sessionStorage?.getItem("utm_data");
    return storedData ? JSON.parse(storedData) : {};
  } catch (error) {
    return {};
  }
};

// Helper to append UTM parameters to URLs
export const appendUTMParams = (
  url: string,
  utmParams?: { [key: string]: string }
): string => {
  if (typeof window === "undefined") {
    return url;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const params = utmParams || getStoredUTMParams();

  if (Object.keys(params).length === 0) {
    return url;
  }

  const [baseUrl, existingQuery] = url.split("?");
  const searchParams = new URLSearchParams(existingQuery || "");

  // Add UTM parameters, avoiding duplicates
  Object.entries(params).forEach(([key, value]) => {
    if (!searchParams.has(key)) {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};
