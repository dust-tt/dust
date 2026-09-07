use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;
use std::sync::{Arc, OnceLock};

use parking_lot::Mutex;
use qdrant_client::{
    config::QdrantConfig,
    qdrant::{
        self, shard_key, vector_output, CountPointsBuilder, DeletePointsBuilder,
        ScrollPointsBuilder, SearchPointsBuilder, SetPayloadPointsBuilder, UpsertPointsBuilder,
    },
    Payload, Qdrant,
};
use serde::{Deserialize, Serialize};

use super::data_source::EmbedderConfig;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize, Eq, Hash)]
pub enum QdrantCluster {
    #[serde(rename = "cluster-0")]
    Cluster0,
}

// See: https://app.notion.com/p/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27
// Key count of the collections created before data sources stored their shard key. A data source
// without a stored key still hashes into these. Newer collections declare their own count and the
// data sources created against them carry their key in `QdrantDataSourceConfig::shard_keys`.
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

// qdrant-client 1.17 removed `From<VectorsOutput> for Vectors`; our collections only hold single
// unnamed vectors so we convert through the dedicated vector type.
pub fn vectors_output_to_vectors(vectors: qdrant::VectorsOutput) -> Result<qdrant::Vectors> {
    let vector: qdrant::Vector = match vectors
        .get_vector()
        .ok_or_else(|| anyhow!("expected an unnamed vector"))?
    {
        vector_output::Vector::Dense(v) => v.into(),
        vector_output::Vector::Sparse(v) => v.into(),
        vector_output::Vector::MultiDense(v) => v.into(),
    };
    Ok(vector.into())
}

#[derive(Clone)]
pub struct QdrantClients {
    clients: Arc<Mutex<HashMap<QdrantCluster, DustQdrantClient>>>,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct QdrantDataSourceConfig {
    pub cluster: QdrantCluster,
    pub shadow_write_cluster: Option<QdrantCluster>,
    // Shard key of the data source in each cluster, assigned at creation from the key list of the
    // cluster's collection. Absent for data sources created before, routed by the legacy hash.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub shard_keys: HashMap<QdrantCluster, String>,
}

// What a request needs to know about its data source: the tenant filter value and the shard key.
pub struct QdrantTenant<'a> {
    pub internal_id: &'a str,
    pub shard_keys: &'a HashMap<QdrantCluster, String>,
}

impl<'a> QdrantTenant<'a> {
    // A data source known by its internal id only, routed by the legacy hash.
    pub fn legacy(internal_id: &'a str) -> Self {
        static EMPTY: OnceLock<HashMap<QdrantCluster, String>> = OnceLock::new();
        QdrantTenant {
            internal_id,
            shard_keys: EMPTY.get_or_init(HashMap::new),
        }
    }
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
        // Check if sharding is enabled (defaults to true for production)
        let use_sharding = std::env::var("QDRANT_USE_SHARDING")
            .map(|v| v.to_lowercase() != "false")
            .unwrap_or(true);

        let clients = futures::future::try_join_all(QDRANT_CLUSTER_VARIANTS.into_iter().map(
            |cluster| async move {
                let client = Self::qdrant_client(*cluster).await?;
                Ok::<_, anyhow::Error>((
                    *cluster,
                    DustQdrantClient {
                        client: Arc::new(client),
                        cluster: *cluster,
                        use_sharding,
                        shard_key_names: Arc::new(Mutex::new(HashMap::new())),
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
    use_sharding: bool,
    // Shard keys per collection as Qdrant reports them, read once per process.
    shard_key_names: Arc<Mutex<HashMap<String, Vec<String>>>>,
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

    pub fn shard_key_id_from_internal_id(internal_id: &str, key_count: u64) -> Result<u64> {
        // `internal_id` is the hexadecimal representation of a blake3 hash (massive number). We want
        // to get a u64 out of it so we take the first 16 characters which will turn into a fully
        // random u64. Taking the modulo `key_count` will give us a random shard key. 16=2^4 and
        // 64/4=16 so u64 is represented by 16 hexadecimal characters.
        let h: u64 = u64::from_str_radix(&internal_id[0..16], 16)?;
        Ok(h % key_count)
    }

    fn legacy_shard_key_name(&self, internal_id: &str) -> Result<String> {
        Ok(format!(
            "{}_{}",
            self.shard_key_prefix(),
            Self::shard_key_id_from_internal_id(internal_id, SHARD_KEY_COUNT)?
        ))
    }

    // The stored key for this cluster when the data source has one, the legacy hash otherwise.
    pub fn shard_key_name(&self, tenant: &QdrantTenant) -> Result<String> {
        match tenant.shard_keys.get(&self.cluster) {
            Some(key) => Ok(key.clone()),
            None => self.legacy_shard_key_name(tenant.internal_id),
        }
    }

    pub fn shard_key_id(&self, tenant: &QdrantTenant) -> Result<u64> {
        let name = self.shard_key_name(tenant)?;
        let prefix = format!("{}_", self.shard_key_prefix());
        match name.strip_prefix(&prefix) {
            Some(id) => Ok(id.parse::<u64>()?),
            None => Err(anyhow!("Unexpected shard key name {}", name)),
        }
    }

    fn shard_key(&self, tenant: &QdrantTenant) -> Result<shard_key::Key> {
        Ok(self.shard_key_name(tenant)?.into())
    }

    fn shard_key_names_from_cluster_info(
        info: &qdrant::CollectionClusterInfoResponse,
    ) -> Vec<String> {
        let mut keys = info
            .local_shards
            .iter()
            .filter_map(|s| s.shard_key.as_ref())
            .chain(
                info.remote_shards
                    .iter()
                    .filter_map(|s| s.shard_key.as_ref()),
            )
            .filter_map(|k| match &k.key {
                Some(shard_key::Key::Keyword(name)) => Some(name.clone()),
                _ => None,
            })
            .collect::<Vec<_>>();
        keys.sort();
        keys.dedup();
        keys
    }

    // Shard keys of the collection, empty when it has no custom sharding.
    pub async fn shard_key_names(&self, embedder_config: &EmbedderConfig) -> Result<Vec<String>> {
        let collection = self.collection_name(embedder_config);
        if let Some(keys) = self.shard_key_names.lock().get(&collection) {
            return Ok(keys.clone());
        }
        let info = self
            .client
            .collection_cluster_info(collection.clone())
            .await
            .map_err(|e| anyhow!("Error getting collection cluster info: {}", e))?;
        let keys = Self::shard_key_names_from_cluster_info(&info);
        if !keys.is_empty() {
            self.shard_key_names.lock().insert(collection, keys.clone());
        }
        Ok(keys)
    }

    // The key a new data source gets in this cluster: the collection's keys are counted and the
    // internal id hashed into them. The layout is read from Qdrant, never configured twice.
    pub async fn assign_shard_key(
        &self,
        embedder_config: &EmbedderConfig,
        internal_id: &str,
    ) -> Result<Option<String>> {
        if !self.use_sharding {
            return Ok(None);
        }
        let collection = self.collection_name(embedder_config);
        let keys = self.shard_key_names(embedder_config).await?;
        if keys.is_empty() {
            return Err(anyhow!(
                "Collection {} on cluster {} has no shard keys",
                collection,
                self.cluster
            ));
        }
        let id = Self::shard_key_id_from_internal_id(internal_id, keys.len() as u64)?;
        let name = format!("{}_{}", self.shard_key_prefix(), id);
        if !keys.contains(&name) {
            return Err(anyhow!(
                "Collection {} on cluster {} has {} shard keys but none named {}",
                collection,
                self.cluster,
                keys.len(),
                name
            ));
        }
        Ok(Some(name))
    }

    // Inject the `data_source_internal_id` to the filter to ensure tenant separation. This
    // implementation ensures data separation of our users' data.
    // /!\ Modify with extreme caution.
    fn apply_tenant_filter(&self, internal_id: &str, filter: &mut qdrant::Filter) -> () {
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
        tenant: &QdrantTenant<'_>,
    ) -> Result<()> {
        // Create a default filter and ensure tenant separation to delete all the points
        // associated with the data source.
        let mut filter = qdrant::Filter::default();
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder =
            DeletePointsBuilder::new(self.collection_name(embedder_config)).points(filter);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

        self.client.delete_points(builder).await?;

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
        tenant: &QdrantTenant<'_>,
        mut filter: qdrant::Filter,
    ) -> Result<qdrant::PointsOperationResponse> {
        // Inject the `data_source_internal_id` to the filter to ensure tenant separation.
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder =
            DeletePointsBuilder::new(self.collection_name(embedder_config)).points(filter);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

        self.client
            .delete_points(builder)
            .await
            .map_err(|e| anyhow!("Error deleting points: {}", e))
    }

    pub async fn scroll(
        &self,
        embedder_config: &EmbedderConfig,
        tenant: &QdrantTenant<'_>,
        filter: Option<qdrant::Filter>,
        limit: Option<u32>,
        offset: Option<qdrant::PointId>,
        with_vectors: Option<bool>,
    ) -> Result<qdrant::ScrollResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder =
            ScrollPointsBuilder::new(self.collection_name(embedder_config)).filter(filter);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

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
        tenant: &QdrantTenant<'_>,
        vector: Vec<f32>,
        filter: Option<qdrant::Filter>,
        limit: u64,
        with_payload: Option<bool>,
    ) -> Result<qdrant::SearchResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder =
            SearchPointsBuilder::new(self.collection_name(embedder_config), vector, limit)
                .filter(filter);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

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
        tenant: &QdrantTenant<'_>,
        filter: Option<qdrant::Filter>,
        exact: bool,
    ) -> Result<qdrant::CountResponse> {
        // If we don't have a filter create an empty one to ensure tenant separation.
        let mut filter = filter.unwrap_or_default();
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder = CountPointsBuilder::new(self.collection_name(embedder_config))
            .filter(filter)
            .exact(exact);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

        self.client
            .count(builder)
            .await
            .map_err(|e| anyhow!("Error counting points: {}", e))
    }

    pub async fn upsert_points(
        &self,
        embedder_config: &EmbedderConfig,
        tenant: &QdrantTenant<'_>,
        points: Vec<qdrant::PointStruct>,
    ) -> Result<qdrant::PointsOperationResponse> {
        let mut builder = UpsertPointsBuilder::new(self.collection_name(embedder_config), points);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

        self.client
            .upsert_points(builder)
            .await
            .map_err(|e| anyhow!("Error upserting points: {}", e))
    }

    pub async fn set_payload(
        &self,
        embedder_config: &EmbedderConfig,
        tenant: &QdrantTenant<'_>,
        mut filter: qdrant::Filter,
        payload: Payload,
    ) -> Result<qdrant::PointsOperationResponse> {
        // Inject the `internal_id` to the filter to ensure tenant separation.
        self.apply_tenant_filter(tenant.internal_id, &mut filter);

        let mut builder =
            SetPayloadPointsBuilder::new(self.collection_name(embedder_config), payload)
                .points_selector(filter);

        // Only use shard key selector when sharding is enabled
        if self.use_sharding {
            builder = builder.shard_key_selector(vec![self.shard_key(tenant)?]);
        }

        self.client
            .set_payload(builder)
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

    fn hashed_ids(n: u64) -> Vec<String> {
        (0..n)
            .map(|i| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(format!("{}", i).as_bytes());
                format!("{}", hasher.finalize().to_hex())
            })
            .collect()
    }

    #[test]
    fn test_balanced_shard_keys() {
        for key_count in [SHARD_KEY_COUNT, 3, 1] {
            let keys = hashed_ids(key_count * 192)
                .iter()
                .map(|id| DustQdrantClient::shard_key_id_from_internal_id(id, key_count).unwrap())
                .collect::<Vec<_>>();
            for i in 0..key_count {
                // We test all keys have at least 128 points.
                let hits = keys.iter().filter(|&&x| x == i).count();
                assert!(hits >= 128);
            }
            assert!(keys.iter().all(|&x| x < key_count));
        }
    }

    fn local_shard(id: u32, key: Option<&str>) -> qdrant::LocalShardInfo {
        qdrant::LocalShardInfo {
            shard_id: id,
            shard_key: key.map(|k| shard_key::Key::Keyword(k.to_string()).into()),
            ..Default::default()
        }
    }

    #[test]
    fn test_shard_key_names_from_cluster_info() {
        let info = qdrant::CollectionClusterInfoResponse {
            local_shards: vec![local_shard(0, Some("key_1")), local_shard(1, Some("key_0"))],
            remote_shards: vec![qdrant::RemoteShardInfo {
                shard_id: 2,
                shard_key: Some(shard_key::Key::Keyword("key_2".to_string()).into()),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert_eq!(
            DustQdrantClient::shard_key_names_from_cluster_info(&info),
            vec!["key_0", "key_1", "key_2"]
        );

        let plain = qdrant::CollectionClusterInfoResponse {
            local_shards: vec![local_shard(0, None)],
            ..Default::default()
        };
        assert!(DustQdrantClient::shard_key_names_from_cluster_info(&plain).is_empty());
    }

    #[test]
    fn test_config_without_shard_keys_still_parses() {
        let config: QdrantDataSourceConfig =
            serde_json::from_str(r#"{"cluster":"cluster-0","shadow_write_cluster":null}"#).unwrap();
        assert!(config.shard_keys.is_empty());
        assert_eq!(
            serde_json::to_string(&config).unwrap(),
            r#"{"cluster":"cluster-0","shadow_write_cluster":null}"#
        );

        let mut with_key = config.clone();
        with_key
            .shard_keys
            .insert(QdrantCluster::Cluster0, "key_2".to_string());
        let json = serde_json::to_string(&with_key).unwrap();
        assert!(json.contains(r#""shard_keys":{"cluster-0":"key_2"}"#));
        let back: QdrantDataSourceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back, with_key);
    }
}
