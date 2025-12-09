use anyhow::{anyhow, Result};
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use dust::oauth::connection::{Connection, ConnectionProvider, ConnectionStatus};
use std::env;
use tokio_postgres::NoTls;

/// Migration to move slack connections with platform_actions use_case to the new slack_tools
/// provider, based on the token type.
///
/// The migration checks the decrypted access_token to determine if it's a user token (xoxp-*)
/// or a bot token (xoxb-*). Only user tokens are migrated to slack_tools.
///
/// Note: personal_actions connections are handled by the SQL migration
/// (20251208_slack_to_slack_tools_personal_actions.sql) since they should always have user tokens.
///
/// Environment variables:
/// - OAUTH_DATABASE_URI: PostgreSQL connection string for oauth database
/// - LIVE: Set to "true" to actually perform the migration (default: dry-run)

#[tokio::main]
async fn main() -> Result<()> {
    let db_uri = env::var("OAUTH_DATABASE_URI")
        .map_err(|_| anyhow!("OAUTH_DATABASE_URI environment variable is required"))?;

    let live = env::var("LIVE").map(|v| v == "true").unwrap_or(false);

    if live {
        println!("🔴 LIVE MODE - Changes will be applied to the database");
    } else {
        println!("🟡 DRY RUN MODE - No changes will be made (set LIVE=true to apply changes)");
    }

    let manager = PostgresConnectionManager::new_from_stringlike(&db_uri, NoTls)?;
    let pool = Pool::builder().max_size(4).build(manager).await?;

    let conn = pool.get().await?;

    // Query all slack connections with platform_actions use_case
    let rows = conn
        .query(
            "SELECT id, secret, created, status, metadata, redirect_uri,
                    encrypted_authorization_code, access_token_expiry,
                    encrypted_access_token, encrypted_refresh_token,
                    encrypted_raw_json, related_credential_id
             FROM connections
             WHERE provider = 'slack'
               AND metadata->>'use_case' = 'platform_actions'
             ORDER BY id",
            &[],
        )
        .await?;

    println!("\nFound {} connections to process\n", rows.len());

    let mut migrated_count = 0;
    let mut skipped_bot_token_count = 0;
    let mut skipped_no_token_count = 0;
    let mut error_count = 0;

    for row in rows {
        let id: i64 = row.get(0);
        let secret: String = row.get(1);
        let created: i64 = row.get(2);
        let status: String = row.get(3);
        let metadata: serde_json::Value = row.get(4);
        let redirect_uri: Option<String> = row.get(5);
        let encrypted_authorization_code: Option<Vec<u8>> = row.get(6);
        let access_token_expiry: Option<i64> = row.get(7);
        let encrypted_access_token: Option<Vec<u8>> = row.get(8);
        let encrypted_refresh_token: Option<Vec<u8>> = row.get(9);
        let encrypted_raw_json: Option<Vec<u8>> = row.get(10);
        let related_credential_id: Option<String> = row.get(11);

        let use_case = metadata
            .get("use_case")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let connection_id = Connection::connection_id_from_row_id_and_secret(id, &secret)?;

        // Create a Connection object to decrypt the access token
        let connection = Connection::new(
            connection_id.clone(),
            created as u64,
            ConnectionProvider::Slack,
            match status.as_str() {
                "pending" => ConnectionStatus::Pending,
                "finalized" => ConnectionStatus::Finalized,
                _ => {
                    println!(
                        "  ❌ Connection {} (id={}, use_case={}): Unknown status '{}'",
                        connection_id, id, use_case, status
                    );
                    error_count += 1;
                    continue;
                }
            },
            metadata.clone(),
            redirect_uri,
            encrypted_authorization_code,
            access_token_expiry.map(|e| e as u64),
            encrypted_access_token,
            encrypted_refresh_token,
            encrypted_raw_json,
            related_credential_id,
        );

        // Try to decrypt the access token
        let access_token = match connection.unseal_access_token() {
            Ok(Some(token)) => token,
            Ok(None) => {
                println!(
                    "  ⏭️  Connection {} (id={}, use_case={}): No access token (not finalized?)",
                    connection_id, id, use_case
                );
                skipped_no_token_count += 1;
                continue;
            }
            Err(e) => {
                println!(
                    "  ❌ Connection {} (id={}, use_case={}): Failed to decrypt token: {}",
                    connection_id, id, use_case, e
                );
                error_count += 1;
                continue;
            }
        };

        // Check token type based on prefix
        let token_prefix = if access_token.len() >= 5 {
            &access_token[..5]
        } else {
            &access_token[..]
        };

        if access_token.starts_with("xoxp-") {
            // User token - should be migrated to slack_tools
            if live {
                conn.execute(
                    "UPDATE connections SET provider = 'slack_tools' WHERE id = $1",
                    &[&id],
                )
                .await?;
                println!(
                    "  ✅ Connection {} (id={}, use_case={}): MIGRATED (token: {}...)",
                    connection_id, id, use_case, token_prefix
                );
            } else {
                println!(
                    "  ✅ Connection {} (id={}, use_case={}): WOULD MIGRATE (token: {}...)",
                    connection_id, id, use_case, token_prefix
                );
            }
            migrated_count += 1;
        } else if access_token.starts_with("xoxb-") {
            // Bot token - should stay on slack provider
            println!(
                "  ⏭️  Connection {} (id={}, use_case={}): SKIPPED - bot token (token: {}...)",
                connection_id, id, use_case, token_prefix
            );
            skipped_bot_token_count += 1;
        } else {
            // Unknown token type
            println!(
                "  ⚠️  Connection {} (id={}, use_case={}): Unknown token type (token: {}...)",
                connection_id, id, use_case, token_prefix
            );
            error_count += 1;
        }
    }

    println!("\n========================================");
    println!("Summary:");
    println!("========================================");
    if live {
        println!("  ✅ Migrated:          {}", migrated_count);
    } else {
        println!("  ✅ Would migrate:     {}", migrated_count);
    }
    println!("  ⏭️  Skipped (bot):     {}", skipped_bot_token_count);
    println!("  ⏭️  Skipped (no token): {}", skipped_no_token_count);
    println!("  ❌ Errors:            {}", error_count);
    println!("========================================");

    if !live && migrated_count > 0 {
        println!("\n💡 To apply these changes, run with LIVE=true");
    }

    Ok(())
}
