# Snowflake Integration in Dust

This document provides a comprehensive overview of how Dust integrates with Snowflake, explaining the authentication process, credential management, query execution, and security measures.

## Authentication and Access Granting

### User Authentication Process

1. **Credentials Collection**
   - Users provide Snowflake credentials through a UI form (`CreateOrUpdateConnectionSnowflakeModal.tsx`)
   - Required credentials include:
     - Account identifier (e.g., "au12345.us-east-1")
     - Role name (must have read-only permissions)
     - Warehouse name
     - Username
     - Password

2. **Read-Only Permission Verification**
   - The system enforces a read-only connection by checking the provided role's permissions
   - Specifically verifies that the role has:
     - Only SELECT privileges for tables and views
     - Only USAGE or READ privileges for other objects (schemas, databases, warehouses)
   - Recursive checks for inherited roles to ensure no write privileges exist

3. **Table Access Verification**
   - The system checks that at least one table is accessible with the provided credentials
   - System databases like "SNOWFLAKE" and "SNOWFLAKE_SAMPLE_DATA" are excluded
   - System schemas like "INFORMATION_SCHEMA" are excluded

## Credential Storage and Security

1. **Credential Submission**
   - Credentials are transmitted to `/api/w/[wId]/credentials` endpoint using HTTPS
   - The backend validates credentials before storage

2. **Secure Storage**
   - Credentials are stored through a secure OAuth service
   - A credential ID is generated that's used for subsequent API calls
   - The actual storage uses encryption to protect sensitive information

3. **Access Control**
   - Only workspace admins can create and manage credentials
   - Credentials are scoped to a specific workspace and user

4. **Proxy Support**
   - The system supports proxy configurations for network-level security
   - Proxy settings can be configured via environment variables:
     - `PROXY_HOST`
     - `PROXY_PORT`
     - `PROXY_USER_NAME`
     - `PROXY_USER_PASSWORD`

## Query Execution

1. **Query Authorization**
   - Before executing any query, the system:
     - Parses the query to verify it only accesses allowed tables
     - Checks for forbidden operations (UPDATE, DELETE, INSERT)
     - Analyzes the query plan to enforce these restrictions

2. **Connection Management**
   - Uses `snowflake-connector-rs` for Rust-based connections
   - Establishes a session with a 30-second timeout by default
   - Implements retries with exponential backoff for connection issues
   - Maximum of 3 retry attempts for establishing sessions

3. **Query Execution**
   - Results are fetched in chunks to avoid memory issues
   - Maximum result set is limited to 25,000 rows
   - Type conversions are handled to normalize data formats
   - Sessions are properly closed after use

4. **Error Handling**
   - Detailed error handling for various Snowflake-specific errors
   - Retries with exponential backoff for transient failures
   - Timeouts to prevent hanging operations

## Connector Management

1. **Connector Creation**
   - When creating a Snowflake connector, the system:
     - Validates the credentials
     - Tests the connection to verify read-only access
     - Creates a connector record
     - Launches a Temporal workflow for synchronization

2. **Permissions Management**
   - Administrators can select which databases, schemas, and tables to expose
   - The permissions model follows Snowflake's hierarchy: database > schema > table
   - Users can only see and query tables they've been granted access to

3. **Synchronization**
   - A Temporal workflow keeps the connector's metadata in sync
   - Workflows can be paused, resumed, and stopped
   - When credentials are updated, all tables are re-synchronized

## Security Measures

1. **Read-Only Enforcement**
   - Multiple layers of security ensure read-only access:
     - Role permission verification during setup
     - Query analysis before execution
     - Query plan inspection to prevent unauthorized operations

2. **Access Limitations**
   - System databases and schemas are excluded
   - Query results are limited to 25,000 rows maximum
   - Queries have execution timeouts

3. **Error Handling Precautions**
   - Error messages are carefully crafted to avoid leaking sensitive information
   - Connection failures are logged without exposing credentials

## Development Testing

1. **Connection Testing**
   - A comprehensive testing function (`testConnection`) verifies:
     - Valid credentials
     - Read-only permissions
     - Access to at least one table

2. **Query Validation**
   - Tests that queries only access allowed tables
   - Ensures no forbidden operations are present
   - Validates query execution and result handling

## Limitations

1. The current implementation uses username/password authentication only (no key pair-based authentication)
2. Query results are limited to 25,000 rows
3. Queries have a 30-second timeout by default
4. System databases and schemas are excluded
5. No write operations are permitted

## Conclusion

Dust's Snowflake integration is designed with security and efficiency in mind. It provides read-only access to Snowflake data through a well-designed authentication system, secure credential storage, and multi-layered permission checks. The query execution system ensures that users can only access authorized tables and perform allowed operations, making it suitable for safely integrating Snowflake data into Dust workflows.