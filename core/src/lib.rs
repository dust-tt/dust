#[macro_use]
extern crate pest_derive;
//extern crate pest;
//use pest::Parser;

#[derive(Parser)]
#[grammar = "dust.pest"]
pub struct DustParser;

pub mod stores {
    pub mod store;
    pub mod sqlite;
    pub mod postgres;
}
pub mod project;
pub mod app;
pub mod run;
pub mod dataset;
pub mod init;
pub mod utils;
pub mod providers {
    pub mod llm;
    pub mod openai;
    pub mod cohere;
    pub mod provider;
}
pub mod blocks {
    pub mod block;
    pub mod input;
    pub mod data;
    pub mod code;
    pub mod llm;
    pub mod map;
    pub mod reduce;
}