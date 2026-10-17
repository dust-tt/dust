use anyhow::{ensure, Context, Result};
use clap::Parser;
use dust::{
    data_sources::{
        data_source::DataSourceConfig,
        qdrant::{QdrantClients, QdrantCluster, QdrantTenant},
    },
    stores::{postgres::PostgresStore, store::Store},
    utils,
};
use serde_json::Value;
use std::{collections::BTreeMap, env};
use tokio_postgres::Client;

#[derive(Debug, Parser)]
#[command(about = "Backfill Qdrant shard keys from collection layouts without changing routing")]
struct Args {
    #[arg(
        long,
        help = "Write validated mappings; otherwise only report planned changes"
    )]
    execute: bool,

    #[arg(long, default_value_t = 100, value_parser = clap::value_parser!(i64).range(1..=1000))]
    batch_size: i64,

    #[arg(
        long,
        default_value_t = 0,
        help = "Resume after this data_sources row ID"
    )]
    start_after: i64,
}

struct Backfill {
    id: i64,
    internal_id: String,
    original_config: String,
    updated_config: String,
}

fn config_with_shard_keys(
    config_json: &str,
    shard_keys: &BTreeMap<QdrantCluster, String>,
) -> Result<String> {
    let mut config: Value = serde_json::from_str(config_json)?;
    let qdrant_config = config
        .get_mut("qdrant_config")
        .and_then(Value::as_object_mut)
        .context("Expected a qdrant_config object")?;
    qdrant_config.insert("shard_keys".to_string(), serde_json::to_value(shard_keys)?);
    Ok(serde_json::to_string(&config)?)
}

fn validate_shard_key(key: &str, keys: &[String]) -> Result<()> {
    ensure!(
        keys.iter().any(|candidate| candidate == key),
        "Assigned shard key {key} is absent from the collection; manual investigation required"
    );
    Ok(())
}

fn validate_routing(key: &str, legacy_key: &str) -> Result<()> {
    ensure!(
        key == legacy_key,
        "Assignment {key} differs from legacy route {legacy_key}; manual investigation required"
    );
    Ok(())
}

async fn plan_backfill(
    id: i64,
    internal_id: String,
    config_json: String,
    clients: &QdrantClients,
) -> Result<Option<Backfill>> {
    let config: DataSourceConfig = serde_json::from_str(&config_json)?;
    let mut shard_keys = config.qdrant_config.shard_keys.clone();
    let tenant = QdrantTenant {
        internal_id: &internal_id,
        shard_keys: &config.qdrant_config.shard_keys,
    };
    for cluster in [
        Some(config.qdrant_config.cluster),
        config.qdrant_config.shadow_write_cluster,
    ]
    .into_iter()
    .flatten()
    {
        if shard_keys.contains_key(&cluster) {
            continue;
        }
        let client = clients.client(cluster);
        let key = client
            .assign_shard_key(&config.embedder_config.embedder, &internal_id)
            .await?
            .context("Cannot assign a shard key when sharding is disabled")?;
        validate_routing(&key, &client.shard_key_name(&tenant)?)
            .with_context(|| format!("cluster={cluster}"))?;
        for embedder in [
            Some(&config.embedder_config.embedder),
            config.embedder_config.shadow_embedder.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            let keys = client.shard_key_names(embedder).await?;
            validate_shard_key(&key, &keys).with_context(|| {
                format!(
                    "cluster={cluster} collection={}",
                    client.collection_name(embedder)
                )
            })?;
        }
        utils::info(&format!(
            "Planned mapping: id={id} cluster={cluster} key={key}"
        ));
        shard_keys.insert(cluster, key);
    }
    if shard_keys == config.qdrant_config.shard_keys {
        return Ok(None);
    }
    Ok(Some(Backfill {
        id,
        internal_id,
        updated_config: config_with_shard_keys(&config_json, &shard_keys)?,
        original_config: config_json,
    }))
}

async fn apply_batch(client: &mut Client, updates: &[Backfill]) -> Result<()> {
    let ids: Vec<_> = updates.iter().map(|update| update.id).collect();
    let internal_ids: Vec<_> = updates.iter().map(|update| &update.internal_id).collect();
    let originals: Vec<_> = updates
        .iter()
        .map(|update| &update.original_config)
        .collect();
    let configs: Vec<_> = updates
        .iter()
        .map(|update| &update.updated_config)
        .collect();
    let transaction = client.transaction().await?;
    let count = transaction
        .execute(
            "UPDATE data_sources AS ds SET config_json = changes.updated_config \
             FROM UNNEST($1::bigint[], $2::text[], $3::text[], $4::text[]) \
                 AS changes(id, internal_id, original_config, updated_config) \
             WHERE ds.id = changes.id AND ds.internal_id = changes.internal_id \
                 AND ds.config_json = changes.original_config",
            &[&ids, &internal_ids, &originals, &configs],
        )
        .await?;
    if count != updates.len() as u64 {
        transaction.rollback().await?;
        anyhow::bail!(
            "Concurrent change detected: expected {} updates, matched {count}; batch rolled back",
            updates.len()
        );
    }
    transaction.commit().await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    ensure!(
        env::var("QDRANT_USE_SHARDING")
            .map(|value| value.to_lowercase() != "false")
            .unwrap_or(true),
        "Cannot backfill shard keys when QDRANT_USE_SHARDING=false"
    );
    let cell = env::var("CELL").context("CELL is required")?;
    utils::info(&format!("cell={cell} execute={}", args.execute));
    let store = PostgresStore::new(
        &env::var("CORE_DATABASE_URI").context("CORE_DATABASE_URI is required")?,
    )
    .await?;
    let clients = QdrantClients::build().await?;
    let mut connection = store.raw_pool().get().await?;
    connection
        .batch_execute("SET statement_timeout = '30s'; SET lock_timeout = '2s'")
        .await?;
    if !args.execute {
        connection
            .batch_execute("SET default_transaction_read_only = on")
            .await?;
    }
    let last_id: i64 = connection
        .query_one("SELECT COALESCE(MAX(id), 0) FROM data_sources", &[])
        .await?
        .try_get(0)?;
    let mut cursor = args.start_after;
    let mut planned = 0;
    while cursor < last_id {
        let rows = connection
            .query(
                "SELECT id, internal_id, config_json FROM data_sources \
                 WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3",
                &[&cursor, &last_id, &args.batch_size],
            )
            .await?;
        if rows.is_empty() {
            break;
        }
        let mut updates = Vec::new();
        let mut batch_end = cursor;
        for row in rows {
            let id = row.try_get("id")?;
            if let Some(update) = plan_backfill(
                id,
                row.try_get("internal_id")?,
                row.try_get("config_json")?,
                &clients,
            )
            .await
            .with_context(|| format!("data_source id={id}; resume with --start-after {cursor}"))?
            {
                updates.push(update);
            }
            batch_end = id;
        }
        if args.execute && !updates.is_empty() {
            apply_batch(&mut connection, &updates)
                .await
                .with_context(|| format!("Resume with --start-after {cursor}"))?;
        }
        planned += updates.len();
        cursor = batch_end;
        utils::info(&format!(
            "Batch complete: cursor={cursor} last_id={last_id} mappings={} execute={}",
            updates.len(),
            args.execute
        ));
    }
    utils::done(&format!(
        "cell={cell} sources={planned} execute={}",
        args.execute
    ));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preserves_unrelated_config_fields() -> Result<()> {
        let original = json!({
            "qdrant_config": {"cluster": "cluster-0", "shadow_write_cluster": null, "future": true},
            "embedder_config": {"future": "preserved"},
            "extras": {"custom": [1, 2]},
            "unknown": "preserved"
        });
        let keys = BTreeMap::from([(QdrantCluster::Cluster0, "key_14".to_string())]);
        let updated: Value =
            serde_json::from_str(&config_with_shard_keys(&original.to_string(), &keys)?)?;
        let mut expected = original;
        expected["qdrant_config"]["shard_keys"] = json!({"cluster-0": "key_14"});
        assert_eq!(updated, expected);
        Ok(())
    }

    #[test]
    fn rejects_missing_shard_keys() -> Result<()> {
        let keys = vec![
            "key_0".to_string(),
            "key_1".to_string(),
            "key_2".to_string(),
        ];
        assert!(validate_shard_key("key_14", &keys).is_err());
        assert!(validate_shard_key("key_14", &[]).is_err());
        validate_shard_key("key_2", &keys)?;
        Ok(())
    }

    #[test]
    fn rejects_changed_routing() -> Result<()> {
        assert!(validate_routing("key_2", "key_14").is_err());
        validate_routing("key_14", "key_14")?;
        Ok(())
    }

    #[test]
    fn defaults_to_dry_run_and_rejects_invalid_batch_sizes() -> Result<()> {
        assert!(!Args::try_parse_from(["backfill"])?.execute);
        assert!(Args::try_parse_from(["backfill", "--execute"])?.execute);
        assert!(Args::try_parse_from(["backfill", "--batch-size", "0"]).is_err());
        assert!(Args::try_parse_from(["backfill", "--batch-size", "1001"]).is_err());
        Ok(())
    }

    #[tokio::test]
    #[ignore = "Requires TEST_DATABASE_URI pointing to a local PostgreSQL database"]
    async fn commits_matching_batches_and_rolls_back_on_concurrent_changes() -> Result<()> {
        let (mut client, connection) =
            tokio_postgres::connect(&env::var("TEST_DATABASE_URI")?, tokio_postgres::NoTls).await?;
        let connection = tokio::spawn(connection);
        client
            .batch_execute(
                "CREATE TEMP TABLE data_sources (id bigint PRIMARY KEY, internal_id text, config_json text); \
                 INSERT INTO data_sources VALUES (1, 'first', '{}'), (2, 'second', '{}')",
            )
            .await?;
        let updates = vec![
            Backfill {
                id: 1,
                internal_id: "first".to_string(),
                original_config: "{}".to_string(),
                updated_config: "{\"backfilled\":true}".to_string(),
            },
            Backfill {
                id: 2,
                internal_id: "second".to_string(),
                original_config: "{}".to_string(),
                updated_config: "{\"backfilled\":true}".to_string(),
            },
        ];
        client
            .execute(
                "UPDATE data_sources SET config_json = '{\"changed\":true}' WHERE id = 2",
                &[],
            )
            .await?;
        assert!(apply_batch(&mut client, &updates).await.is_err());
        let rows = client
            .query("SELECT config_json FROM data_sources ORDER BY id", &[])
            .await?;
        assert_eq!(rows[0].try_get::<_, String>(0)?, "{}");
        assert_eq!(rows[1].try_get::<_, String>(0)?, "{\"changed\":true}");

        client
            .execute(
                "UPDATE data_sources SET config_json = '{}', internal_id = 'changed' WHERE id = 2",
                &[],
            )
            .await?;
        assert!(apply_batch(&mut client, &updates).await.is_err());
        let count: i64 = client
            .query_one(
                "SELECT COUNT(*) FROM data_sources WHERE config_json = '{}'",
                &[],
            )
            .await?
            .try_get(0)?;
        assert_eq!(count, 2);

        client
            .execute(
                "UPDATE data_sources SET internal_id = 'second' WHERE id = 2",
                &[],
            )
            .await?;
        apply_batch(&mut client, &updates).await?;
        let rows = client
            .query("SELECT config_json FROM data_sources ORDER BY id", &[])
            .await?;
        assert_eq!(rows.len(), 2);
        for row in rows {
            assert_eq!(row.try_get::<_, String>(0)?, "{\"backfilled\":true}");
        }

        client
            .batch_execute(
                "UPDATE data_sources SET config_json = '{}'; DELETE FROM data_sources WHERE id = 2",
            )
            .await?;
        assert!(apply_batch(&mut client, &updates).await.is_err());
        let config: String = client
            .query_one("SELECT config_json FROM data_sources WHERE id = 1", &[])
            .await?
            .try_get(0)?;
        assert_eq!(config, "{}");
        drop(client);
        connection.await??;
        Ok(())
    }
}
