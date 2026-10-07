use ::dfs_client::BlockingClient;
use anyhow::{Context, Result, ensure};
use clap::{Parser, ValueEnum};
use dfs_protocol::{
    MAX_MESSAGE,
    credentials::{read_key, write_private},
    rpc::*,
};
use std::{
    io::{Read, Write},
    path::PathBuf,
};

#[derive(Parser)]
#[command(
    version,
    about = "Call dfs gRPC with a JSON request on stdin (or --input)"
)]
struct Config {
    #[arg(long, env = "DFS_ENDPOINT", default_value = "http://127.0.0.1:8080")]
    endpoint: String,
    #[arg(long, env = "DFS_KEY_FILE")]
    key_file: PathBuf,
    #[arg(value_enum)]
    method: Method,
    #[arg(long)]
    input: Option<PathBuf>,
    /// Write a new mode-0600 JSON file. Required for returned tenant/session keys.
    #[arg(long)]
    output: Option<PathBuf>,
}
#[derive(Clone, ValueEnum)]
enum Method {
    CreateTenant,
    CreateSession,
    CurrentSession,
    CloseSession,
    ListGrants,
    UpdateGrants,
    Stat,
    Lookup,
    List,
    Create,
    Update,
    Rename,
    Remove,
    Read,
    Write,
    Validate,
    GetMetadata,
    ReadFiles,
    Search,
}
fn main() -> Result<()> {
    let config = Config::parse();
    ensure!(
        !matches!(config.method, Method::CreateTenant | Method::CreateSession)
            || config.output.is_some(),
        "--output is required when returning credentials"
    );
    if let Some(output) = &config.output {
        ensure!(!output.exists(), "output file already exists");
    }
    let source: Box<dyn Read> = match &config.input {
        Some(path) => Box::new(std::fs::File::open(path)?),
        None => Box::new(std::io::stdin()),
    };
    let mut input = String::new();
    source
        .take((MAX_MESSAGE + 1) as u64)
        .read_to_string(&mut input)?;
    ensure!(input.len() <= MAX_MESSAGE, "request too large");
    if input.trim().is_empty() {
        input = "{}".into();
    }
    let client = BlockingClient::connect(
        &config.endpoint,
        &read_key(&config.key_file).context("read key")?,
    )?;
    macro_rules! call {
        ($method:ident, $request:ty) => {{
            let request = serde_json::from_str::<$request>(&input).context("parse request JSON")?;
            serde_json::to_vec_pretty(&client.$method(request)?)?
        }};
    }
    let result = match config.method {
        Method::CreateTenant => call!(create_tenant, CreateTenantRequest),
        Method::CreateSession => call!(create_session, CreateSessionRequest),
        Method::CurrentSession => call!(current_session, Empty),
        Method::CloseSession => call!(close_session, Empty),
        Method::ListGrants => call!(list_grants, ListGrantsRequest),
        Method::UpdateGrants => call!(update_grants, UpdateGrantsRequest),
        Method::Stat => call!(stat, StatRequest),
        Method::Lookup => call!(lookup, LookupRequest),
        Method::List => call!(list, ListRequest),
        Method::Create => call!(create, CreateRequest),
        Method::Update => call!(update, UpdateRequest),
        Method::Rename => call!(rename, RenameRequest),
        Method::Remove => call!(remove, RemoveRequest),
        Method::Read => call!(read, ReadRequest),
        Method::Write => call!(write, WriteRequest),
        Method::Validate => call!(validate, ValidateRequest),
        Method::GetMetadata => call!(get_metadata, ObjectRequest),
        Method::ReadFiles => call!(read_files, ReadFilesRequest),
        Method::Search => call!(search, SearchRequest),
    };
    match config.output {
        Some(path) => write_private(&path, &result)?,
        None => {
            let mut out = std::io::stdout().lock();
            out.write_all(&result)?;
            out.write_all(b"\n")?;
        }
    }
    Ok(())
}
