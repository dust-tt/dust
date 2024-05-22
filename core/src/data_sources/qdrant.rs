use crate::{providers::provider::provider, run::Credentials, utils::ParseError};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use parking_lot::Mutex;
use qdrant_client::{
    prelude::{Payload, QdrantClient, QdrantClientConfig},
    qdrant::{self, shard_key},
};
use serde::{Deserialize, Serialize};

use super::data_source::DataSource;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize, Eq, Hash)]
pub enum QdrantCluster {
    #[serde(rename = "main-0")]
    Main0,
    #[serde(rename = "dedicated-0")]
    Dedicated0,
    #[serde(rename = "dedicated-1")]
    Dedicated1,
    #[serde(rename = "dedicated-2")]
    Dedicated2,
    #[serde(rename = "cluster-0")]
    Cluster0,
}

// See: https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27
const SHARD_KEY_COUNT: u8 = 24;

pub enum QdrantClusterVersion {
    // Legacy setup with one collection per data source.
    V0,
    // Future setup with a shared collection per embedder.
    V1,
}

static QDRANT_CLUSTER_VARIANTS: &[QdrantCluster] = &[
    QdrantCluster::Main0,
    QdrantCluster::Dedicated0,
    QdrantCluster::Dedicated1,
    QdrantCluster::Dedicated2,
    QdrantCluster::Cluster0,
];

impl ToString for QdrantCluster {
    fn to_string(&self) -> String {
        match self {
            QdrantCluster::Main0 => String::from("main-0"),
            QdrantCluster::Dedicated0 => String::from("dedicated-0"),
            QdrantCluster::Dedicated1 => String::from("dedicated-1"),
            QdrantCluster::Dedicated2 => String::from("dedicated-2"),
            QdrantCluster::Cluster0 => String::from("cluster-0"),
        }
    }
}

impl FromStr for QdrantCluster {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "main-0" => Ok(QdrantCluster::Main0),
            "dedicated-0" => Ok(QdrantCluster::Dedicated0),
            "dedicated-1" => Ok(QdrantCluster::Dedicated1),
            "dedicated-2" => Ok(QdrantCluster::Dedicated2),
            "cluster-0" => Ok(QdrantCluster::Cluster0),
            _ => Err(ParseError::with_message("Unknown QdrantCluster"))?,
        }
    }
}

pub fn env_var_prefix_for_cluster(cluster: QdrantCluster) -> &'static str {
    match cluster {
        QdrantCluster::Main0 => "QDRANT_MAIN_0",
        QdrantCluster::Dedicated0 => "QDRANT_DEDICATED_0",
        QdrantCluster::Dedicated1 => "QDRANT_DEDICATED_1",
        QdrantCluster::Dedicated2 => "QDRANT_DEDICATED_2",
        QdrantCluster::Cluster0 => "QDRANT_CLUSTER_0",
    }
}

pub fn version_for_cluster(cluster: QdrantCluster) -> QdrantClusterVersion {
    match cluster {
        QdrantCluster::Main0 => QdrantClusterVersion::V0,
        QdrantCluster::Dedicated0 => QdrantClusterVersion::V0,
        QdrantCluster::Dedicated1 => QdrantClusterVersion::V0,
        QdrantCluster::Dedicated2 => QdrantClusterVersion::V0,
        QdrantCluster::Cluster0 => QdrantClusterVersion::V1,
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
    async fn qdrant_client(cluster: QdrantCluster) -> Result<QdrantClient> {
        let url_var = format!("{}_URL", env_var_prefix_for_cluster(cluster));
        let api_key_var = format!("{}_API_KEY", env_var_prefix_for_cluster(cluster));

        match std::env::var(url_var.clone()) {
            Ok(url) => {
                let mut config = QdrantClientConfig::from_url(&url);
                match std::env::var(api_key_var.clone()) {
                    Ok(api_key) => {
                        config.set_api_key(&api_key);
                        QdrantClient::new(Some(config))
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

    pub fn main_cluster(&self, config: &Option<QdrantDataSourceConfig>) -> QdrantCluster {
        match config {
            Some(config) => config.cluster,
            None => QdrantCluster::Main0,
        }
    }

    // Returns the client for the cluster specified in the config or the main-0 cluster if no config
    // is provided.
    pub fn main_client(&self, config: &Option<QdrantDataSourceConfig>) -> DustQdrantClient {
        self.client(self.main_cluster(config))
    }

    pub fn shadow_write_cluster(
        &self,
        config: &Option<QdrantDataSourceConfig>,
    ) -> Option<QdrantCluster> {
        match config {
            Some(c) => c.shadow_write_cluster,
            None => None,
        }
    }

    // Returns the shadow write client if the config specifies a shadow write cluster.
    pub fn shadow_write_client(
        &self,
        config: &Option<QdrantDataSourceConfig>,
    ) -> Option<DustQdrantClient> {
        match config {
            Some(c) => match c.shadow_write_cluster {
                Some(cluster) => Some(self.client(cluster)),
                None => None,
            },
            None => None,
        }
    }
}

#[derive(Clone)]
pub struct DustQdrantClient {
    client: Arc<QdrantClient>,
    pub cluster: QdrantCluster,
}

impl DustQdrantClient {
    // In v1 implementations, we'll be able:
    // - we'll be able to retrieve the shared collection name from the data source config.
    // - we'll be able to add a condition on the PointsSelector to match the
    //   data_source.internal_id multi-tenancy filter.

    pub fn collection_name(&self, data_source: &DataSource) -> String {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                format!("ds_{}", data_source.internal_id())
            }
            QdrantClusterVersion::V1 => {
                // The collection name depends on the embedding model which is stored on the
                // data source config. To allow migrations between embedders in the future we will
                // add a notion of shadow_write embedding provider/model on the data source config
                // that will have to be used here.
                format!(
                    "c_{}_{}",
                    data_source.config().provider_id.to_string(),
                    data_source.config().model_id,
                )
            }
        }
    }

    fn shard_key(&self, data_source: &DataSource) -> shard_key::Key {
        // We use the last character of the internal_id to determine the pool_id. This id is
        // generated using new_id and is guaranteed random. Using the last character gives us a
        // path to moving data sources across shard when needed.
        let pool_id = data_source.internal_id().chars().last().unwrap() as u8 % SHARD_KEY_COUNT;
        format!("pool_{}", pool_id).into()
    }

    // Inject the `data_source_internal_id` to the filter to ensure tenant separation. This
    // implementaiton ensure data separation of our users data. Modify with extreme caution.
    fn apply_tenant_filter(&self, data_source: &DataSource, filter: &mut qdrant::Filter) -> () {
        filter.must.push(
            qdrant::FieldCondition {
                key: "data_source_internal_id".to_string(),
                r#match: Some(qdrant::Match {
                    match_value: Some(qdrant::r#match::MatchValue::Keyword(
                        data_source.internal_id().to_string(),
                    )),
                }),
                ..Default::default()
            }
            .into(),
        );
    }

    pub async fn create_data_source(
        &self,
        data_source: &DataSource,
        credentials: Credentials,
    ) -> Result<()> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                let mut embedder = provider(data_source.config().provider_id)
                    .embedder(data_source.config().model_id.clone());
                embedder.initialize(credentials).await?;

                self.client
                    .create_collection(&qdrant::CreateCollection {
                        collection_name: self.collection_name(data_source),
                        vectors_config: Some(qdrant::VectorsConfig {
                            config: Some(qdrant::vectors_config::Config::Params(
                                qdrant::VectorParams {
                                    size: embedder.embedding_size() as u64,
                                    distance: qdrant::Distance::Cosine.into(),
                                    on_disk: Some(true),
                                    ..Default::default()
                                },
                            )),
                        }),
                        hnsw_config: Some(qdrant::HnswConfigDiff {
                            m: Some(16),
                            max_indexing_threads: Some(1),
                            ..Default::default()
                        }),
                        optimizers_config: Some(qdrant::OptimizersConfigDiff {
                            memmap_threshold: Some(8192),
                            ..Default::default()
                        }),
                        quantization_config: Some(qdrant::QuantizationConfig {
                            quantization: Some(qdrant::quantization_config::Quantization::Scalar(
                                qdrant::ScalarQuantization {
                                    r#type: qdrant::QuantizationType::Int8.into(),
                                    quantile: Some(0.99),
                                    always_ram: Some(true),
                                },
                            )),
                        }),
                        // We keep the entire payload on disk and index on document_id and tags.
                        on_disk_payload: Some(true),
                        ..Default::default()
                    })
                    .await?;

                let _ = self
                    .client
                    .create_field_index(
                        self.collection_name(data_source),
                        "document_id_hash",
                        qdrant::FieldType::Keyword,
                        None,
                        None,
                    )
                    .await?;

                let _ = self
                    .client
                    .create_field_index(
                        self.collection_name(data_source),
                        "tags",
                        qdrant::FieldType::Keyword,
                        None,
                        None,
                    )
                    .await?;

                let _ = self
                    .client
                    .create_field_index(
                        self.collection_name(data_source),
                        "parents",
                        qdrant::FieldType::Keyword,
                        None,
                        None,
                    )
                    .await?;

                let _ = self
                    .client
                    .create_field_index(
                        self.collection_name(data_source),
                        "timestamp",
                        qdrant::FieldType::Integer,
                        None,
                        None,
                    )
                    .await?;
            }
            QdrantClusterVersion::V1 => {
                // Nothing to do.
            }
        }

        Ok(())
    }

    pub async fn delete_data_source(&self, data_source: &DataSource) -> Result<()> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .delete_collection(self.collection_name(data_source))
                    .await?;
            }
            QdrantClusterVersion::V1 => {
                // Create a default filter and ensure tenant separation to delete all the points
                // associated with the data source.
                let mut filter = qdrant::Filter::default();
                self.apply_tenant_filter(data_source, &mut filter);

                self.client
                    .delete_points(
                        self.collection_name(data_source),
                        Some(vec![self.shard_key(data_source)]),
                        &filter.into(),
                        None,
                    )
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn collection_info(
        &self,
        data_source: &DataSource,
    ) -> Result<qdrant::GetCollectionInfoResponse> {
        self.client
            .collection_info(self.collection_name(data_source))
            .await
    }

    pub async fn delete_points(
        &self,
        data_source: &DataSource,
        mut filter: qdrant::Filter,
    ) -> Result<qdrant::PointsOperationResponse> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .delete_points(
                        self.collection_name(data_source),
                        None,
                        &filter.into(),
                        None,
                    )
                    .await
            }
            QdrantClusterVersion::V1 => {
                // Inject the `data_source_internal_id` to the filter to ensure tenant separation.
                self.apply_tenant_filter(data_source, &mut filter);

                self.client
                    .delete_points(
                        self.collection_name(data_source),
                        Some(vec![self.shard_key(data_source)]),
                        &filter.into(),
                        None,
                    )
                    .await
            }
        }
    }

    pub async fn scroll(
        &self,
        data_source: &DataSource,
        filter: Option<qdrant::Filter>,
        limit: Option<u32>,
        offset: Option<qdrant::PointId>,
        with_vectors: Option<qdrant::WithVectorsSelector>,
    ) -> Result<qdrant::ScrollResponse> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .scroll(&qdrant::ScrollPoints {
                        collection_name: self.collection_name(data_source),
                        with_vectors,
                        limit,
                        offset,
                        filter,
                        ..Default::default()
                    })
                    .await
            }
            QdrantClusterVersion::V1 => {
                // If we don't have a filter create an empty one to ensure tenant separation.
                let mut filter = filter.unwrap_or_default();
                self.apply_tenant_filter(data_source, &mut filter);

                self.client
                    .scroll(&qdrant::ScrollPoints {
                        collection_name: self.collection_name(data_source),
                        with_vectors,
                        limit,
                        offset,
                        filter: Some(filter),
                        shard_key_selector: Some(vec![self.shard_key(data_source)].into()),
                        ..Default::default()
                    })
                    .await
            }
        }
    }

    pub async fn search_points(
        &self,
        data_source: &DataSource,
        vector: Vec<f32>,
        filter: Option<qdrant::Filter>,
        limit: u64,
        with_payload: Option<qdrant::WithPayloadSelector>,
    ) -> Result<qdrant::SearchResponse> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .search_points(&qdrant::SearchPoints {
                        collection_name: self.collection_name(data_source),
                        vector,
                        filter,
                        limit,
                        with_payload,
                        ..Default::default()
                    })
                    .await
            }
            QdrantClusterVersion::V1 => {
                // If we don't have a filter create an empty one to ensure tenant separation.
                let mut filter = filter.unwrap_or_default();
                self.apply_tenant_filter(data_source, &mut filter);

                self.client
                    .search_points(&qdrant::SearchPoints {
                        collection_name: self.collection_name(data_source),
                        vector,
                        filter: Some(filter),
                        limit,
                        with_payload,
                        shard_key_selector: Some(vec![self.shard_key(data_source)].into()),
                        ..Default::default()
                    })
                    .await
            }
        }
    }

    pub async fn upsert_points(
        &self,
        data_source: &DataSource,
        points: Vec<qdrant::PointStruct>,
    ) -> Result<qdrant::PointsOperationResponse> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .upsert_points(self.collection_name(data_source), None, points, None)
                    .await
            }
            QdrantClusterVersion::V1 => {
                self.client
                    .upsert_points(
                        self.collection_name(data_source),
                        Some(vec![self.shard_key(data_source)]),
                        points,
                        None,
                    )
                    .await
            }
        }
    }

    pub async fn set_payload(
        &self,
        data_source: &DataSource,
        mut filter: qdrant::Filter,
        payload: Payload,
    ) -> Result<qdrant::PointsOperationResponse> {
        match version_for_cluster(self.cluster) {
            QdrantClusterVersion::V0 => {
                self.client
                    .set_payload(
                        self.collection_name(data_source),
                        None,
                        &filter.into(),
                        payload,
                        None,
                        None,
                    )
                    .await
            }
            QdrantClusterVersion::V1 => {
                // Inject the `data_source_internal_id` to the filter to ensure tenant separation.
                self.apply_tenant_filter(data_source, &mut filter);

                self.client
                    .set_payload(
                        self.collection_name(data_source),
                        Some(vec![self.shard_key(data_source)]),
                        &filter.into(),
                        payload,
                        None,
                        None,
                    )
                    .await
            }
        }
    }
}
