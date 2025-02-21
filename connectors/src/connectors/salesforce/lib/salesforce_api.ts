import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Connection, QueryResult, Record } from "jsforce";
import jsforce from "jsforce";

import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";

type TestConnectionErrorCode = "INVALID_CREDENTIALS" | "UNKNOWN";

export class TestConnectionError extends Error {
  code: TestConnectionErrorCode;

  constructor(code: TestConnectionErrorCode, message: string) {
    super(message);
    this.name = "TestSalesforceConnectionError";
    this.code = code;
  }
}

const SALESFORCE_API_VERSION = "57.0";

/**
 * Get a Salesforce connection for the given connection ID.
 */
const getSalesforceConnection = async (connectionId: string) => {
  const { accessToken, instanceUrl } =
    await getSalesforceCredentials(connectionId);
  return new jsforce.Connection({
    instanceUrl,
    accessToken,
    version: SALESFORCE_API_VERSION,
  });
};

/**
 * Test the connection to Salesforce with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export async function testSalesforceConnection(
  connectionId: string
): Promise<Result<undefined, Error>> {
  const conn = await getSalesforceConnection(connectionId);

  try {
    const userInfo = await conn.identity();
    console.log("Successfully connected to Salesforce:", userInfo);
    return new Ok(undefined);
  } catch (err) {
    // TODO SF: Handle different error types.
    console.error("Connection failed:", err);
    return new Err(new Error("Connection failed"));
  }
}

/**
 * Get all objects from Salesforce.
 */
export async function getSalesforceObjects({
  connectionId,
  connection,
}: {
  connectionId: string;
  connection?: Connection;
}): Promise<Result<string[], Error>> {
  const conn = connection ?? (await getSalesforceConnection(connectionId));

  try {
    const tables = await conn.describeGlobal();
    console.log(
      "Available Salesforce objects:",
      tables.sobjects.map((obj) => obj.name)
    );
    return new Ok(tables.sobjects.map((obj) => obj.name));
  } catch (err) {
    console.error("Connection failed:", err);
    return new Err(new Error("Connection failed"));
  }
}

/**
 * Get all fields for a given object from Salesforce.
 */
export async function getSalesforceObjectFields({
  connectionId,
  objectName,
  connection,
}: {
  connectionId: string;
  objectName: string;
  connection?: Connection;
}): Promise<Result<string[], Error>> {
  const conn = connection ?? (await getSalesforceConnection(connectionId));

  const fields = await conn.describe(objectName);
  return new Ok(fields.fields.map((field) => field.name));
}

/**
 * Get all records for a given object from Salesforce.
 */
export async function getSalesforceObjectRecords({
  connectionId,
  objectName,
  connection,
}: {
  connectionId: string;
  objectName: string;
  connection?: Connection;
}): Promise<Result<QueryResult<Record>, Error>> {
  const conn = connection ?? (await getSalesforceConnection(connectionId));

  const records = await conn.query(
    `SELECT FIELDS(ALL) FROM ${objectName} LIMIT 10`
  );
  return new Ok(records);
}
