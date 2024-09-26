use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use ring::{
    aead,
    rand::{self, SecureRandom},
};
use std::env;

use lazy_static::lazy_static;

lazy_static! {
    static ref ENCRYPTION_KEY: aead::LessSafeKey = {
        let encoded_key = env::var("OAUTH_ENCRYPTION_KEY").unwrap();
        let key_bytes = general_purpose::STANDARD.decode(&encoded_key).unwrap();
        let unbound_key = aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &key_bytes).unwrap();
        aead::LessSafeKey::new(unbound_key)
    };
}

pub fn seal_str(s: &str) -> Result<Vec<u8>> {
    let key = &ENCRYPTION_KEY;
    let rng = rand::SystemRandom::new();

    let mut nonce_bytes = [0u8; aead::NONCE_LEN];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| anyhow::anyhow!("Nonce generation failed"))?;
    let nonce = aead::Nonce::assume_unique_for_key(nonce_bytes);

    let mut combined = nonce.as_ref().to_vec();

    let mut in_out = s.as_bytes().to_vec();
    let tag = key
        .seal_in_place_separate_tag(nonce, aead::Aad::empty(), &mut in_out)
        .map_err(|_| anyhow::anyhow!("Encryption failed"))?;

    combined.append(&mut in_out);
    combined.extend_from_slice(tag.as_ref());

    Ok(combined)
}

pub fn unseal_str(encrypted_data: &[u8]) -> Result<String> {
    let key = &ENCRYPTION_KEY;

    let nonce_bytes = &encrypted_data[0..aead::NONCE_LEN];
    let ciphertext_and_tag = &encrypted_data[aead::NONCE_LEN..];

    let nonce = aead::Nonce::try_assume_unique_for_key(nonce_bytes)
        .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;
    let mut in_out = ciphertext_and_tag.to_vec();

    key.open_in_place(nonce, aead::Aad::empty(), &mut in_out)
        .map_err(|_| anyhow::anyhow!("Decryption failed"))?;

    Ok(String::from_utf8(
        in_out[0..(in_out.len() - aead::CHACHA20_POLY1305.tag_len())].to_vec(),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seal_unseal() {
        let data = "Hello, world!";
        let encrypted_data = seal_str(data).unwrap();

        // Check encrypted data match what we expect
        assert_eq!(
            encrypted_data.len(),
            12 + data.len() + aead::CHACHA20_POLY1305.tag_len()
        );
        let decrypted_data = unseal_str(&encrypted_data).unwrap();

        assert_eq!(data, decrypted_data);
    }
}
