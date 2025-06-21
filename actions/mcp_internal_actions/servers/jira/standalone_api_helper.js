export const MAX_LIMIT = 50;

/**
 * Get a single JIRA ticket by its key
 * @param {string} baseUrl - The JIRA base URL (CloudID format)
 * @param {string} accessToken - OAuth access token
 * @param {string} ticketKey - The ticket key (e.g., "PROJ-123")
 * @returns {Promise<Object|null>}
 */
export const getTicket = async (baseUrl, accessToken, ticketKey) => {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${ticketKey}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = new Error(
        `Failed to fetch ticket ${baseUrl} ${ticketKey}: ${response.status} ${response.statusText}`
      );
      throw error;
    }

    const ticket = await response.json();
    return ticket;
  } catch (error) {
    console.error(`${baseUrl} Error fetching JIRA ticket ${ticketKey}:`, error);
    throw error;
  }
};

/**
 * Search JIRA tickets using JQL query
 * @param {string} baseUrl - The JIRA base URL (CloudID format)
 * @param {string} accessToken - OAuth access token
 * @param {string} [jql="*"] - JQL query string
 * @param {number} [startAt=0] - Starting index for pagination
 * @param {number} [maxResults=MAX_LIMIT] - Maximum results to return
 * @returns {Promise<Object>}
 */
export const searchTickets = async (
  baseUrl,
  accessToken,
  jql = '*',
  startAt = 0,
  maxResults = MAX_LIMIT
) => {
  try {
    const response = await fetch(
      `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = new Error(
        `Failed to search tickets: ${response.status} ${response.statusText}`
      );
      throw error;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error searching JIRA tickets:', error);
    throw error;
  }
};