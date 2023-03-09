use crate::datasources::splitter::{splitter, SplitterID};
use crate::project::Project;
use crate::providers::embedder::{EmbedderRequest, EmbedderVector};
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::{anyhow, Result};
use cloud_storage::Object;
use futures::try_join;
use futures::StreamExt;
use futures::TryStreamExt;
use qdrant_client::{
    prelude::{Payload, QdrantClient, QdrantClientConfig},
    qdrant,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A Chunk is a subset of a document that was inserted into vector search db. `hash` covers both
/// the chunk text and the parent document tags (inserted into vector db search on each chunk to
/// leverage tags filtering there). It is used as unique ID for the chunk in vector search db.
pub struct Chunk {
    pub text: String,
    pub hash: String,
    pub offset: usize,
    pub vector: Option<Vec<f64>>,
    pub score: Option<f64>,
}

/// Document is used as a data-strucutre for insertion into the SQL store (no chunks, they are
/// directly inserted in the vector search db). It is also used as a result from search (only the
/// retrieved chunks are provided in the result). `hash` covers both the original document id and
/// text and the document metadata and is used to no-op in case of match.
pub struct Document {
    pub created: u64,
    pub document_id: String,
    pub timestamp: u64,
    pub tags: Vec<String>,
    pub hash: String,
    pub text_size: u64,
    pub chunk_count: usize,
    pub chunks: Vec<Chunk>,
}

impl Document {
    pub fn new(
        document_id: &str,
        timestamp: u64,
        tags: &Vec<String>,
        hash: &str,
        text_size: u64,
    ) -> Result<Self> {
        Ok(Document {
            created: utils::now(),
            document_id: document_id.to_string(),
            timestamp,
            tags: tags.clone(),
            hash: hash.to_string(),
            text_size,
            chunk_count: 0,
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
    pub use_cache: bool,
}

/// The `data_source_id` is the unique identifier that allows routing to the right data in SQL store
/// as well as vector search db. It is a generated unique ID.
#[derive(Debug, Serialize)]
pub struct DataSource {
    project: Project,
    created: u64,
    data_source_id: String,
    internal_id: String,
    config: DataSourceConfig,
}

impl DataSource {
    pub fn new(project: &Project, data_source_id: &str, config: &DataSourceConfig) -> Self {
        DataSource {
            project: project.clone(),
            created: utils::now(),
            data_source_id: data_source_id.to_string(),
            internal_id: utils::new_id(),
            config: config.clone(),
        }
    }

    pub fn new_from_store(
        project: &Project,
        created: u64,
        data_source_id: &str,
        internal_id: &str,
        config: &DataSourceConfig,
    ) -> Self {
        DataSource {
            project: project.clone(),
            created,
            data_source_id: data_source_id.to_string(),
            internal_id: internal_id.to_string(),
            config: config.clone(),
        }
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }

    pub fn internal_id(&self) -> &str {
        &self.internal_id
    }

    pub fn config(&self) -> &DataSourceConfig {
        &self.config
    }

    fn qdrant_collection(&self) -> String {
        format!("ds_{}", self.internal_id)
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

    async fn ensure_qdrant_collection(&self, client: &QdrantClient) -> Result<()> {
        // Errors if the collection does not exist? Must be created manually.
        let _ = client.collection_info(self.qdrant_collection()).await?;
        Ok(())
    }

    async fn setup(&self) -> Result<()> {
        let embedder = provider(self.config.provider_id).embedder(self.config.model_id.clone());

        // GCP store created data to test GCP.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!("{}/{}", self.project.project_id(), self.internal_id,);
        let data_source_created_path = format!("{}/created.txt", bucket_path);

        Object::create(
            &bucket,
            format!("{}", self.created).as_bytes().to_vec(),
            &data_source_created_path,
            "application/text",
        )
        .await?;

        // Qdrant create collection.
        let qdrant_client = self.qdrant_client().await?;
        qdrant_client
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
                    m: Some(16),
                    ..Default::default()
                }),
                optimizers_config: Some(qdrant::OptimizersConfigDiff {
                    memmap_threshold: Some(1024),
                    ..Default::default()
                }),
                // We keep the entire payload on disk and index on document_id and tags.
                on_disk_payload: Some(true),
                ..Default::default()
            })
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "document_id_hash",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "tags",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "timestamp",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        Ok(())
    }

    async fn upsert(
        &self,
        credentials: Credentials,
        store: Box<dyn Store + Sync + Send>,
        document_id: &str,
        timestamp: Option<u64>,
        tags: &Vec<String>,
        text: &str,
    ) -> Result<Document> {
        let store = store.clone();

        let timestamp = match timestamp {
            Some(timestamp) => timestamp,
            None => utils::now(),
        };

        // Hash document.
        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        hasher.update(text.as_bytes());
        hasher.update(format!("{}", timestamp).as_bytes());
        tags.iter().for_each(|tag| {
            hasher.update(tag.as_bytes());
        });
        let document_hash = format!("{}", hasher.finalize().to_hex());

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        let mut document = Document::new(
            document_id,
            timestamp,
            tags,
            &document_hash,
            text.len() as u64,
        )?;

        // GCP store raw text and document_id.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!(
            "{}/{}/{}",
            self.project.project_id(),
            self.internal_id,
            document_id_hash
        );

        let document_id_path = format!("{}/document_id.txt", bucket_path);
        let content_path = format!("{}/{}/content.txt", bucket_path, document_hash);
        let tags_path = format!("{}/{}/tags.json", bucket_path, document_hash);
        let timestamp_path = format!("{}/{}/timestamp.txt", bucket_path, document_hash);

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
                &content_path,
                "application/text",
            ),
            Object::create(
                &bucket,
                serde_json::to_string(tags).unwrap().as_bytes().to_vec(),
                &tags_path,
                "application/json",
            ),
            Object::create(
                &bucket,
                format!("{}", timestamp).as_bytes().to_vec(),
                &timestamp_path,
                "application/text",
            ),
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
                    let r = EmbedderRequest::new(provider_id, &model_id, &s, extras);
                    let v = r.execute(credentials).await?;
                    Ok::<(std::string::String, EmbedderVector), anyhow::Error>((s, v))
                })
            })
            .buffer_unordered(16)
            .map(|r| match r {
                Err(e) => Err(anyhow!("DataSource chunk embedding error: {}", e))?,
                Ok(r) => r,
            })
            .try_collect::<Vec<_>>()
            .await?;

        document.chunks = e
            .into_iter()
            .enumerate()
            .map(|(i, (s, v))| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(document_hash.as_bytes());
                hasher.update(s.as_bytes());
                let hash = format!("{}", hasher.finalize().to_hex());

                Chunk {
                    text: s,
                    hash,
                    offset: i,
                    vector: Some(v.vector),
                    score: None,
                }
            })
            .collect::<Vec<_>>();
        document.chunk_count = document.chunks.len();

        // Clean-up previous document chunks (vector search db).
        let _ = qdrant_client
            .delete_points(
                self.qdrant_collection(),
                &qdrant::Filter {
                    must_not: vec![],
                    should: vec![],
                    must: vec![qdrant::FieldCondition {
                        key: "document_id_hash".to_string(),
                        r#match: Some(qdrant::Match {
                            match_value: Some(qdrant::r#match::MatchValue::Keyword(
                                document_id_hash.clone(),
                            )),
                        }),
                        ..Default::default()
                    }
                    .into()],
                }
                .into(),
                None,
            )
            .await?;

        // Insert new chunks (vector search db).
        let points = document
            .chunks
            .iter()
            .map(|c| {
                let mut payload = Payload::new();
                payload.insert("tags", tags.clone());
                payload.insert("timetamp", document.timestamp as i64);
                payload.insert("chunk_offset", c.offset as i64);
                payload.insert("data_source_id", self.data_source_id.clone());
                payload.insert("data_source_internal_id", self.internal_id.clone());
                payload.insert("document_id", document_id);
                payload.insert("document_id_hash", document_id_hash.clone());
                payload.insert("text", c.text.clone());

                qdrant::PointStruct::new(
                    c.hash.clone(),
                    c.vector
                        .as_ref()
                        .unwrap()
                        .iter()
                        .map(|v| *v as f32)
                        .collect::<Vec<f32>>(),
                    payload,
                )
            })
            .collect::<Vec<_>>();
        let _ = qdrant_client
            .upsert_points(self.qdrant_collection(), points, None)
            .await?;

        // Upsert document (SQL)
        store
            .upsert_data_source_document(&self.project, &self.data_source_id, &document)
            .await?;

        Ok(document)
    }

    async fn search(
        &self,
        _credentials: Credentials,
        _query: &str,
        _top_k: usize,
        _metadata_filter: Option<Value>,
    ) -> Result<Vec<Document>> {
        unimplemented!()
    }

    async fn delete(&self, _document_id: &str) -> Result<()> {
        unimplemented!()
    }
}

pub async fn cmd_register(data_source_id: &str, config: &DataSourceConfig) -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(1);

    let ds = DataSource::new(&project, data_source_id, config);

    ds.setup().await?;
    store.register_data_source(&project, &ds).await?;

    utils::done(&format!("Registered data_source `{}`", ds.data_source_id(),));

    Ok(())
}

pub async fn cmd_upsert(
    data_source_id: &str,
    document_id: &str,
    timestamp: Option<u64>,
    tags: &Vec<String>,
    text_path: &str,
) -> Result<()> {
    let root_path = utils::init_check().await?;
    let store = SQLiteStore::new(root_path.join("store.sqlite"))?;
    store.init().await?;
    let project = Project::new_from_id(1);

    let ds = match store.load_data_source(&project, data_source_id).await? {
        Some(ds) => ds,
        None => Err(anyhow!("Data source `{}` not found", data_source_id))?,
    };

    let text_path = &shellexpand::tilde(text_path).into_owned();
    let text_path = std::path::Path::new(text_path);

    let contents = async_fs::read(text_path).await?;
    let text = std::str::from_utf8(&contents)?;

    let d = ds
        .upsert(
            Credentials::new(),
            Box::new(store.clone()),
            document_id,
            timestamp,
            tags,
            text,
        )
        .await?;

    utils::done(&format!(
        "Upserted document: data_source={} document_id={} text_length={} chunk_count={}",
        ds.data_source_id(),
        document_id,
        text.len(),
        d.chunks.len(),
    ));

    Ok(())
}
