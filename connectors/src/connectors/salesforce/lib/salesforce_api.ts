import type { SalesforceAPICredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Connection, QueryResult, Record } from "jsforce";
import jsforce from "jsforce";

const SF_API_VERSION = "57.0";

/**
 * Get a Salesforce connection for the given connection ID.
 */
export const getSalesforceConnection = async (
  credentials: SalesforceAPICredentials
): Promise<Result<Connection, Error>> => {
  const { accessToken, instanceUrl } = credentials;

  try {
    const conn = new jsforce.Connection({
      instanceUrl,
      accessToken,
      version: SF_API_VERSION,
    });
    await conn.identity();
    return new Ok(conn);
  } catch (err) {
    console.error("Connection failed:", err);
    return new Err(new Error("Connection failed"));
  }
};

/**
 * Test the connection to Salesforce with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export async function testSalesforceConnection(
  credentials: SalesforceAPICredentials
): Promise<Result<undefined, Error>> {
  const connRes = await getSalesforceConnection(credentials);
  if (connRes.isErr()) {
    return new Err(new Error("Connection failed"));
  }
  const conn = connRes.value;

  try {
    await conn.identity();
    return new Ok(undefined);
  } catch (err) {
    // TODO(salesforce): Handle different error types.
    console.error("Can't connect to Salesforce:", err);
    return new Err(new Error("Can't connect to Salesforce."));
  }
}

export async function runSOQL({
  credentials,
  soql,
  limit,
  offset,
  lastModifiedDateSmallerThan,
  lastModifiedDateOrder,
}: {
  credentials: SalesforceAPICredentials;
  soql: string;
  limit?: number;
  offset?: number;
  lastModifiedDateSmallerThan?: Date;
  lastModifiedDateOrder?: "ASC" | "DESC";
}): Promise<Result<QueryResult<Record>, Error>> {
  try {
    const connRes = await getSalesforceConnection(credentials);
    if (connRes.isErr()) {
      return new Err(new Error("Can't connect to Salesforce."));
    }

    if (lastModifiedDateSmallerThan) {
      if (soql.includes("WHERE")) {
        soql += ` AND LastModifiedDate < ${lastModifiedDateSmallerThan.toISOString()}`;
      } else {
        soql += ` WHERE LastModifiedDate < ${lastModifiedDateSmallerThan.toISOString()}`;
      }
    }

    if (lastModifiedDateOrder) {
      soql += ` ORDER BY LastModifiedDate ${lastModifiedDateOrder}`;
    }
    if (limit !== undefined) {
      // This will error if a limit is already present.
      soql += ` LIMIT ${limit}`;
    }
    if (offset !== undefined) {
      // This will error if an offset is already present.
      soql += ` OFFSET ${offset}`;
    }

    const result = await connRes.value.query(soql);
    return new Ok(result);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
