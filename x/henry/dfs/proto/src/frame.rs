//! Length-prefixed postcard frames over any async byte stream.

use serde::{Serialize, de::DeserializeOwned};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const MAX_FRAME_BYTES: usize = 8 << 20;

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("codec: {0}")]
    Codec(#[from] postcard::Error),
    #[error("frame of {0} bytes exceeds the limit")]
    TooLarge(usize),
}

pub fn encode<T: Serialize>(message: &T) -> Result<Vec<u8>, FrameError> {
    let body = postcard::to_stdvec(message)?;
    if body.len() > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(body.len()));
    }
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    Ok(out)
}

pub async fn write<W: AsyncWrite + Unpin, T: Serialize>(writer: &mut W, message: &T) -> Result<(), FrameError> {
    writer.write_all(&encode(message)?).await?;
    Ok(())
}

pub async fn read<R: AsyncRead + Unpin, T: DeserializeOwned>(reader: &mut R) -> Result<T, FrameError> {
    let mut length = [0u8; 4];
    reader.read_exact(&mut length).await?;
    let length = u32::from_le_bytes(length) as usize;
    if length > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(length));
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).await?;
    Ok(postcard::from_bytes(&body)?)
}
