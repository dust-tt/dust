use crate::{InvalidId, ObjectId, id::decode_error};
use prost::{
    DecodeError, Message,
    bytes::{Buf, BufMut},
    encoding::{self, DecodeContext, WireType},
};
use std::{fmt, str::FromStr};

/// @cc [owner:spolu,label:api;security] dfs-object-reference
/// References MUST distinguish real IDs, virtual root, and virtual shared in protobuf.
/// Missing references MUST remain invalid until populated; request consumers MUST call `validate`.
/// Text parsing and display MUST use ID strings, `root`, or `shared` for valid references.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ObjectRef {
    #[default]
    Invalid,
    Object(ObjectId),
    Root,
    Shared,
}

impl ObjectRef {
    pub fn validate(&self) -> Result<(), InvalidId> {
        match self {
            Self::Invalid => Err(InvalidId),
            Self::Object(id) => id.validate(),
            Self::Root | Self::Shared => Ok(()),
        }
    }

    pub fn real(&self) -> Result<ObjectId, InvalidId> {
        match self {
            Self::Object(id) => {
                id.validate()?;
                Ok(*id)
            }
            _ => Err(InvalidId),
        }
    }
}

impl From<ObjectId> for ObjectRef {
    fn from(id: ObjectId) -> Self {
        Self::Object(id)
    }
}

impl FromStr for ObjectRef {
    type Err = InvalidId;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "root" => Ok(Self::Root),
            "shared" => Ok(Self::Shared),
            _ => text.parse().map(Self::Object),
        }
    }
}

impl fmt::Display for ObjectRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid => f.write_str(""),
            Self::Object(id) => id.fmt(f),
            Self::Root => f.write_str("root"),
            Self::Shared => f.write_str("shared"),
        }
    }
}

impl Message for ObjectRef {
    fn encode_raw(&self, buf: &mut impl BufMut) {
        match self {
            Self::Invalid => {}
            Self::Object(id) => encoding::message::encode(1, id, buf),
            Self::Root => encoding::bool::encode(2, &true, buf),
            Self::Shared => encoding::bool::encode(3, &true, buf),
        }
    }

    fn merge_field(
        &mut self,
        tag: u32,
        wire: WireType,
        buf: &mut impl Buf,
        ctx: DecodeContext,
    ) -> Result<(), DecodeError> {
        match tag {
            1 => {
                let mut id = ObjectId::default();
                encoding::message::merge(wire, &mut id, buf, ctx)?;
                id.validate().map_err(|_| decode_error("expected UUIDv7"))?;
                *self = Self::Object(id);
            }
            2 | 3 => {
                let mut present = false;
                encoding::bool::merge(wire, &mut present, buf, ctx)?;
                if !present {
                    return Err(decode_error("virtual reference must be true"));
                }
                *self = if tag == 2 { Self::Root } else { Self::Shared };
            }
            _ => encoding::skip_field(wire, tag, buf, ctx)?,
        }
        Ok(())
    }

    fn encoded_len(&self) -> usize {
        match self {
            Self::Invalid => 0,
            Self::Object(id) => encoding::message::encoded_len(1, id),
            Self::Root | Self::Shared => 2,
        }
    }

    fn clear(&mut self) {
        *self = Self::Invalid;
    }
}
