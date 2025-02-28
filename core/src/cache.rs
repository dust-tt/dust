use anyhow::Result;
use lazy_static::lazy_static;
use redis::{AsyncCommands, Client as RedisClient, RedisError};
use std::{env, sync::Arc};
use tracing::error;

// Define a static Redis client with lazy initialization
lazy_static! {
    pub static ref REDIS_CLIENT: Option<Arc<RedisClient>> = {
        match env::var("REDIS_CACHE_URI") {
            Ok(redis_url) => match RedisClient::open(redis_url) {
                Ok(client) => Some(Arc::new(client)),
                Err(e) => {
                    error!("Failed to connect to Redis: {}. Continuing without Redis cache.", e);
                    None
                }
            },
            Err(_) => None, // Redis URL not configured
        }
    };
}

/// Gets a value from Redis cache
pub async fn get<T: for<'de> serde::de::Deserialize<'de>>(key: &str) -> Result<Option<T>> {
    if let Some(client) = &*REDIS_CLIENT {
        match client.get_async_connection().await {
            Ok(mut conn) => {
                // Try to get the cached description
                let cached_result: Result<Option<String>, RedisError> = conn.get(key).await;

                if let Ok(Some(cached_json)) = cached_result {
                    // Parse the cached JSON string back to type T
                    match serde_json::from_str(&cached_json) {
                        Ok(parsed_value) => {
                            return Ok(Some(parsed_value));
                        }
                        Err(e) => {
                            error!("Error parsing cached Redis value: {}. Cache miss.", e);
                            return Ok(None);
                        }
                    }
                }
            }
            Err(e) => {
                error!("Error connecting to Redis: {}.", e);
            }
        }
    }

    Ok(None) // Redis unavailable or cache miss
}

/// Sets a value in Redis cache with a TTL
pub async fn set<T: serde::Serialize>(key: &str, value: &T, ttl_seconds: u64) -> Result<()> {
    if let Some(client) = &*REDIS_CLIENT {
        match client.get_async_connection().await {
            Ok(mut conn) => {
                // Convert value to JSON string for Redis storage
                if let Ok(json_string) = serde_json::to_string(value) {
                    // Use set_ex to set with expiration
                    let set_result: Result<(), RedisError> =
                        conn.set_ex(key, json_string, ttl_seconds).await;

                    if let Err(e) = set_result {
                        error!("Failed to store in Redis: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("Failed to cache in Redis: {}", e);
            }
        }
    }

    Ok(())
}
