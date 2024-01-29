use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use parking_lot::Mutex;
use qdrant_client::prelude::{QdrantClient, QdrantClientConfig};
use serde::{Deserialize, Serialize};

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
}

static QDRANT_CLUSTER_VARIANTS: &[QdrantCluster] = &[
    QdrantCluster::Main0,
    QdrantCluster::Dedicated0,
    QdrantCluster::Dedicated1,
    QdrantCluster::Dedicated2,
];

impl ToString for QdrantCluster {
    fn to_string(&self) -> String {
        match self {
            QdrantCluster::Main0 => String::from("main-0"),
            QdrantCluster::Dedicated0 => String::from("dedicated-0"),
            QdrantCluster::Dedicated1 => String::from("dedicated-1"),
            QdrantCluster::Dedicated2 => String::from("dedicated-2"),
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
    }
}

#[derive(Clone)]
pub struct QdrantClients {
    clients: Arc<Mutex<HashMap<QdrantCluster, Arc<QdrantClient>>>>,
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
                Ok::<_, anyhow::Error>((*cluster, Arc::new(client)))
            },
        ))
        .await?
        .into_iter()
        .collect::<HashMap<_, _>>();

        Ok(Self {
            clients: Arc::new(Mutex::new(clients)),
        })
    }

    pub fn client(&self, cluster: QdrantCluster) -> Arc<QdrantClient> {
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
    pub fn main_client(&self, config: &Option<QdrantDataSourceConfig>) -> Arc<QdrantClient> {
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
    ) -> Option<Arc<QdrantClient>> {
        match config {
            Some(c) => match c.shadow_write_cluster {
                Some(cluster) => Some(self.client(cluster)),
                None => None,
            },
            None => None,
        }
    }
}
