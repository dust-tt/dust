use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::fmt;
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
    #[serde(rename = "cluster-0")]
    Cluster0,
}

// See: https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27
pub const SHARD_KEY_COUNT: u8 = 24;

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
            None => QdrantCluster::Cluster0,
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
    pub fn collection_prefix(&self) -> String {
        return String::from("c");
    }

    pub fn shard_key_prefix(&self) -> String {
        return String::from("key");
    }

    pub fn collection_name(&self, data_source: &DataSource) -> String {
        // The collection name depends on the embedding model which is stored on the
        // data source config. To allow migrations between embedders in the future we will
        // add a notion of shadow_write embedding provider/model on the data source config
        // that will have to be used here.
        format!(
            "{}_{}_{}",
            self.collection_prefix(),
            data_source.config().provider_id.to_string(),
            data_source.config().model_id,
        )
    }

    fn shard_key(&self, data_source: &DataSource) -> shard_key::Key {
        // We use the last character of the internal_id to determine the key_id. This id is
        // generated using new_id and is guaranteed random. Using the last character gives us a
        // path to moving data sources across shard when needed.
        let key_id = data_source.internal_id().chars().last().unwrap() as u8 % SHARD_KEY_COUNT;
        format!("{}_{}", self.shard_key_prefix(), key_id).into()
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

    pub async fn delete_data_source(&self, data_source: &DataSource) -> Result<()> {
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

    pub async fn scroll(
        &self,
        data_source: &DataSource,
        filter: Option<qdrant::Filter>,
        limit: Option<u32>,
        offset: Option<qdrant::PointId>,
        with_vectors: Option<qdrant::WithVectorsSelector>,
    ) -> Result<qdrant::ScrollResponse> {
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

    pub async fn search_points(
        &self,
        data_source: &DataSource,
        vector: Vec<f32>,
        filter: Option<qdrant::Filter>,
        limit: u64,
        with_payload: Option<qdrant::WithPayloadSelector>,
    ) -> Result<qdrant::SearchResponse> {
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

    pub async fn upsert_points(
        &self,
        data_source: &DataSource,
        points: Vec<qdrant::PointStruct>,
    ) -> Result<qdrant::PointsOperationResponse> {
        self.client
            .upsert_points(
                self.collection_name(data_source),
                Some(vec![self.shard_key(data_source)]),
                points,
                None,
            )
            .await
    }

    pub async fn set_payload(
        &self,
        data_source: &DataSource,
        mut filter: qdrant::Filter,
        payload: Payload,
    ) -> Result<qdrant::PointsOperationResponse> {
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

    pub fn raw_client(&self) -> Arc<QdrantClient> {
        return self.client.clone();
    }
}
