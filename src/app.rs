use crate::blocks::block::{parse_block, Block, BlockType};
use crate::utils;
use crate::{DustParser, Rule};
use anyhow::{anyhow, Result};
use pest::Parser;
use std::str::FromStr;

/// An App is a collection of versioned Blocks.
///
/// Blocks are versioned by their hash (inner_hash) and the hash of their predecessor in the App
/// specification. The App hash is computed from its constituting blocks hashes.
pub struct App {
    hash: String,
    blocks: Vec<(String, String, Box<dyn Block>)>, // (hash, name, Block)
}

impl App {
    pub async fn new() -> Result<Self> {
        let root_path = utils::init_check().await?;
        let spec_path = root_path.join("index.dust");

        let unparsed_file = async_std::fs::read_to_string(spec_path).await?;
        let parsed = DustParser::parse(Rule::dust, &unparsed_file)?
            .next()
            .unwrap();

        // Block names and parsed instantiations.
        let mut blocks: Vec<(String, Box<dyn Block>)> = Vec::new();

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::block => {
                    let mut block_type: Option<BlockType> = None;
                    let mut block_name: Option<String> = None;
                    for pair in pair.into_inner() {
                        match pair.as_rule() {
                            Rule::block_type => {
                                block_type = Some(BlockType::from_str(pair.as_str())?);
                            }
                            Rule::block_name => {
                                block_name = Some(pair.as_str().to_string());
                            }
                            Rule::block_body => {
                                assert!(block_type.as_ref().is_some());
                                assert!(block_name.as_ref().is_some());

                                println!(
                                    "Entering block body for {} {}",
                                    block_type.unwrap().to_string(),
                                    block_name.as_ref().unwrap(),
                                );

                                blocks.push((
                                    block_name.as_ref().unwrap().clone(),
                                    parse_block(block_type.unwrap(), pair)?,
                                ));
                            }
                            _ => unreachable!(),
                        }
                    }
                }
                Rule::EOI => {}
                _ => unreachable!(),
            }
        }

        // Check that maps are matched by a reduce and that they are not nested.
        let mut current_map: Option<String> = None;
        for (name, block) in &blocks {
            if block.block_type() == BlockType::Map {
                if current_map.is_some() {
                    return Err(anyhow!(
                        "Nested maps are not currently supported, \
                         found `map {}` nested in `map {}`",
                        name,
                        current_map.unwrap()
                    ));
                } else {
                    current_map = Some(name.clone());
                }
            }
            if block.block_type() == BlockType::Reduce {
                match current_map.clone() {
                    None => {
                        Err(anyhow!(
                            "Block `reduce {}` is not matched by a previous `map {}` block",
                            name.as_str(),
                            name.as_str()
                        ))?;
                    }
                    Some(map) => {
                        if map.as_str() != name.as_str() {
                            Err(anyhow!(
                                "Block `reduce {}` does not match the current `map {}` block",
                                name.as_str(),
                                map.as_str()
                            ))?;
                        } else {
                            current_map = None;
                        }
                    }
                }
            }
        }

        // At this point the app looks valid (of course code blocks can fail in arbitrary ways).
        // Let's compute the hash of each block and the hash of the app.
        let mut hashes : Vec<String> = Vec::new();
        let mut prev_hash: String = "".to_string();
        for (name, block) in &blocks {
        }

        Ok(App {
            hash: "".to_string(),
            blocks: vec![],
        })
    }
}

pub async fn cmd_run(data_id: String) -> Result<()> {
    let app = App::new().await?;
    Ok(())
}
