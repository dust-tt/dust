use serde::{Deserialize, Serialize};

use crate::data_sources::node::Node;

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct Folder {
    pub node: Node,
}
