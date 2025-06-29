use sha2::{Sha256, Digest};
use hex;
use crate::error::Error;

/// Calculate SHA256 hash of bytes
pub fn sha256_bytes(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Calculate SHA256 hash and return as hex string
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(sha256_bytes(data))
}

/// Calculate SHA256 hash of string
pub fn sha256_string(s: &str) -> String {
    sha256_hex(s.as_bytes())
}

/// Verify SHA256 hash
pub fn verify_sha256(data: &[u8], expected_hash: &str) -> Result<bool, Error> {
    let hash = sha256_hex(data);
    Ok(hash == expected_hash)
}

/// Generate random bytes
pub fn random_bytes(length: usize) -> Vec<u8> {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let mut bytes = vec![0u8; length];
    rng.fill_bytes(&mut bytes);
    bytes
}

/// Generate random hex string
pub fn random_hex(length: usize) -> String {
    hex::encode(random_bytes(length / 2))
} 