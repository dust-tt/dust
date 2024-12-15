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
    async fn index_document(&self, document_id: &str, document: &Document) -> Result<()>;
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
    async fn index_document(&self, document_id: &str, document: &Document) -> Result<()> {
        // elasticsearch needs to index a Node, not a Document
        let node = Node::new(
            &document.data_source_id,
            document_id,
            NodeType::Document,
            document.timestamp,
            &document.title,
            &document.mime_type,
            document.parent_id.clone(),
            document.parents.clone(),
        );

        self.client
            .index(IndexParts::IndexId(NODES_INDEX_NAME, document_id))
            .body(node)
            .send()
            .await?;
        Ok(())
    }
}
