# Implementing Snowflake Key Pair Authentication in Dust

This document outlines a comprehensive implementation plan for adding Snowflake key pair authentication support to Dust. The changes span across multiple components of the system: front-end UI, credential management (OAuth), connector services, and the core query execution engine.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture Changes](#system-architecture-changes)
3. [Front-End Implementation](#front-end-implementation)
4. [OAuth Service Changes](#oauth-service-changes)
5. [Connector Service Changes](#connector-service-changes)
6. [Core Engine Updates](#core-engine-updates)
7. [Testing Strategy](#testing-strategy)
8. [Security Considerations](#security-considerations)
9. [Rollout Plan](#rollout-plan)

## Overview

### Current Authentication Method

Currently, Dust's Snowflake integration uses username/password authentication, which:
- Requires users to store and manage Snowflake credentials
- Transmits passwords during authentication
- Requires credential updates when passwords change
- Has limited security compared to key-based approaches

### Proposed Enhancement

We propose implementing Snowflake key pair authentication to:
- Improve security through asymmetric cryptography
- Eliminate password transmission and storage
- Support better automation and service account patterns
- Enable seamless credential rotation
- Align with modern security best practices

## System Architecture Changes

### High-Level Architecture

The changes will involve four main components:

1. **Front-End (UI)**: 
   - Add UI components for key pair generation and management
   - Modify the Snowflake connection form to support both authentication methods

2. **OAuth Service**: 
   - Enhance the credential storage model to support different authentication types
   - Implement secure private key storage
   - Add support for key rotation

3. **Connector Services**: 
   - Update connector creation and management to support key-based authentication
   - Modify connection testing logic
   - Update credential fetching logic

4. **Core Query Engine**: 
   - Add key pair authentication support in the Snowflake database connector
   - Update connection parameters and configuration

## Front-End Implementation

### File Changes

1. **`front/components/data_source/CreateOrUpdateConnectionSnowflakeModal.tsx`**:
   - Add authentication method selector (password vs key pair)
   - Create UI for generating or uploading key pairs
   - Implement key pair generation in the browser using Web Crypto API
   - Add fields for public/private key input or file upload
   - Support key rotation UI

2. **`front/types/index.ts`**:
   - Add new types for Snowflake key pair authentication:
   ```typescript
   export interface SnowflakeKeyPairCredentials {
     username: string;
     account: string;
     role: string;
     warehouse: string;
     privateKey: string;
     privateKeyPassphrase?: string;
     authenticator: "SNOWFLAKE_JWT";
   }
   
   export type SnowflakeCredentials = 
     | SnowflakePasswordCredentials 
     | SnowflakeKeyPairCredentials;
   
   export interface SnowflakePasswordCredentials {
     username: string;
     password: string;
     account: string;
     role: string;
     warehouse: string;
     authenticator?: "SNOWFLAKE";
   }
   ```

3. **`front/lib/connector_providers.ts`**:
   - Update Snowflake provider configuration to include key pair authentication options
   - Add helper functions for key pair generation and management

### UI Components

1. **Authentication Method Selector**:
   ```jsx
   <RadioGroup
     value={authMethod}
     onChange={setAuthMethod}
     label="Authentication Method"
   >
     <Radio value="password" label="Username & Password" />
     <Radio value="keypair" label="Key Pair Authentication (more secure)" />
   </RadioGroup>
   ```

2. **Key Pair Generation UI**:
   ```jsx
   {authMethod === 'keypair' && (
     <div className="space-y-4">
       <Tabs>
         <Tab label="Generate New Key Pair">
           <Button
             onClick={generateKeyPair}
             label="Generate 2048-bit RSA Key Pair"
             loading={isGenerating}
           />
           {generatedKeys && (
             <div className="mt-4 space-y-2">
               <div className="text-sm font-medium">Public Key (to register with Snowflake)</div>
               <TextArea
                 value={generatedKeys.publicKey}
                 readOnly
                 rows={5}
               />
               <div className="text-sm font-medium">Private Key (keep secure)</div>
               <TextArea
                 value={generatedKeys.privateKey}
                 readOnly
                 rows={5}
               />
               <Button
                 onClick={downloadPrivateKey}
                 label="Download Private Key"
                 variant="outline"
               />
             </div>
           )}
         </Tab>
         <Tab label="Upload Existing Key">
           <Input
             label="Private Key"
             type="file"
             accept=".p8,.pem"
             onChange={handlePrivateKeyUpload}
           />
           <div className="mt-2">
             <Input
               label="Private Key Passphrase (if encrypted)"
               type="password"
               value={privateKeyPassphrase}
               onChange={(e) => setPrivateKeyPassphrase(e.target.value)}
             />
           </div>
         </Tab>
       </Tabs>
     </div>
   )}
   ```

3. **Key Rotation UI** (for existing connections):
   ```jsx
   {isUpdatingConnection && authMethod === 'keypair' && (
     <div className="mt-4">
       <Checkbox
         label="Rotate Key (add new key while keeping the old one active)"
         checked={isRotatingKey}
         onChange={setIsRotatingKey}
       />
       {isRotatingKey && (
         <div className="mt-2">
           <Alert
             type="info"
             message="Key rotation will add a second key to your Snowflake user while keeping the existing key active. This enables a seamless transition."
           />
           {/* Key generation UI */}
         </div>
       )}
     </div>
   )}
   ```

### Client-Side Logic

1. **Key Pair Generation Function**:
   ```typescript
   async function generateKeyPair() {
     setIsGenerating(true);
     try {
       // Generate 2048-bit RSA key pair using Web Crypto API
       const keyPair = await window.crypto.subtle.generateKey(
         {
           name: "RSASSA-PKCS1-v1_5",
           modulusLength: 2048,
           publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
           hash: { name: "SHA-256" },
         },
         true, // extractable
         ["sign", "verify"]
       );
       
       // Export public key in SPKI format
       const publicKeyBuffer = await window.crypto.subtle.exportKey(
         "spki",
         keyPair.publicKey
       );
       
       // Export private key in PKCS8 format
       const privateKeyBuffer = await window.crypto.subtle.exportKey(
         "pkcs8",
         keyPair.privateKey
       );
       
       // Convert to base64 PEM format
       const publicKeyPem = convertToPem(publicKeyBuffer, "PUBLIC KEY");
       const privateKeyPem = convertToPem(privateKeyBuffer, "PRIVATE KEY");
       
       setGeneratedKeys({ publicKey: publicKeyPem, privateKey: privateKeyPem });
     } catch (error) {
       setError("Failed to generate key pair: " + error.message);
     } finally {
       setIsGenerating(false);
     }
   }
   
   function convertToPem(buffer: ArrayBuffer, label: string): string {
     const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
     const pemLines = [];
     for (let i = 0; i < base64.length; i += 64) {
       pemLines.push(base64.substring(i, i + 64));
     }
     return `-----BEGIN ${label}-----\n${pemLines.join('\n')}\n-----END ${label}-----`;
   }
   ```

2. **Form Handling Logic**:
   ```typescript
   function handleSubmit() {
     const commonCredentials = {
       username: credentials.username,
       account: credentials.account,
       role: credentials.role,
       warehouse: credentials.warehouse,
     };
     
     let snowflakeCredentials;
     if (authMethod === 'password') {
       snowflakeCredentials = {
         ...commonCredentials,
         password: credentials.password,
         authenticator: "SNOWFLAKE",
       };
     } else {
       snowflakeCredentials = {
         ...commonCredentials,
         privateKey: privateKey,
         privateKeyPassphrase: privateKeyPassphrase || undefined,
         authenticator: "SNOWFLAKE_JWT",
       };
     }
     
     // Submit credentials to OAuth service
     submitCredentials(snowflakeCredentials);
   }
   ```

## OAuth Service Changes

### Model Updates

1. **`front/lib/oauth/credential.ts`**:
   - Update credential model to support different authentication types
   - Add fields for key pair authentication
   
   ```typescript
   export interface SnowflakeOAuthState {
     type: 'snowflake';
     authType: 'password' | 'keypair';
     credentials: SnowflakeCredentials;
   }
   
   // Add validation function for different credential types
   export function validateSnowflakeCredentials(credentials: any): boolean {
     const common = credentials.username && credentials.account && 
                   credentials.role && credentials.warehouse;
     
     if (!common) return false;
     
     if (credentials.authenticator === 'SNOWFLAKE_JWT') {
       return !!credentials.privateKey;
     } else {
       return !!credentials.password;
     }
   }
   ```

2. **Security Considerations**:
   - Enhance encryption for private keys storage
   - Implement secure key storage patterns
   
   ```typescript
   // Enhanced encryption function for sensitive key material
   async function encryptPrivateKey(key: string, 
                                   workspaceId: string): Promise<string> {
     // Use workspace-specific encryption key with KMS
     const kmsKey = await getWorkspaceKMSKey(workspaceId);
     return encryptWithKMS(key, kmsKey);
   }
   ```

3. **API Endpoints**:
   - Update `/api/w/[wId]/credentials` endpoint to handle key-based authentication
   - Add validation for key pair format

### Connection Testing

1. **`front/lib/oauth/store.ts`**:
   - Update connection testing to support key pair authentication
   - Implement JWT token generation for authentication testing

## Connector Service Changes

### Authentication Logic

1. **`connectors/src/types/oauth/lib.ts`**:
   - Update Snowflake credential types to support key pairs
   
   ```typescript
   export interface SnowflakeCredentials {
     username: string;
     account: string;
     role: string;
     warehouse: string;
     password?: string; // Optional if using key pair
     privateKey?: string; // For key pair auth
     privateKeyPassphrase?: string; // Optional for encrypted keys
     authenticator?: "SNOWFLAKE" | "SNOWFLAKE_JWT";
   }
   
   export function isSnowflakeCredentials(obj: any): 
       obj is SnowflakeCredentials {
     return (
       obj.username &&
       obj.account &&
       obj.role &&
       obj.warehouse &&
       (obj.password || (obj.privateKey && obj.authenticator === "SNOWFLAKE_JWT"))
     );
   }
   ```

2. **`connectors/src/connectors/snowflake/lib/snowflake_api.ts`**:
   - Update the `testConnection` function to support key pair authentication
   - Modify connection creation to use appropriate authentication method
   
   ```typescript
   export async function connectToSnowflake(
     credentials: SnowflakeCredentials
   ): Promise<Result<Connection, Error>> {
     snowflake.configure({
       logLevel: "OFF",
     });
     
     try {
       const connectionOptions: any = {
         account: credentials.account,
         username: credentials.username,
         role: credentials.role,
         warehouse: credentials.warehouse,
         
         // Use proxy if defined
         proxyHost: process.env.PROXY_HOST,
         proxyPort: process.env.PROXY_PORT
           ? parseInt(process.env.PROXY_PORT)
           : undefined,
         proxyUser: process.env.PROXY_USER_NAME,
         proxyPassword: process.env.PROXY_USER_PASSWORD,
       };
       
       // Add authentication method based on credentials
       if (credentials.authenticator === "SNOWFLAKE_JWT" && credentials.privateKey) {
         connectionOptions.authenticator = "SNOWFLAKE_JWT";
         connectionOptions.privateKey = credentials.privateKey;
         if (credentials.privateKeyPassphrase) {
           connectionOptions.privateKeyPass = credentials.privateKeyPassphrase;
         }
       } else {
         connectionOptions.password = credentials.password;
       }
       
       const connection = await new Promise<Connection>((resolve, reject) => {
         snowflake
           .createConnection(connectionOptions)
           .connect((err: SnowflakeError | undefined, conn: Connection) => {
             if (err) {
               reject(err);
             } else {
               resolve(conn);
             }
           });
       });
       
       return new Ok(connection);
     } catch (error) {
       return new Err(
         error instanceof Error ? error : new Error(String(error))
       );
     }
   }
   ```

3. **`connectors/src/connectors/snowflake/index.ts`**:
   - Update connector manager to support both authentication methods
   - Ensure compatibility with existing password-based connectors

### Temporal Workflows

1. **`connectors/src/connectors/snowflake/temporal/workflows.ts`**:
   - Update workflow to handle key pair authentication
   - Ensure connection retry logic works with both auth methods

## Core Engine Updates

### Rust Implementation

1. **`core/src/databases/remote_databases/snowflake.rs`**:
   - Add key pair authentication support in the Snowflake database connector
   
   ```rust
   // Add new authentication method enum
   enum SnowflakeAuthMethod {
       Password(String),
       KeyPair {
           private_key: String,
           passphrase: Option<String>,
       },
   }
   
   // Update credentials struct
   #[derive(Deserialize)]
   struct SnowflakeConnectionDetails {
       username: String,
       account: String,
       role: String,
       warehouse: String,
       #[serde(default)]
       password: Option<String>,
       #[serde(default)]
       private_key: Option<String>,
       #[serde(default)]
       private_key_passphrase: Option<String>,
       #[serde(default)]
       authenticator: Option<String>,
   }
   ```

2. **Authentication Logic**:
   ```rust
   impl SnowflakeRemoteDatabase {
       pub fn new(
           credentials: serde_json::Map<String, serde_json::Value>,
       ) -> Result<Self, QueryDatabaseError> {
           let connection_details: SnowflakeConnectionDetails =
               serde_json::from_value(serde_json::Value::Object(credentials)).map_err(|e| {
                   QueryDatabaseError::GenericError(anyhow!("Error deserializing credentials: {}", e))
               })?;
           
           // Determine authentication method
           let auth_method = if connection_details.authenticator == Some("SNOWFLAKE_JWT".to_string()) {
               if let Some(private_key) = connection_details.private_key {
                   SnowflakeAuthMethod::KeyPair {
                       private_key,
                       passphrase: connection_details.private_key_passphrase,
                   }
               } else {
                   return Err(QueryDatabaseError::GenericError(
                       anyhow!("Key pair authentication selected but no private key provided")
                   ));
               }
           } else {
               if let Some(password) = connection_details.password {
                   SnowflakeAuthMethod::Password(password)
               } else {
                   return Err(QueryDatabaseError::GenericError(
                       anyhow!("No authentication credentials provided")
                   ));
               }
           };
           
           let mut client = match auth_method {
               SnowflakeAuthMethod::Password(password) => {
                   SnowflakeClient::new(
                       &connection_details.username,
                       snowflake_connector_rs::SnowflakeAuthMethod::Password(password),
                       SnowflakeClientConfig {
                           warehouse: Some(connection_details.warehouse.clone()),
                           account: connection_details.account,
                           role: Some(connection_details.role),
                           database: None,
                           schema: None,
                           timeout: Some(std::time::Duration::from_secs(30)),
                       },
                   )
               },
               SnowflakeAuthMethod::KeyPair { private_key, passphrase } => {
                   SnowflakeClient::new(
                       &connection_details.username,
                       snowflake_connector_rs::SnowflakeAuthMethod::KeyPair {
                           private_key,
                           passphrase,
                       },
                       SnowflakeClientConfig {
                           warehouse: Some(connection_details.warehouse.clone()),
                           account: connection_details.account,
                           role: Some(connection_details.role),
                           database: None,
                           schema: None,
                           timeout: Some(std::time::Duration::from_secs(30)),
                       },
                   )
               }
           }.map_err(|e| {
               QueryDatabaseError::GenericError(anyhow!("Error creating Snowflake client: {}", e))
           })?;
   
           // Proxy configuration remains the same
           if let (Ok(proxy_host), Ok(proxy_port), Ok(proxy_user_name), Ok(proxy_user_password)) = (
               env::var("PROXY_HOST"),
               env::var("PROXY_PORT"),
               env::var("PROXY_USER_NAME"),
               env::var("PROXY_USER_PASSWORD"),
           ) {
               let proxy_port = proxy_port.parse::<u16>().map_err(|e| {
                   QueryDatabaseError::GenericError(anyhow!("Error parsing proxy port: {}", e))
               })?;
               client = client
                   .with_proxy(
                       &proxy_host,
                       proxy_port,
                       &proxy_user_name,
                       &proxy_user_password,
                   )
                   .map_err(|e| {
                       QueryDatabaseError::GenericError(anyhow!("Error setting proxy: {}", e))
                   })?;
           }
   
           Ok(Self {
               client,
               warehouse: connection_details.warehouse,
           })
       }
   }
   ```

3. **Update Snowflake Connector Dependency**:
   - Update `snowflake-connector-rs` dependency to a version that supports key pair authentication
   - Ensure it supports proper JWT token generation

   ```toml
   # In Cargo.toml
   [dependencies]
   snowflake-connector-rs = { version = "0.5.0", features = ["key-pair-auth"] }
   ```

## Testing Strategy

### Unit Tests

1. **Front-end Component Tests**:
   - Test UI rendering of both authentication methods
   - Test key pair generation
   - Test form validation with different credentials

2. **OAuth Service Tests**:
   - Test credential validation for both auth methods
   - Test secure storage and retrieval of private keys
   - Test encryption/decryption of sensitive material

3. **Connector Tests**:
   - Test connection creation with both auth methods
   - Test error handling for invalid credentials
   - Test key rotation scenarios

4. **Core Engine Tests**:
   - Test Snowflake connection with both auth methods
   - Test query execution with key pair auth
   - Test connection pooling with JWT auth

### Integration Tests

1. **End-to-end Workflow Tests**:
   - Test complete workflow from UI to query execution
   - Test connector creation and management
   - Test credential rotation

2. **Connection Reliability Tests**:
   - Test connection resilience with key pair auth
   - Test token refresh scenarios
   - Test error handling and retry logic

3. **Performance Tests**:
   - Compare performance between password and key pair auth
   - Test connection establishment time
   - Test query execution performance

## Security Considerations

1. **Private Key Protection**:
   - Implement secure storage for private keys
   - Use envelope encryption with workspace-specific keys
   - Avoid logging or exposing private keys in error messages

2. **Key Rotation Support**:
   - Support Snowflake's dual-key approach for seamless rotation
   - Implement UI and backend logic for key rotation
   - Support tracking key age and suggesting rotation

3. **Audit Trail**:
   - Add logging for key pair operations
   - Track key fingerprints for auditing
   - Log authentication method used for connections

4. **Compliance Requirements**:
   - Document compliance benefits of key pair auth
   - Ensure implementation meets regulatory requirements
   - Support for key strength requirements

## Rollout Plan

### Phase 1: Development

1. Implement core functionality:
   - Front-end UI components for key pair management
   - OAuth service enhancements
   - Connector service updates
   - Core engine modifications

2. Add comprehensive tests:
   - Unit tests for all components
   - Integration tests for E2E workflows
   - Security and performance tests

### Phase 2: Beta Testing

1. Enable the feature for a limited set of users:
   - Add feature flag for key pair authentication
   - Collect feedback from initial users
   - Monitor error rates and performance

2. Document the functionality:
   - Update user documentation
   - Create tutorial for key pair setup
   - Add troubleshooting guides

### Phase 3: General Availability

1. Remove feature flag:
   - Make key pair authentication available to all users
   - Promote as recommended authentication method
   - Support both auth methods for backward compatibility

2. Consider future enhancements:
   - Automated key rotation reminders
   - Hardware security module (HSM) support
   - Enhanced admin controls for key management

## Conclusion

Implementing Snowflake key pair authentication will significantly enhance the security of Dust's Snowflake integration. While it requires changes across multiple parts of the codebase, the benefits in terms of security, automation support, and credential management make this a worthwhile investment. The implementation plan outlined above provides a comprehensive approach that maintains backward compatibility while enabling this more secure authentication method.