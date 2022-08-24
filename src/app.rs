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
///
/// Each block can be executed and their output represents a versioned block execution which is
/// cached on disk.
pub struct App {
    hash: String,
    blocks: Vec<(String, String, Box<dyn Block>)>,
}

impl App {
    pub async fn new() -> Result<Self> {
        let root_path = utils::init_check().await?;
        let spec_path = root_path.join("index.dust");

        let unparsed_file = async_std::fs::read_to_string(spec_path).await?;
        let parsed = DustParser::parse(Rule::dust, &unparsed_file)?
            .next()
            .unwrap();

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

                                let block = parse_block(block_type.unwrap(), pair)?;
                            }
                            _ => unreachable!(),
                        }
                    }
                }
                Rule::EOI => {}
                _ => unreachable!(),
            }
            //println!("{:?}\n", record);
        }

        Ok(App {
            hash: "".to_string(),
            blocks: vec![],
        })

        // let mut field_sum: f64 = 0.0;
        // let mut record_count: u64 = 0;

        // for record in file.into_inner() {
        //     match record.as_rule() {
        //         Rule::record => {
        //             record_count += 1;

        //             for field in record.into_inner() {
        //                 field_sum += field.as_str().parse::<f64>().unwrap();
        //             }
        //         }
        //         Rule::EOI => (),
        //         _ => unreachable!(),
        //     }
        // }
    }
}

pub async fn cmd_run(data_id: String) -> Result<()> {
    let app = App::new().await?;
    Ok(())
}
