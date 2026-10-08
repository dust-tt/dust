use dfs_poc::{model::*, rpc, wire::Frame};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct LegacyChunk {
    bytes: Vec<u8>,
    checksum: Vec<u8>,
}
#[derive(Serialize, Deserialize)]
struct LegacyUpdate {
    node: Node,
    base: Option<Id>,
    data: Vec<u8>,
}

#[test]
fn byte_encoding_preserves_existing_wire_and_storage_records() -> anyhow::Result<()> {
    let data: Vec<u8> = (0..(64 << 10)).map(|n| (n % 256) as u8).collect();
    let chunk = Chunk {
        bytes: data.clone(),
        checksum: vec![0, 128, 255],
    };
    let old = LegacyChunk {
        bytes: chunk.bytes.clone(),
        checksum: chunk.checksum.clone(),
    };
    assert_eq!(bincode::serialize(&chunk)?, bincode::serialize(&old)?);
    assert_eq!(
        bincode::deserialize::<Chunk>(&bincode::serialize(&old)?)?.bytes,
        data
    );
    assert_eq!(
        bincode::deserialize::<LegacyChunk>(&bincode::serialize(&chunk)?)?.bytes,
        data
    );
    let node = Node {
        id: id(),
        parent: Some(id()),
        name: "bytes".into(),
        kind: Kind::File,
        version: id(),
        entry_token: id(),
        size: data.len() as u64,
        mode: 0o600,
        mtime_ms: 42,
        unlinked: false,
    };
    let update = FileUpdate {
        node: node.clone(),
        base: None,
        data: data.clone(),
    };
    let old = LegacyUpdate {
        node: node.clone(),
        base: None,
        data: data.clone(),
    };
    assert_eq!(bincode::serialize(&update)?, bincode::serialize(&old)?);
    assert_eq!(
        bincode::deserialize::<FileUpdate>(&bincode::serialize(&old)?)?.data,
        data
    );
    let write = Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 9,
        data: data.clone(),
        append: false,
        handle: None,
    };
    let old = bincode::serialize(&(
        1u32,
        &node.id,
        &node.version,
        9u64,
        &data,
        false,
        None::<Id>,
    ))?;
    assert_eq!(bincode::serialize(&write)?, old);
    let Mutation::Write { data: decoded, .. } = bincode::deserialize(&old)? else {
        panic!("write tag");
    };
    assert_eq!(decoded, data);
    let old = bincode::serialize(&(7u32, &data))?;
    assert_eq!(bincode::serialize(&Reply::Data(data.clone()))?, old);
    let Reply::Data(decoded) = bincode::deserialize(&old)? else {
        panic!("data tag");
    };
    assert_eq!(decoded, data);
    let packs = vec![data.clone(), Vec::new(), vec![255, 0, 128]];
    let old = bincode::serialize(&(8u32, &packs))?;
    assert_eq!(bincode::serialize(&Reply::Pack(packs.clone()))?, old);
    let Reply::Pack(decoded) = bincode::deserialize(&old)? else {
        panic!("pack tag");
    };
    assert_eq!(decoded, packs);
    let page = BlockPage {
        node: node.id,
        version: node.version,
        size: 65536,
        first: 0,
        hashes: vec![Some("chunk".into()), None],
        chunks: vec![("chunk".into(), data.clone())],
    };
    let old = bincode::serialize(&(
        &page.node,
        &page.version,
        page.size,
        page.first,
        &page.hashes,
        &page.chunks,
    ))?;
    assert_eq!(bincode::serialize(&page)?, old);
    assert_eq!(bincode::deserialize::<BlockPage>(&old)?.chunks, page.chunks);
    Ok(())
}

#[test]
fn oversized_declared_byte_length_respects_decode_limit() {
    let frame = Frame {
        payload: u64::MAX.to_le_bytes().to_vec(),
    };
    assert!(rpc::decode::<Chunk>(frame).is_err());
}
