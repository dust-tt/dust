use base64::{engine::general_purpose, Engine as _};
use ring::rand::{self, SecureRandom};

fn main() {
    let rng = rand::SystemRandom::new();
    let mut key_bytes = [0u8; 32]; // CHACHA20_POLY1305 key size
    rng.fill(&mut key_bytes).expect("Failed to generate key");

    let encoded_key = general_purpose::STANDARD.encode(key_bytes);
    println!("{}", encoded_key);
}
