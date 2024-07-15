use anyhow::Result;
use lazy_static::lazy_static;
use parking_lot::RwLock;
use rayon::prelude::*;
use sentencepiece::{SentencePieceError, SentencePieceProcessor};
use std::sync::Arc;
use tokio::task;

pub fn mistral_tokenizer_model_v1_base() -> Result<SentencePieceProcessor> {
    let bytes = include_bytes!("mistral-tokenizer.model.v1");
    let spp =
        SentencePieceProcessor::from_serialized_proto(bytes).map_err(|e| anyhow::anyhow!(e))?;

    Ok(spp)
}

pub fn mistral_instruct_tokenizer_240216_model_v2_base() -> Result<SentencePieceProcessor> {
    let bytes = include_bytes!("mistral-instruct_tokenizer_240216.model.v2");
    let spp =
        SentencePieceProcessor::from_serialized_proto(bytes).map_err(|e| anyhow::anyhow!(e))?;

    Ok(spp)
}

pub fn mistral_instruct_tokenizer_240216_model_v3_base() -> Result<SentencePieceProcessor> {
    let bytes = include_bytes!("mistral-instruct_tokenizer_240216.model.v3");
    let spp =
        SentencePieceProcessor::from_serialized_proto(bytes).map_err(|e| anyhow::anyhow!(e))?;

    Ok(spp)
}

pub fn mistral_tokenizer_model_v1_base_singleton() -> Arc<RwLock<SentencePieceProcessor>> {
    lazy_static! {
        static ref SPP: Arc<RwLock<SentencePieceProcessor>> = {
            let spp = mistral_tokenizer_model_v1_base().unwrap();
            Arc::new(RwLock::new(spp))
        };
    }

    SPP.clone()
}

pub fn mistral_instruct_tokenizer_240216_model_v2_base_singleton(
) -> Arc<RwLock<SentencePieceProcessor>> {
    lazy_static! {
        static ref SPP: Arc<RwLock<SentencePieceProcessor>> = {
            let spp = mistral_instruct_tokenizer_240216_model_v2_base().unwrap();
            Arc::new(RwLock::new(spp))
        };
    }

    SPP.clone()
}

pub fn mistral_instruct_tokenizer_240216_model_v3_base_singleton(
) -> Arc<RwLock<SentencePieceProcessor>> {
    lazy_static! {
        static ref SPP: Arc<RwLock<SentencePieceProcessor>> = {
            let spp = mistral_instruct_tokenizer_240216_model_v3_base().unwrap();
            Arc::new(RwLock::new(spp))
        };
    }

    SPP.clone()
}

pub async fn encode_async(
    spp: Arc<RwLock<SentencePieceProcessor>>,
    text: &str,
) -> Result<Vec<usize>> {
    let text = text.to_string();
    let r = task::spawn_blocking(move || spp.read().encode(&text)).await??;

    Ok(r.into_iter().map(|p| p.id as usize).collect::<Vec<_>>())
}

pub async fn decode_async(
    spp: Arc<RwLock<SentencePieceProcessor>>,
    tokens: Vec<usize>,
) -> Result<String> {
    let r = task::spawn_blocking(move || {
        spp.read()
            .decode_piece_ids(&tokens.into_iter().map(|t| t as u32).collect::<Vec<_>>())
    })
    .await??;

    Ok(r)
}

// We use the Rayon thread pool to parallelize the tokenization of multiple texts (which is a CPU bound task)
// Rayon is a better fit than Tokio spawn_blocking because it is optimized for CPU-bound tasks (Tokio's blocking pool has a large number
// of threads, making it less efficient for CPU-bound tasks).
// We still need to use spawn_blocking at the top level to avoid blocking the Tokio event loop.
pub async fn batch_tokenize_async(
    ssp: Arc<RwLock<SentencePieceProcessor>>,
    texts: Vec<String>,
) -> Result<Vec<Vec<(usize, String)>>> {
    let r = tokio::task::spawn_blocking(move || {
        texts
            .par_iter()
            .map(|text| {
                let guard = ssp.read();
                guard.encode(&text).map(|p| {
                    p.into_iter()
                        .map(|p| (p.id as usize, p.piece.clone()))
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Result<Vec<Vec<(usize, String)>>, SentencePieceError>>()
            .map_err(|e| anyhow::anyhow!(e))
    })
    .await??;

    Ok(r)
}
