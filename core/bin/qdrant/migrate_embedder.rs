use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use dust::{
    data_sources::{
        data_source::{
            make_document_id_hash, DataSource, EmbedderConfig, EmbedderDataSourceConfig,
            SearchFilter, TimestampFilter,
        },
        qdrant::QdrantClients,
    },
    providers::{
        embedder::{EmbedderRequest, EmbedderVector, SupportedEmbedderModels},
        provider::ProviderID,
    },
    run::Credentials,
    stores::{postgres, store::Store},
    utils,
};
use futures::StreamExt;
use futures::TryStreamExt;
use qdrant_client::{
    prelude::Payload,
    qdrant::{self, point_id, value, PointId},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs::File};
use std::{
    env,
    io::{self, BufRead, BufReader},
};
use tokio_stream::{self as stream};

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(arg_required_else_help = true)]
    #[command(about = "Show qdrant state for data source", long_about = None)]
    Show { data_source_internal_id: String },

    #[command(arg_required_else_help = true)]
    #[command(about = "Set `shadow_embedder_config`", long_about = None)]
    SetShadowEmbedder {
        data_source_internal_id: String,
        provider_id: ProviderID,
        model_id: SupportedEmbedderModels,
    },

    #[command(arg_required_else_help = true)]
    #[command(about = "Clear `shadow_write_embedder` \
                       (!!! deletes data_points from `shadow_embedder` collection)", long_about = None)]
    ClearShadowEmbedder { data_source_internal_id: String },

    #[command(arg_required_else_help = true)]
    #[command(about = "Migrate points from `embedder` collection to `shadow_embedder` collection", long_about = None)]
    MigrateShadowEmbedder { data_source_internal_id: String },

    #[command(arg_required_else_help = true)]
    #[command(about = "Switch `shadow_embedder` and `embedder` \
                       (!!! moves read traffic to `shadow_embedder`)", long_about = None)]
    CommitShadowEmbedder { data_source_internal_id: String },

    #[command(arg_required_else_help = true)]
    #[command(about = "Automatically migrate a data source to a new collection \
                       (!!! creates, shadow embedder, migrates, \
                        and deletes points from original collection)", long_about = None)]
    Migrate {
        data_source_internal_id: String,
        provider_id: ProviderID,
        model_id: SupportedEmbedderModels,
    },

    #[command(arg_required_else_help = true)]
    #[command(about = "Migrate a set of data sources from a JSONL file to a new collection \
                       (!!! creates, shadow embedder, migrates, \
                        and deletes points from original collection)", long_about = None)]
    MigrateFile {
        json_path: String,
        provider_id: ProviderID,
        model_id: SupportedEmbedderModels,
    },
}

async fn load_credentials_from_env() -> Credentials {
    // Retrieve the environment variables.
    let mistral_api_key =
        env::var("DUST_MANAGED_MISTRAL_API_KEY").expect("MISTRAL_API_KEY not set");
    let openai_api_key = env::var("DUST_MANAGED_OPENAI_API_KEY").expect("OPENAI_API_KEY not set");

    // Create the credentials HashMap.
    let credentials: Credentials = [
        ("MISTRAL_API_KEY".to_string(), mistral_api_key),
        ("OPENAI_API_KEY".to_string(), openai_api_key),
    ]
    .iter()
    .cloned()
    .collect();

    credentials
}

async fn show(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    utils::info(&format!(
        "Data source: \
            data_source_internal_id={} data_source_id={} cluster={} shadow_write_cluster={} embedder_config={} shadow_embedder_config={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster().to_string(),
        match ds.shadow_write_qdrant_cluster() {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        },
        ds.embedder_config(),
        match ds.shadow_embedder_config() {
          Some(sec) => sec.to_string(),
          None => "none".to_string()
        }
    ));

    let qdrant_client = ds.main_qdrant_client(&qdrant_clients);
    match qdrant_client
        .collection_info(&ds.embedder_config())
        .await?
        .result
    {
        Some(info) => {
            utils::info(&format!(
                "[MAIN] Qdrant collection: collection={} status={} points_count={:?} cluster={}",
                qdrant_client.collection_name(&ds.embedder_config()),
                info.status.to_string(),
                info.points_count,
                ds.main_qdrant_cluster().to_string(),
            ));
        }
        None => Err(anyhow!("Qdrant collection not found"))?,
    }

    match ds.shadow_embedder_config() {
        Some(shadow_embedder_config) => {
            match qdrant_client
                .collection_info(shadow_embedder_config)
                .await?
                .result
            {
                Some(info) => {
                    utils::info(&format!(
                        "[SHADOW] Qdrant collection: collection={} status={} \
                            points_count={:?} cluster={}",
                        match ds.shadow_embedder_config() {
                            Some(sec) => qdrant_client.collection_name(sec),
                            None => "none".to_string(),
                        },
                        info.status.to_string(),
                        info.points_count,
                        ds.main_qdrant_cluster().to_string(),
                    ));
                }
                None => Err(anyhow!("Qdrant collection not found"))?,
            }
        }
        None => (),
    };

    Ok(())
}

async fn set_shadow_embedder(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    provider_id: ProviderID,
    model_id: SupportedEmbedderModels,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    // /!\ Currently, migrating the embedder is not supported when double write is enabled.
    // Although the downstream code is capable of handling this situation, we have chosen
    // to disable migration in such cases to avoid potential issues or inconsistencies for now.
    match ds.shadow_write_qdrant_cluster() {
        Some(_) => Err(anyhow!(
            "Embedder migration aborted: Double write is currently enabled. \
            Please disable double write before proceeding."
        )),
        None => Ok(()),
    }?;

    let mut config = ds.config().clone();
    let qdrant_client = ds.main_qdrant_client(&qdrant_clients);

    let shadow_embedder_config = EmbedderConfig {
        model_id: model_id.to_string(),
        provider_id,
        splitter_id: ds.embedder_config().splitter_id,
        max_chunk_size: ds.embedder_config().max_chunk_size,
    };

    // Assert that collection for shadow embedder exists.
    match qdrant_client
        .collection_info(&shadow_embedder_config)
        .await?
        .result
    {
        Some(_) => Ok(()),
        None => Err(anyhow!(format!(
            "Qdrant collection {} not found for shadow embedder.",
            qdrant_client.collection_name(&shadow_embedder_config)
        ))),
    }?;

    // Set shadow embedder config.
    config.embedder_config = EmbedderDataSourceConfig {
        embedder: config.embedder_config.embedder,
        shadow_embedder: Some(shadow_embedder_config),
    };

    ds.update_config(store, &config).await?;

    utils::done(&format!(
        "Updated data source: \
            data_source_internal_id={} data_source_id={} cluster={} embedder_config={} shadow_embedder_config={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster().to_string(),
        ds.embedder_config(),
        match ds.shadow_embedder_config() {
            Some(sec) => sec.to_string(),
            None => "none".to_string(),
        }
    ));

    Ok(())
}

async fn clear_shadow_embedder(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    ask_confirmation: bool,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let shadow_embedder_config = match ds.shadow_embedder_config() {
        Some(sec) => sec,
        None => Err(anyhow!("No shadow embedder config to clear"))?,
    };

    let qdrant_client = ds.main_qdrant_client(&qdrant_clients);

    if ask_confirmation {
        // Ask for confirmation.
        match utils::confirm(&format!(
            "[DANGER] Are you sure you want to delete points \
                from cluster {} and collection {} for this data source? \
                (this is definitive)",
            ds.main_qdrant_cluster().to_string(),
            qdrant_client.collection_name(shadow_embedder_config),
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    // Delete all points on shadow_embedder_config collection for data source.
    // TODO: Add delete count in this function.
    qdrant_client
        .delete_all_points_for_internal_id(shadow_embedder_config, &ds.internal_id().to_string())
        .await?;

    utils::done(&format!(
        "Deleted all points for data source on collection {} in cluster {}.",
        qdrant_client.collection_name(shadow_embedder_config),
        ds.main_qdrant_cluster()
    ));

    // Remove shadow_embedder from config.
    let mut config = ds.config().clone();

    config.embedder_config = EmbedderDataSourceConfig {
        embedder: config.embedder_config.embedder,
        shadow_embedder: None,
    };

    ds.update_config(store, &config).await?;

    utils::done(&format!(
        "Updated data source: \
            data_source_internal_id={} data_source_id={} cluster={} embedder_config={} shadow_embedder_config={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster().to_string(),
        ds.embedder_config(),
        match ds.shadow_embedder_config() {
            Some(sec) => sec.to_string(),
            None => "none".to_string(),
        }
    ));

    Ok(())
}

fn get_qdrant_point_id_as_string(point_id: &PointId) -> Option<String> {
    match &point_id.point_id_options {
        Some(point_id::PointIdOptions::Uuid(id)) => Some(id.clone()),
        Some(point_id::PointIdOptions::Num(id)) => Some(id.to_string()),
        None => None,
    }
}

#[derive(Debug, Clone)]
struct ChunkInfoFromPoints {
    hash: String,
    text: String,
    payload: HashMap<String, qdrant_client::prelude::Value>,
}

async fn execute_embedder_with_retry(
    credentials: &Credentials,
    r: &EmbedderRequest,
) -> Result<Vec<EmbedderVector>, anyhow::Error> {
    let mut retry = 0;

    loop {
        match r.execute(credentials.clone()).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                if retry < 3 {
                    retry += 1;
                    utils::error(&format!(
                        "DataSource chunk embedding error: retry={} error={:?}",
                        retry, e
                    ));
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                } else {
                    return Err(e.into());
                }
            }
        }
    }
}

async fn migrate_shadow_embedder(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found."))?,
    };

    let points_per_request = match std::env::var("POINTS_PER_REQUEST") {
        Ok(v) => v.parse::<usize>()?,
        Err(_) => 256,
    };

    let qdrant_client = ds.main_qdrant_client(&qdrant_clients);

    let shadow_embedder_config = match ds.shadow_embedder_config() {
        Some(sec) => sec,
        None => Err(anyhow!(
            "Embedder migration aborted: No shadow embedder config set on the data source."
        ))?,
    };

    let credentials = load_credentials_from_env().await;

    // Delete all data points on shadow embedder collection.
    qdrant_client
        .delete_all_points_for_internal_id(shadow_embedder_config, &ds.internal_id().to_string())
        .await?;

    utils::info(&format!(
        "Migrating points: points_per_request={}",
        points_per_request
    ));

    let mut page_offset: Option<PointId> = None;
    let mut total: usize = 0;
    let mut retry: usize = 0;
    let mut iterations: usize = 0;

    loop {
        let now = utils::now();
        let scroll_results = match qdrant_client
            .scroll(
                &ds.embedder_config(),
                &ds.internal_id().to_string(),
                // TODO:(2024-05-31 flav) Remove unused parameter.
                None, // Tenant filter is injected by the client.
                Some(points_per_request as u32),
                page_offset.clone(),
                Some(true.into()),
            )
            .await
        {
            Ok(r) => r,
            Err(e) => {
                if retry < 3 {
                    retry += 1;
                    utils::error(&format!(
                        "Error migrating points (read): retry={} error={:?}",
                        retry, e
                    ));
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    continue;
                } else {
                    Err(e)?
                }
            }
        };

        let count = scroll_results.result.len();

        let points = scroll_results
            .result
            .into_iter()
            .map(|r| {
                qdrant::PointStruct::new(
                    r.id.unwrap(),
                    r.vectors.unwrap(),
                    Payload::new_from_hashmap(r.payload),
                )
            })
            .collect::<Vec<_>>();

        // Empty upserts trigger errors.
        if count > 0 {
            let chunks_with_hash: Vec<ChunkInfoFromPoints> = points
                .iter()
                .filter_map(|p| {
                    // Check if the "text" key exists in the payload.
                    // If it exists, create a ChunkInfoFromPoints.
                    match &p.id {
                        Some(pid) => {
                            match (get_qdrant_point_id_as_string(pid), p.payload.get("text")) {
                                (Some(id), Some(value)) => match &value.kind {
                                    Some(value::Kind::StringValue(s)) => {
                                        Some(ChunkInfoFromPoints {
                                            hash: id,
                                            text: s.clone(),
                                            payload: p.payload.clone(),
                                        })
                                    }
                                    _ => None,
                                },
                                // If it doesn't exist, filter out the point.
                                (_, _) => None,
                            }
                        }
                        None => None,
                    }
                })
                .collect();

            // Chunk splits into a vectors of 8 chunks (Vec<Vec<String>>).
            let chunk_batches = chunks_with_hash
                .chunks(8)
                .map(|chunk| chunk.to_vec())
                .collect::<Vec<_>>();

            let mut embeddings: HashMap<String, EmbedderVector> = HashMap::new();

            for chunk in chunk_batches {
                let r = EmbedderRequest::new(
                    shadow_embedder_config.provider_id.clone(),
                    &shadow_embedder_config.model_id.to_string(),
                    chunk.iter().map(|ci| ci.text.as_str()).collect::<Vec<_>>(),
                    ds.config().extras.clone(),
                );

                let v = execute_embedder_with_retry(&credentials, &r).await?;

                for (ci, v) in chunk.into_iter().zip(v.into_iter()) {
                    embeddings.insert(ci.hash.clone(), v);
                }
            }

            utils::info(&format!(
                "Finished embedding chunks for data_source={} chunk_count={} total={} latency_ms={}",
                data_source_internal_id,
                count,
                total,
                utils::now() - now
            ));

            let points_to_upsert = chunks_with_hash
                .iter()
                .map(|ci| match embeddings.get(&ci.hash) {
                    Some(v) => {
                        let payload = Payload::new_from_hashmap(ci.payload.clone());

                        let ps = qdrant::PointStruct::new(
                            ci.hash.to_string(),
                            v.vector.iter().map(|v| *v as f32).collect::<Vec<f32>>(),
                            payload,
                        );

                        Ok(ps)
                    }
                    None => Err(anyhow!("DataSource embedding error: Missin chunk")),
                })
                .collect::<Result<Vec<_>>>()?;

            match qdrant_client
                .upsert_points(
                    &shadow_embedder_config,
                    &ds.internal_id().to_string(),
                    points_to_upsert,
                )
                .await
            {
                Ok(_) => (),
                Err(e) => {
                    if retry < 3 {
                        retry += 1;
                        utils::error(&format!(
                            "Error migrating points (write): retry={} error={:?}",
                            retry, e
                        ));
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        continue;
                    } else {
                        Err(e)?
                    }
                }
            }
        }

        total += count;

        if iterations % 8 == 0 {
            utils::info(&format!(
                "Migrated points: count={} total={} latency_ms={}",
                count,
                total,
                utils::now() - now
            ));
        }

        page_offset = scroll_results.next_page_offset;
        if page_offset.is_none() {
            break;
        }
        retry = 0;
        iterations += 1;
    }

    utils::info(&format!("Done migrating: total={}", total));
    Ok(())
}

async fn commit_shadow_embedder(
    store: Box<dyn Store + Sync + Send>,
    data_source_internal_id: String,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let mut config = ds.config().clone();

    // Switch embedder and shadow embedder.
    config.embedder_config = match config.embedder_config.shadow_embedder {
        Some(shadow_embedder) => EmbedderDataSourceConfig {
            embedder: shadow_embedder.clone(),
            shadow_embedder: Some(config.embedder_config.embedder),
        },
        None => Err(anyhow!("No shadow embedder to commit"))?,
    };

    ds.update_config(store, &config).await?;

    utils::info(&format!(
        "Updated data source: \
            data_source_internal_id={}  data_source_id={} cluster={} embedder_config={} shadow_embedder_config={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster().to_string(),
        ds.embedder_config(),
        match ds.shadow_embedder_config() {
            Some(sec) => sec.to_string(),
            None => "none".to_string(),
        }
    ));
    Ok(())
}

async fn refresh_chunk_count_for_updated_documents(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: &QdrantClients,
    ds: &DataSource,
    from_timestamp: u64,
) -> Result<()> {
    let now = utils::now();

    let filter = SearchFilter {
        timestamp: Some(TimestampFilter {
            gt: Some(from_timestamp as i64),
            lt: Some(now as i64),
        }),
        tags: None,
        parents: None,
    };

    let mut offset = 0;
    let batch_size = 50;
    let mut total = 0;
    let qdrant_client = ds.main_qdrant_client(qdrant_clients);

    loop {
        // Fetch document IDs to update.
        let (doc_ids, _) = store
            .find_data_source_document_ids(
                ds.project(),
                ds.data_source_id(),
                &Some(filter.clone()),
                Some((batch_size, offset)),
            )
            .await?;

        // If no more documents are returned, break the loop.
        if doc_ids.is_empty() {
            break;
        }

        // Process the chunk count for those document IDs.
        for doc_id in doc_ids.clone() {
            let f = qdrant::Filter {
                must: vec![qdrant::Condition::matches(
                    "document_id_hash",
                    make_document_id_hash(&doc_id),
                )],
                ..Default::default()
            };

            let count_res = qdrant_client
                .count_points(
                    ds.embedder_config(),
                    &ds.internal_id().to_string(),
                    Some(f),
                    true, /* exact count */
                )
                .await?;

            if let Some(chunk_count) = count_res.result {
                store
                    .update_data_source_document_chunk_count(
                        ds.project(),
                        ds.data_source_id(),
                        &doc_id,
                        chunk_count.count,
                    )
                    .await?;
            }
        }

        offset += batch_size;
        total += doc_ids.len();
    }

    utils::info(&format!(
        "Refreshed chunk count for data source: data_source_internal_id={} data_source_id={} cluster={} current_embedder={} target_embedder={} updated={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster(),
        ds.embedder_config(),
        match ds.shadow_embedder_config() {
            Some(sec) => sec.to_string(),
            None => "none".to_string()
        },
        total
    ));

    Ok(())
}

async fn migrate(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    provider_id: ProviderID,
    model_id: SupportedEmbedderModels,
    ask_confirmation: bool,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let from_embedder = ds.embedder_config();
    let to_embedder = EmbedderConfig {
        max_chunk_size: ds.embedder_config().max_chunk_size,
        model_id: model_id.to_string(),
        provider_id,
        splitter_id: ds.embedder_config().splitter_id,
    };

    // If from_embedder.model_id and provider_id is equal to to_embedder, return.
    if from_embedder.model_id == to_embedder.model_id
        && from_embedder.provider_id == to_embedder.provider_id
    {
        utils::info(&format!(
            "Migration aborted, data source already using target embedder: data_source_internal_id={} data_source_id={} cluster={} current_embedder={} target_embedder={}",
            ds.internal_id(),
            ds.data_source_id(),
            ds.main_qdrant_cluster(),
            from_embedder,
            to_embedder
        ));

        return Ok(());
    }

    utils::info(&format!(
        "Migrating data source: data_source_internal_id={} data_source_id={} cluster={} current_embedder={} target_embedder={}",
        ds.internal_id(),
        ds.data_source_id(),
        ds.main_qdrant_cluster(),
        from_embedder,
        to_embedder
    ));

    // First show the current state.
    show(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    if ask_confirmation {
        // Confirm this is the migration we want.
        match utils::confirm(&format!(
            "Do you confirm `set_shadow_embedder` + `migrate_shadow_embedder`: \
                data_source_internal_id={} data_source_id={} cluster={} from_embedder={} to_embedder={}?",
            ds.internal_id(),
            ds.data_source_id(),
            ds.main_qdrant_cluster(),
            from_embedder,
            to_embedder,
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    let shadow_embedder_enabled_at = utils::now();

    set_shadow_embedder(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
        provider_id.clone(),
        model_id.clone(),
    )
    .await?;

    migrate_shadow_embedder(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    if ask_confirmation {
        // Confirm we're ready to commit.
        match utils::confirm(&format!(
            "Do you confirm `commit_shadow_write` + `clear_shadow_write`: \
               data_source_internal_id={} data_source_id={} cluster={} from_embedder={} to_embedder={}?",
            ds.internal_id(),
            ds.data_source_id(),
            ds.main_qdrant_cluster(),
            from_embedder,
            to_embedder
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    commit_shadow_embedder(store.clone(), data_source_internal_id.clone()).await?;

    clear_shadow_embedder(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
        ask_confirmation,
    )
    .await?;

    // Refresh chunk_count on documents updated while the shadow embedder was active.
    refresh_chunk_count_for_updated_documents(
        store.clone(),
        &qdrant_clients,
        &ds,
        shadow_embedder_enabled_at,
    )
    .await?;

    utils::done(&format!(
        "Data source migrated: \
           data_source_internal_id={} data_source_id={} cluster={} from_embedder={} to_embedder={}?",
        ds.data_source_id(),
        ds.internal_id(),
        ds.main_qdrant_cluster(),
        from_embedder,
        to_embedder
    ));

    show(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
struct MigrationRecord {
    data_source_id: String,
    internal_id: String,
}

async fn migrate_file(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    json_path: String,
    provider_id: ProviderID,
    model_id: SupportedEmbedderModels,
) -> Result<()> {
    let file = File::open(json_path)?;
    let reader = BufReader::new(file);
    let records = reader
        .lines()
        .map(|line| {
            // Each line is a JSON
            let line = line?;
            serde_json::from_str(&line).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
        })
        .collect::<Result<Vec<MigrationRecord>, std::io::Error>>()?;

    match utils::confirm(&format!(
        "Do you confirm you want to migrate {} data sources to provider_id={} model_id={}?",
        records.len(),
        provider_id,
        model_id
    ))? {
        true => (),
        false => Err(anyhow!("Aborted"))?,
    }

    stream::iter(records.into_iter().map(|record| {
        let store = store.clone();
        let qdrant_clients = qdrant_clients.clone();
        let model_id = model_id.clone();
        let provider_id = provider_id.clone();

        async move {
            migrate(
                store,
                qdrant_clients,
                record.internal_id,
                provider_id,
                model_id,
                false,
            )
            .await
        }
    }))
    .buffer_unordered(1)
    .try_collect::<Vec<_>>()
    .await?;

    Ok(())
}

#[derive(Debug, Parser)]
#[command(name = "collection_migrator")]
#[command(about = "Tooling to migrate Data sources on Qdrant", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

fn main() -> Result<()> {
    let args = Cli::parse();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        tracing_subscriber::fmt()
            .with_target(false)
            .compact()
            .with_ansi(false)
            .init();
        let store: Box<dyn Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let qdrant_clients = QdrantClients::build().await?;

        match args.command {
            Commands::Show {
                data_source_internal_id,
            } => show(store, qdrant_clients, data_source_internal_id).await,

            Commands::SetShadowEmbedder {
                data_source_internal_id,
                provider_id,
                model_id,
            } => {
                set_shadow_embedder(
                    store,
                    qdrant_clients,
                    data_source_internal_id,
                    provider_id,
                    model_id,
                )
                .await
            }

            Commands::ClearShadowEmbedder {
                data_source_internal_id,
            } => {
                // This is the most dangerous command of all as it is the only one to actually
                // delete data in an unrecoverable way.
                clear_shadow_embedder(store, qdrant_clients, data_source_internal_id, true).await
            }

            Commands::MigrateShadowEmbedder {
                data_source_internal_id,
            } => migrate_shadow_embedder(store, qdrant_clients, data_source_internal_id).await,

            Commands::CommitShadowEmbedder {
                data_source_internal_id,
            } => commit_shadow_embedder(store, data_source_internal_id).await,

            Commands::Migrate {
                data_source_internal_id,
                provider_id,
                model_id,
            } => {
                migrate(
                    store,
                    qdrant_clients,
                    data_source_internal_id,
                    provider_id,
                    model_id,
                    true,
                )
                .await
            }

            Commands::MigrateFile {
                json_path,
                provider_id,
                model_id,
            } => migrate_file(store, qdrant_clients, json_path, provider_id, model_id).await,
        }
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            utils::error(&format!("Error: {:?}", e));
            std::process::exit(1);
        }
    }

    Ok(())
}
