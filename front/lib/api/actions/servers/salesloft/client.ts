import type {
  SalesloftApiResponse,
  SalesloftSingleItemResponse,
} from "@app/lib/api/actions/servers/salesloft/types";
import logger from "@app/logger/logger";

const SALESLOFT_API_BASE_URL = "https://api.salesloft.com/v2";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
async function handleSalesloftError(
  response: Response,
  errorText: string
): Promise<never> {
  let errorMessage = `Salesloft API error: ${response.status} ${response.statusText}`;

  if (errorText) {
    try {
      const errorData = JSON.parse(errorText);

      if (response.status === 422 && errorData.errors) {
        const fieldErrors = Object.entries(errorData.errors)
          .map(
            ([field, errors]) =>
              `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`
          )
          .join("; ");
        errorMessage += ` - ${fieldErrors}`;
      } else if (errorData.error) {
        errorMessage += ` - ${errorData.error}`;
      } else if (errorData.message) {
        errorMessage += ` - ${errorData.message}`;
      } else {
        errorMessage += ` - ${errorText.substring(0, 200)}`;
      }
    } catch {
      errorMessage += ` - ${errorText.substring(0, 200)}`;
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Authentication failed: ${errorMessage}. Please verify your bearer token is valid.`
    );
  }

  throw new Error(errorMessage);
}

export async function makeSalesloftRequest<T>(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<SalesloftApiResponse<T>> {
  const url = new URL(`${SALESLOFT_API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    await handleSalesloftError(response, errorText);
  }

  const jsonResponse = await response.json();

  if (!jsonResponse || typeof jsonResponse !== "object") {
    throw new Error("Invalid response format from Salesloft API");
  }

  return jsonResponse;
}

export async function makeSalesloftSingleItemRequest<T>(
  accessToken: string,
  endpoint: string
): Promise<SalesloftSingleItemResponse<T>> {
  const url = new URL(`${SALESLOFT_API_BASE_URL}${endpoint}`);

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    await handleSalesloftError(response, errorText);
  }

  const jsonResponse = await response.json();

  if (!jsonResponse || typeof jsonResponse !== "object") {
    throw new Error("Invalid response format from Salesloft API");
  }

  return jsonResponse;
}

export async function getAllPages<T>(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<T[]> {
  const allResults: T[] = [];
  let currentPage = 1;
  const perPage = 100;
  let hasMorePages = true;
  const maxPages = 5;
  let pagesFetched = 0;

  while (hasMorePages && pagesFetched < maxPages) {
    const response = await makeSalesloftRequest<T>(accessToken, endpoint, {
      ...params,
      page: currentPage,
      per_page: perPage,
    });

    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(
        {
          endpoint,
          currentPage,
          response: response,
        },
        "Response missing data array, stopping pagination"
      );
      break;
    }

    allResults.push(...response.data);

    if (
      !response.metadata?.paging ||
      !response.metadata.paging.next_page ||
      response.data.length < perPage
    ) {
      hasMorePages = false;
    } else {
      currentPage++;
      pagesFetched++;
    }
  }

  if (pagesFetched >= maxPages) {
    logger.warn(
      {
        endpoint,
        totalResults: allResults.length,
      },
      "Reached maximum page limit, stopping pagination"
    );
  }

  return allResults;
}
