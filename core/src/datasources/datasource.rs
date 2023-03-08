use crate::datasources::splitter::{splitter, SplitterID};
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::{anyhow, Result};
use cloud_storage::{Bucket, NewBucket, Object};
use futures::try_join;
use futures::StreamExt;
use futures::TryStreamExt;
use qdrant_client::{
    prelude::{QdrantClient, QdrantClientConfig},
    qdrant,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::slice::Iter;

/// A Chunk is a subset of a document that was inserted into vector search db. `hash` covers both the
/// chunk text and the parent document metadata (inserted into pinecone on each chunk to leverage
/// metadata filters there).
pub struct Chunk {
    pub created: u64,
    pub text: String,
    pub hash: String,
    pub vector: Option<Vec<f64>>,
    pub score: Option<f64>,
}

/// Document is used as a data-strucutre for insertion into the SQL store and vector search db. It
/// is also used as a result from search (only the retrieved chunks are provided in the result).
/// `hash` covers both the original document id and text and the document metadata and is used to
/// no-op in case of match.
pub struct Document {
    pub created: u64,
    pub document_id: String,
    pub metadata: Value,
    pub hash: String,
    pub chunks: Vec<Chunk>,
}

impl Document {
    pub fn new(document_id: &str, metadata: &Value, hash: &str) -> Result<Self> {
        Ok(Document {
            created: utils::now(),
            document_id: document_id.to_string(),
            metadata: metadata.clone(),
            hash: hash.to_string(),
            chunks: vec![],
        })
    }
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct DataSourceConfig {
    pub provider_id: ProviderID,
    pub model_id: String,
    pub extras: Option<Value>,
    pub splitter_id: SplitterID,
    pub max_chunk_size: usize,
}

/// The `data_source_id` is the unique identifier that allows routing to the right data in SQL store
/// as well as vector search db. It is a generated unique ID.
#[derive(Debug, Serialize)]
pub struct DataSource {
    created: u64,
    data_source_id: String,
    config: DataSourceConfig,
}

impl DataSource {
    pub fn new(config: &DataSourceConfig) -> Self {
        return DataSource {
            created: utils::now(),
            data_source_id: utils::new_id(),
            config: config.clone(),
        };
    }

    fn qdrant_collection(&self) -> String {
        "data_sources".to_string()
    }

    async fn qdrant_client(&self) -> Result<QdrantClient> {
        match std::env::var("QDRANT_URL") {
            Ok(url) => {
                let mut config = QdrantClientConfig::from_url(&url);
                match std::env::var("QDRANT_API_KEY") {
                    Ok(api_key) => {
                        config.set_api_key(&api_key);
                        QdrantClient::new(Some(config)).await
                    }
                    Err(_) => Err(anyhow!("QDRANT_API_KEY is not set"))?,
                }
            }
            Err(_) => Err(anyhow!("QDRANT_URL is not set"))?,
        }
    }

    async fn create_qdrant_collection(&self, client: &QdrantClient) -> Result<()> {
        let embedder = provider(self.config.provider_id).embedder(self.config.model_id.clone());

        client
            .create_collection(&qdrant::CreateCollection {
                collection_name: self.qdrant_collection(),
                vectors_config: Some(qdrant::VectorsConfig {
                    config: Some(qdrant::vectors_config::Config::Params(
                        qdrant::VectorParams {
                            size: embedder.embedding_size() as u64,
                            distance: qdrant::Distance::Cosine.into(),
                        },
                    )),
                }),
                hnsw_config: Some(qdrant::HnswConfigDiff {
                    m: Some(0),
                    payload_m: Some(16),
                    ..Default::default()
                }),
                on_disk_payload: Some(true),
                ..Default::default()
            })
            .await?;

        let r = client
            .create_field_index(
                self.qdrant_collection(),
                "__data_source_id",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let r = client
            .create_field_index(
                self.qdrant_collection(),
                "__document_id",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        Ok(())
    }

    async fn ensure_qdrant_collection(&self, client: &QdrantClient) -> Result<()> {
        // Errors if the collection does not exist? Must be created manually.
        let _ = client.collection_info(self.qdrant_collection()).await?;
        Ok(())
    }

    async fn upsert(
        &self,
        credentials: Credentials,
        document_id: &str,
        text: &str,
        metadata: Value,
        // add store
    ) -> Result<()> {
        // Validate that metadata is a string to string map and flatten it.
        let flattened_metadata = match metadata.clone() {
            Value::Object(o) => o
                .keys()
                .map(|k| match k.as_str() {
                    "__data_source_id" | "__document_id_hash" | "__document_id" | "__text" => {
                        Err(anyhow!(
                            "Document `metadata` keys cannot be any of
                            `__data_source_id`, `__document_id_hash`, `__document_id`, `__text`"
                        ))
                    }
                    _ => match o.get(k) {
                        Some(v) => match v {
                            Value::String(s) => Ok((k.as_str(), s.clone().into())),
                            _ => Err(anyhow!(
                                "Document `metadata` must be a string to string map"
                            )),
                        },
                        None => Err(anyhow!(
                            "Document `metadata` must be a string to string map"
                        )),
                    },
                })
                .collect::<Result<HashMap<&str, qdrant::Value>>>()?,
            _ => Err(anyhow!(
                "Document `metadata` must be a string to string map"
            ))?,
        };

        // Hash document.
        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        hasher.update(text.as_bytes());
        hasher.update(metadata.to_string().as_bytes());
        let document_hash = format!("{}", hasher.finalize().to_hex());

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        let mut document = Document::new(document_id, &metadata, &document_hash)?;

        // GCP store raw text, metadata and document_id.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!("{}/{}", self.data_source_id, document_id_hash);

        let document_id_path = format!("{}/document_id.txt", bucket_path);
        let object_path = format!("{}/{}/content.txt", bucket_path, document_hash);
        let metadata_path = format!("{}/{}/metadata.json", bucket_path, document_hash);

        let _ = try_join!(
            Object::create(
                &bucket,
                document_id.as_bytes().to_vec(),
                &document_id_path,
                "application/text",
            ),
            Object::create(
                &bucket,
                text.as_bytes().to_vec(),
                &object_path,
                "application/text",
            ),
            Object::create(
                &bucket,
                metadata.to_string().as_bytes().to_vec(),
                &metadata_path,
                "application/json",
            )
        )?;

        // Get qdrant client and ensure collection exists.
        let qdrant_client = self.qdrant_client().await?;
        self.ensure_qdrant_collection(&qdrant_client).await?;

        // Split text in chunks.
        let splits = splitter(self.config.splitter_id)
            .split(
                credentials.clone(),
                self.config.provider_id,
                &self.config.model_id,
                self.config.max_chunk_size,
                text,
            )
            .await?;

        // Embed chunks with max concurrency of 8.
        let e = futures::stream::iter(splits.into_iter())
            .map(|s| {
                let provider_id = self.config.provider_id.clone();
                let model_id = self.config.model_id.clone();
                let credentials = credentials.clone();
                let extras = self.config.extras.clone();
                tokio::spawn(async move {
                    let mut embedder = provider(provider_id).embedder(model_id);
                    embedder.initialize(credentials).await?;
                    let v = embedder.embed(&s, extras).await?;
                    Ok((s, v))
                })
            })
            .buffer_unordered(16)
            .map(|r| match r {
                Err(e) => Err(anyhow!("DataSource chunk embedding error: {}", e))?,
                Ok(r) => r,
            })
            .try_collect::<Vec<_>>()
            .await?;

        // Clean-up previous document chunks (vector search db).
        let _ = qdrant_client
            .delete_points(
                self.qdrant_collection(),
                &qdrant::Filter {
                    must_not: vec![],
                    should: vec![],
                    must: vec![
                        qdrant::FieldCondition {
                            key: "__data_source_id".to_string(),
                            r#match: Some(qdrant::Match {
                                match_value: Some(qdrant::r#match::MatchValue::Keyword(
                                    self.data_source_id.clone(),
                                )),
                            }),
                            ..Default::default()
                        }
                        .into(),
                        qdrant::FieldCondition {
                            key: "__document_id_hash".to_string(),
                            r#match: Some(qdrant::Match {
                                match_value: Some(qdrant::r#match::MatchValue::Keyword(
                                    document_id_hash.clone(),
                                )),
                            }),
                            ..Default::default()
                        }
                        .into(),
                    ],
                }
                .into(),
                None,
            )
            .await?;

        // Insert new chunks (vector search db).
        let points = e
            .into_iter()
            .map(|(s, v)| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(document_hash.as_bytes());
                hasher.update(s.as_bytes());

                let payload = flattened_metadata.clone();
                payload["__data_source_id"] = self.data_source_id.into();
                payload["__document_id_hash"] = document_id_hash.into();
                payload["__document_id"] = document_id.into();
                payload["__text"] = s.into();

                let chunk_hash = format!("{}", hasher.finalize().to_hex());
                qdrant::PointStruct::new(
                    chunk_hash,
                    v.vector.into_iter().map(|v| v as f32).collect::<Vec<f32>>(),
                    payload.into(),
                )
            })
            .collect::<Vec<_>>();
        let _ = qdrant_client
            .upsert_points(self.qdrant_collection(), points, None)
            .await?;

        // Upsert document (SQL)

        Ok(())
    }

    async fn search(
        &self,
        credentials: Credentials,
        query: &str,
        top_k: usize,
        metadata_filter: Option<Value>,
    ) -> Result<Vec<Document>> {
        unimplemented!()
    }

    async fn delete(&self, document_id: &str) -> Result<()> {
        unimplemented!()
    }
}
