use anyhow::Result;
use async_trait::async_trait;
use elasticsearch::{
    auth::Credentials,
    http::transport::{SingleNodeConnectionPool, TransportBuilder},
    Elasticsearch, IndexParts,
};
use url::Url;

use crate::data_sources::data_source::Document;
use crate::data_sources::node::{Node, NodeType};

#[async_trait]
pub trait SearchStore {
    async fn index_document(&self, document: &Document) -> Result<()>;
    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send>;
}

impl Clone for Box<dyn SearchStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

#[derive(Clone)]
pub struct ElasticsearchSearchStore {
    pub client: Elasticsearch,
}

impl ElasticsearchSearchStore {
    pub async fn new(es_uri: &str, username: &str, password: &str) -> Result<Self> {
        let credentials = Credentials::Basic(username.to_string(), password.to_string());
        let u = Url::parse(es_uri)?;
        let conn_pool = SingleNodeConnectionPool::new(u);
        let mut transport_builder = TransportBuilder::new(conn_pool);
        transport_builder = transport_builder
            .auth(credentials)
            .disable_proxy()
            .cert_validation(elasticsearch::cert::CertificateValidation::None);
        let transport = transport_builder.build()?;
        let client = Elasticsearch::new(transport);
        Ok(Self { client })
    }
}

const NODES_INDEX_NAME: &str = "core.data_sources_nodes";

#[async_trait]
impl SearchStore for ElasticsearchSearchStore {
    async fn index_document(&self, document: &Document) -> Result<()> {
        // elasticsearch needs to index a Node, not a Document
        let node = Node::from(document.clone());

        // safety for rollout: we only index one time on five
        // TODO(kw-search): remove this once prod testing is ok
        if rand::thread_rng().gen_bool(0.8) {
            return Ok(());
        }

        self.client
            .index(IndexParts::IndexId(NODES_INDEX_NAME, &document.document_id))
            .timeout("200ms")
            .body(node)
            .send()
            .await?;
        Ok(())
    }

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send> {
        Box::new(self.clone())
    }
}
