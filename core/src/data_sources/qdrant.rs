use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;
use std::sync::Arc;

use parking_lot::Mutex;
use qdrant_client::{
    config::QdrantConfig,
    prelude::Payload,
    qdrant::{
        self, shard_key, CountPointsBuilder, DeletePointsBuilder, ScrollPointsBuilder,
        SearchPointsBuilder, SetPayloadPointsBuilder, UpsertPointsBuilder,
    },
    Qdrant,
};
use serde::{Deserialize, Serialize};

use super::data_source::EmbedderConfig;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize, Eq, Hash)]
pub enum QdrantCluster {
    #[serde(rename = "cluster-0")]
    Cluster0,
}

// See: https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27
pub const SHARD_KEY_COUNT: u64 = 24;

static QDRANT_CLUSTER_VARIANTS: &[QdrantCluster] = &[QdrantCluster::Cluster0];

impl fmt::Display for QdrantCluster {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QdrantCluster::Cluster0 => write!(f, "cluster-0"),
        }
    }
}

impl FromStr for QdrantCluster {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "cluster-0" => Ok(QdrantCluster::Cluster0),
            _ => Err(ParseError::with_message("Unknown QdrantCluster"))?,
        }
    }
}

pub fn env_var_prefix_for_cluster(cluster: QdrantCluster) -> &'static str {
    match cluster {
        QdrantCluster::Cluster0 => "QDRANT_CLUSTER_0",
    }
}

#[derive(Clone)]
pub struct QdrantClients {
    clients: Arc<Mutex<HashMap<QdrantCluster, DustQdrantClient>>>,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct QdrantDataSourceConfig {
    pub cluster: QdrantCluster,
    pub shadow_write_cluster: Option<QdrantCluster>,
}

impl QdrantClients {
    async fn qdrant_client(cluster: QdrantCluster) -> Result<Qdrant> {
        let url_var = format!("{}_URL", env_var_prefix_for_cluster(cluster));
        let api_key_var = format!("{}_API_KEY", env_var_prefix_for_cluster(cluster));

        match std::env::var(url_var.clone()) {
            Ok(url) => {
                let mut config = QdrantConfig::from_url(&url);
                match std::env::var(api_key_var.clone()) {
                    Ok(api_key) => {
                        config.set_api_key(&api_key);
                        Qdrant::new(config).map_err(|e| {
                            anyhow!("Error creating Qdrant client for {}: {}", url_var, e)
                        })
                    }
                    Err(_) => Err(anyhow!("{} is not set", api_key_var))?,
                }
            }
            Err(_) => Err(anyhow!("{} is not set", url_var))?,
        }
    }

    pub async fn build() -> Result<Self> {
        let clients = futures::future::try_join_all(QDRANT_CLUSTER_VARIANTS.into_iter().map(
            |cluster| async move {
                let client = Self::qdrant_client(*cluster).await?;
                Ok::<_, anyhow::Error>((
                    *cluster,
                    DustQdrantClient {
                        client: Arc::new(client),
                        cluster: *cluster,
                    },
                ))
            },
        ))
        .await?
        .into_iter()
        .collect::<HashMap<_, _>>();

        Ok(Self {
            clients: Arc::new(Mutex::new(clients)),
        })
    }

    pub fn client(&self, cluster: QdrantCluster) -> DustQdrantClient {
        let clients = self.clients.lock();
        match clients.get(&cluster) {
            Some(client) => client.clone(),
            None => panic!("No qdrant_client for cluster {:?}", cluster),
        }
    }
}

#[derive(Clone)]
pub struct DustQdrantClient {
    client: Arc<Qdrant>,
    pub cluster: QdrantCluster,
}

impl DustQdrantClient {
    pub fn collection_prefix(&self) -> String {
        return String::from("c");
    }

    pub fn shard_key_prefix(&self) -> String {
        return String::from("key");
    }

    pub fn collection_name(&self, embedder_config: &EmbedderConfig) -> String {
        // The collection name depends on the embedding model.
        // To allow migrations between embedders in the future we will
        // add a notion of shadow_write embedding provider/model on the data source config
        // that will have to be used here.
        format!(
            "{}_{}_{}",
            self.collection_prefix(),
            embedder_config.provider_id.to_string(),
            embedder_config.model_id,
        )
    }

    fn shard_key_id_from_internal_id(internal_id: &str) -> Result<u64> {
        // `internal_id` is the hexadecimal representation of a blake3 hash (massive number). We want
        // to get a u64 out of it so we take the first 16 characters which will turn into a fully
        // random u64. Taking the modulo SHARD_KEY_COUNT will give us a random shard key. 16=2^4 and
        // 64/4=16 so u64 is represented by 16 hexadecimal characters.
        let h: u64 = u64::from_str_radix(&internal_id[0..16], 16)?;
        Ok(h % SHARD_KEY_COUNT)
    }

    fn shard_key(&self, internal_id: &String) -> Result<shard_key::Key> {
        Ok(format!(
            "{}_{}",
            self.shard_key_prefix(),
            Self::shard_key_id_from_internal_id(internal_id)?
        )
        .into())
    }

    // Inject the `data_source_internal_id` to the filter to ensure tenant separation. This
    // implementation ensures data separation of our users' data.
    // /!\ Modify with extreme caution.
    fn apply_tenant_filter(&self, internal_id: &String, filter: &mut qdrant::Filter) -> () {
        filter.must.push(
            qdrant::FieldCondition {
                key: "data_source_internal_id".to_string(),
                r#match: Some(qdrant::Match {
                    match_value: Some(qdrant::r#match::MatchValue::Keyword(
                        internal_id.to_string(),
                    )),
                }),
                ..Default::default()
            }
            .into(),
        );
    }

    pub async fn delete_all_points_for_internal_id(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
    ) -> Result<()> {
        // Create a default filter and ensure tenant separation to delete all the points
        // associated with the data source.
        let mut filter = qdrant::Filter::default();
        self.apply_tenant_filter(internal_id, &mut filter);

        self.client
            .delete_points(
                DeletePointsBuilder::new(self.collection_name(embedder_config))
                    .shard_key_selector(vec![self.shard_key(internal_id)?])
                    .points(filter),
            )
            .await?;

        Ok(())
    }

    pub async fn collection_info(
        &self,
        embedder_config: &EmbedderConfig,
    ) -> Result<qdrant::GetCollectionInfoResponse> {
        self.client
            .collection_info(self.collection_name(embedder_config))
            .await
            .map_err(|e| anyhow!("Error getting collection info: {}", e))
    }

    pub async fn delete_points(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        mut filter: qdrant::Filter,
    ) -> Result<qdrant::PointsOperationResponse> {
        // Inject the `data_source_internal_id` to the filter to ensure tenant separation.
        self.apply_tenant_filter(internal_id, &mut filter);

        self.client
            .delete_points(
                DeletePointsBuilder::new(self.collection_name(embedder_config))
                    .shard_key_selector(vec![self.shard_key(internal_id)?])
                    .points(filter),
            )
            .await
            .map_err(|e| anyhow!("Error deleting points: {}", e))
    }

    pub async fn scroll(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        filter: Option<qdrant::Filter>,
        limit: Option<u32>,
        offset: Option<qdrant::PointId>,
        with_vectors: Option<bool>,
    ) -> Result<qdrant::ScrollResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(internal_id, &mut filter);

        let mut builder = ScrollPointsBuilder::new(self.collection_name(embedder_config))
            .shard_key_selector(vec![self.shard_key(internal_id)?])
            .filter(filter);

        if let Some(limit) = limit {
            builder = builder.limit(limit);
        }
        if let Some(offset) = offset {
            builder = builder.offset(offset);
        }
        if let Some(with_vectors) = with_vectors {
            builder = builder.with_vectors(with_vectors);
        }

        self.client
            .scroll(builder)
            .await
            .map_err(|e| anyhow!("Error scrolling points: {}", e))
    }

    pub async fn search_points(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        vector: Vec<f32>,
        filter: Option<qdrant::Filter>,
        limit: u64,
        with_payload: Option<bool>,
    ) -> Result<qdrant::SearchResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(internal_id, &mut filter);

        let mut builder =
            SearchPointsBuilder::new(self.collection_name(embedder_config), vector, limit)
                .shard_key_selector(vec![self.shard_key(internal_id)?])
                .filter(filter);

        if let Some(with_payload) = with_payload {
            builder = builder.with_payload(with_payload);
        }

        self.client
            .search_points(builder)
            .await
            .map_err(|e| anyhow!("Error searching points: {}", e))
    }

    pub async fn count_points(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        filter: Option<qdrant::Filter>,
        exact: bool,
    ) -> Result<qdrant::CountResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(internal_id, &mut filter);

        self.client
            .count(
                CountPointsBuilder::new(self.collection_name(embedder_config))
                    .shard_key_selector(vec![self.shard_key(internal_id)?])
                    .filter(filter)
                    .exact(exact),
            )
            .await
            .map_err(|e| anyhow!("Error counting points: {}", e))
    }

    pub async fn upsert_points(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        points: Vec<qdrant::PointStruct>,
    ) -> Result<qdrant::PointsOperationResponse> {
        self.client
            .upsert_points(
                UpsertPointsBuilder::new(self.collection_name(embedder_config), points)
                    .shard_key_selector(vec![self.shard_key(internal_id)?]),
            )
            .await
            .map_err(|e| anyhow!("Error upserting points: {}", e))
    }

    pub async fn set_payload(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &String,
        mut filter: qdrant::Filter,
        payload: Payload,
    ) -> Result<qdrant::PointsOperationResponse> {
        // Inject the `internal_id` to the filter to ensure tenant separation.
        self.apply_tenant_filter(internal_id, &mut filter);

        self.client
            .set_payload(
                SetPayloadPointsBuilder::new(self.collection_name(embedder_config), payload)
                    .shard_key_selector(vec![self.shard_key(internal_id)?])
                    .points_selector(filter),
            )
            .await
            .map_err(|e| anyhow!("Error setting payload: {}", e))
    }

    pub fn raw_client(&self) -> Arc<Qdrant> {
        return self.client.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_balanced_shard_keys() {
        let keys = (0..(SHARD_KEY_COUNT * 192))
            .map(|i| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(format!("{}", i).as_bytes());
                let internal_id = format!("{}", hasher.finalize().to_hex());
                DustQdrantClient::shard_key_id_from_internal_id(&internal_id).unwrap()
            })
            .collect::<Vec<_>>();
        for i in 0..SHARD_KEY_COUNT {
            // We test all keys have at least 128 points.
            let key_count = keys.iter().filter(|&&x| x == i).count();
            assert!(key_count >= 128);
        }
    }
}
