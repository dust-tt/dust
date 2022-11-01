#[macro_use]
extern crate pest_derive;

#[derive(Parser)]
#[grammar = "dust.pest"]
pub struct DustParser;

pub mod stores {
    pub mod postgres;
    pub mod sqlite;
    pub mod store;
}
pub mod app;
pub mod dataset;
pub mod init;
pub mod project;
pub mod run;
pub mod utils;
pub mod providers {
    pub mod cohere;
    pub mod llm;
    pub mod openai;
    pub mod provider;
}
pub mod http {
    pub mod request;
}
pub mod blocks {
    pub mod block;
    pub mod code;
    pub mod data;
    pub mod input;
    pub mod llm;
    pub mod map;
    pub mod reduce;
    pub mod search;
    pub mod curl;
    pub mod web_scrape;
}
