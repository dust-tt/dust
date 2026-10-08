use super::*;

impl Engine {
    pub(super) async fn manifest(
        &self,
        batch: &PublicationBatch,
        node: &Node,
        version: &str,
    ) -> Result<Manifest> {
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        batch
            .load(&["manifest", &node.id, version])
            .await?
            .ok_or_else(|| err(libc::ESTALE, "manifest absent"))
    }

    async fn chunk(&self, batch: &PublicationBatch, chunk: &str) -> Result<Vec<u8>> {
        let stored: Chunk = batch
            .load(&["chunk", chunk])
            .await?
            .ok_or_else(|| err(libc::EIO, "chunk absent"))?;
        if stored.bytes.len() > CHUNK_BYTES || hash(&stored.bytes).as_slice() != stored.checksum {
            return Err(err(libc::EIO, "chunk checksum or length"));
        }
        Ok(stored.bytes)
    }

    pub(super) async fn save_chunk(
        &self,
        batch: &mut PublicationBatch,
        bytes: Vec<u8>,
    ) -> Result<Id> {
        let checksum = hash(&bytes).to_vec();
        let id = hex(&checksum);
        batch
            .save(&["chunk", &id], &Chunk { bytes, checksum })
            .await?;
        Ok(id)
    }

    pub(super) async fn save_file(
        &self,
        batch: &mut PublicationBatch,
        node: &Node,
        manifest: &Manifest,
    ) -> Result<()> {
        batch
            .save(&["manifest", &node.id, &node.version], manifest)
            .await?;
        batch.save(&["node", &node.id], node).await
    }

    pub(super) async fn checked_file(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        node: &str,
        base: &str,
        handle: Option<&str>,
    ) -> Result<Node> {
        let node = self.live_node(batch, session, node, handle, true).await?;
        self.require(batch, session, &node.id, WRITE).await?;
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        if node.version != base {
            return Err(err(libc::ESTALE, "version changed"));
        }
        Ok(node)
    }

    pub async fn read_blocks(
        &self,
        session: &str,
        ranges: &[BlockRead],
    ) -> Result<Vec<Result<BlockPage>>> {
        validate_block_reads(ranges)?;
        let context = self.context(session).await?;
        Ok(futures::future::join_all(
            ranges
                .iter()
                .map(|range| self.block_page(&context.batch, &context.record.session, range)),
        )
        .await)
    }

    async fn block_page(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        range: &BlockRead,
    ) -> Result<BlockPage> {
        let node = self
            .live_node(batch, session, &range.node, range.handle.as_deref(), false)
            .await?;
        self.require(batch, session, &node.id, READ).await?;
        let manifest = self.manifest(batch, &node, &range.version).await?;
        let end = range
            .offset
            .saturating_add(u64::from(range.size))
            .min(manifest.size);
        let first = range.offset / CHUNK_BYTES as u64;
        let mut page = BlockPage {
            node: range.node.clone(),
            version: range.version.clone(),
            size: manifest.size,
            first,
            hashes: Vec::new(),
            chunks: Vec::new(),
        };
        if end <= range.offset {
            return Ok(page);
        }
        let mut sent = std::collections::BTreeSet::new();
        for index in first..=(end - 1) / CHUNK_BYTES as u64 {
            let hash = manifest.chunks.get(&index).cloned();
            if let Some(id) = &hash
                && !range.known.contains(id)
                && sent.insert(id.clone())
            {
                let bytes = self.chunk(batch, id).await?;
                if bytes.len() > CHUNK_BYTES {
                    return Err(err(libc::EIO, "oversized block"));
                }
                page.chunks.push((id.clone(), bytes));
            }
            page.hashes.push(hash);
        }
        Ok(page)
    }

    pub async fn read(
        &self,
        session: &str,
        node: &str,
        version: Option<&str>,
        offset: u64,
        size: u32,
        handle: Option<&str>,
    ) -> Result<Vec<u8>> {
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "read size"));
        }
        let context = self.context(session).await?;
        let session = &context.record.session;
        let node = self
            .live_node(&context.batch, session, node, handle, false)
            .await?;
        self.require(&context.batch, session, &node.id, READ)
            .await?;
        let manifest = self
            .manifest(&context.batch, &node, version.unwrap_or(&node.version))
            .await?;
        self.read_manifest(&context.batch, &manifest, offset, size)
            .await
    }

    pub(super) async fn read_manifest(
        &self,
        batch: &PublicationBatch,
        manifest: &Manifest,
        offset: u64,
        size: u32,
    ) -> Result<Vec<u8>> {
        let end = offset.saturating_add(u64::from(size)).min(manifest.size);
        if offset >= end {
            return Ok(Vec::new());
        }
        let mut bytes = vec![0; (end - offset) as usize];
        let first = offset / CHUNK_BYTES as u64;
        let last = (end - 1) / CHUNK_BYTES as u64;
        for index in first..=last {
            if let Some(chunk) = manifest.chunks.get(&index) {
                let content = self.chunk(batch, chunk).await?;
                let chunk_start = index * CHUNK_BYTES as u64;
                let start = offset.max(chunk_start);
                let stop = end.min(chunk_start + content.len() as u64);
                if start < stop {
                    bytes[(start - offset) as usize..(stop - offset) as usize].copy_from_slice(
                        &content[(start - chunk_start) as usize..(stop - chunk_start) as usize],
                    );
                }
            }
        }
        Ok(bytes)
    }

    pub async fn read_pack(&self, session: &str, ranges: &[ReadRange]) -> Result<Vec<Vec<u8>>> {
        if ranges.is_empty()
            || ranges.len() > 64
            || ranges
                .iter()
                .map(|range| u64::from(range.size))
                .sum::<u64>()
                > MAX_IO_BYTES as u64
        {
            return Err(err(libc::E2BIG, "read pack capacity"));
        }
        let context = self.context(session).await?;
        let session = &context.record.session;
        let mut result = Vec::with_capacity(ranges.len());
        for range in ranges {
            let node = self
                .live_node(&context.batch, session, &range.node, None, false)
                .await?;
            self.require(&context.batch, session, &node.id, READ)
                .await?;
            let manifest = self.manifest(&context.batch, &node, &range.version).await?;
            result.push(
                self.read_manifest(&context.batch, &manifest, range.offset, range.size)
                    .await?,
            );
        }
        Ok(result)
    }

    pub(super) async fn write_content(
        &self,
        batch: &mut PublicationBatch,
        mut node: Node,
        offset: u64,
        data: &[u8],
        append: bool,
    ) -> Result<Node> {
        if data.len() > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "write size"));
        }
        let mut manifest = self.manifest(batch, &node, &node.version).await?;
        let offset = if append { manifest.size } else { offset };
        let end = offset
            .checked_add(data.len() as u64)
            .filter(|end| *end <= i64::MAX as u64)
            .ok_or_else(|| err(libc::EFBIG, "file size"))?;
        let mut consumed = 0;
        while consumed < data.len() {
            let position = offset + consumed as u64;
            let index = position / CHUNK_BYTES as u64;
            let start = (position % CHUNK_BYTES as u64) as usize;
            let count = (CHUNK_BYTES - start).min(data.len() - consumed);
            let mut bytes = match manifest.chunks.get(&index) {
                Some(chunk) => self.chunk(batch, chunk).await?,
                None => Vec::new(),
            };
            bytes.resize(bytes.len().max(start + count), 0);
            bytes[start..start + count].copy_from_slice(&data[consumed..consumed + count]);
            manifest
                .chunks
                .insert(index, self.save_chunk(batch, bytes).await?);
            consumed += count;
        }
        if !data.is_empty() {
            manifest.size = manifest.size.max(end);
        }
        node.version = id();
        node.size = manifest.size;
        node.mtime_ms = now_ms();
        self.save_file(batch, &node, &manifest).await?;
        Ok(node)
    }

    pub(super) async fn truncate_content(
        &self,
        batch: &mut PublicationBatch,
        mut node: Node,
        size: u64,
    ) -> Result<Node> {
        if size > i64::MAX as u64 {
            return Err(err(libc::EFBIG, "file size"));
        }
        let mut manifest = self.manifest(batch, &node, &node.version).await?;
        if size < manifest.size {
            manifest
                .chunks
                .retain(|index, _| index.saturating_mul(CHUNK_BYTES as u64) < size);
            let tail = (size % CHUNK_BYTES as u64) as usize;
            if tail != 0
                && let Some(chunk) = manifest.chunks.get(&(size / CHUNK_BYTES as u64))
            {
                let mut bytes = self.chunk(batch, chunk).await?;
                bytes.truncate(tail);
                manifest.chunks.insert(
                    size / CHUNK_BYTES as u64,
                    self.save_chunk(batch, bytes).await?,
                );
            }
        }
        manifest.size = size;
        node.version = id();
        node.size = size;
        node.mtime_ms = now_ms();
        self.save_file(batch, &node, &manifest).await?;
        Ok(node)
    }
}
