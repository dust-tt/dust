#[macro_use]
extern crate pest_derive;

#[derive(Parser)]
#[grammar = "dust.pest"]
pub struct DustParser;

pub mod stores {
    pub mod postgres;
    pub mod store;
}
pub mod search_stores {
    pub mod search_store;
    pub mod search_types;
}

pub mod app;
pub mod dataset;
pub mod data_sources {
    pub mod data_source;
    pub mod file_storage_document;
    pub mod folder;
    pub mod node;
    pub mod qdrant;
    pub mod splitter;
}
pub mod databases {
    pub mod csv;
    pub mod database;
    pub mod table;
    pub mod table_schema;
    pub mod remote_databases {
        pub mod bigquery;
        pub mod get_remote_database;
        pub mod remote_database;

        pub mod snowflake {
            pub mod api {
                pub mod auth;
                pub mod chunk;
                pub mod client;
                pub mod error;
                pub mod query;
                pub mod row;
                pub mod session;
            }
            pub mod snowflake;
        }
    }
    pub mod table_upserts_background_worker;
    pub mod transient_database;
}
pub mod gcp_auth;
pub mod project;
pub mod run;
pub mod search_filter;
pub mod utils;
pub mod providers {
    pub mod azure_openai;
    pub mod embedder;
    pub mod llm;
    pub mod mistral;
    pub mod openai;

    pub mod chat_messages;
    pub mod provider;
    pub mod tiktoken {
        pub mod tiktoken;
    }
    pub mod sentencepiece {
        pub mod sentencepiece;
    }
    pub mod anthropic {
        pub mod anthropic;
        pub mod backend;
        pub mod helpers;
        pub mod streaming;
        pub mod types;
    }
    pub mod deepseek;
    pub mod fireworks;
    pub mod google_ai_studio;
    pub mod helpers;
    pub mod openai_compatible_helpers;
    pub mod openai_responses_api_helpers;
    pub mod togetherai;
    pub mod xai;
}
pub mod http {
    pub mod network;
    pub mod proxy_client;
    pub mod request;
}
pub mod blocks {
    pub mod block;
    pub mod browser;
    pub mod chat;
    pub mod code;
    pub mod curl;
    pub mod data;
    pub mod data_source;
    pub mod database;
    pub mod database_schema;
    pub mod end;
    pub mod helpers;
    pub mod input;
    pub mod llm;
    pub mod map;
    pub mod reduce;
    pub mod search;
    pub mod r#while;
}

pub mod sqlite_workers {
    pub mod client;
    pub mod sqlite_database;
}

pub mod deno {
    pub mod js_executor;
}

pub mod databases_store {
    pub mod gcs;
    pub mod gcs_background;
    pub mod store;
}

pub mod cache;
pub mod cached_request;
pub mod consts;

pub mod oauth {
    pub mod app;
    pub mod client;
    pub mod connection;
    pub mod credential;
    pub mod encryption;
    pub mod store;

    pub mod providers {
        pub mod confluence;
        pub mod freshservice;
        pub mod github;
        pub mod gmail;
        pub mod gong;
        pub mod google_drive;
        pub mod hubspot;
        pub mod intercom;
        pub mod jira;
        pub mod mcp;
        pub mod mcp_static;
        pub mod microsoft;
        pub mod microsoft_tools;
        pub mod mock;
        pub mod monday;
        pub mod notion;
        pub mod salesforce;
        pub mod slack;
        pub mod utils;
        pub mod zendesk;
    }

    pub mod tests {
        pub mod utils;
    }
}

pub mod api_keys;

pub mod local_log_format;
pub mod open_telemetry;
pub mod otel_log_format;

pub mod mem_check;

pub mod api {
    pub mod api_state;
    pub mod data_sources;
    pub mod databases;
    pub mod datasets;
    pub mod projects;
    pub(crate) mod run_manager;
    pub mod runs;
    pub mod specifications;
    pub mod tables;
}
