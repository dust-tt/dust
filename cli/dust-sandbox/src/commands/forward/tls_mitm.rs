use std::fs::{self, OpenOptions};
use std::io::Write;
use std::num::NonZeroUsize;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use lru::LruCache;
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::server::ResolvesServerCert;
use rustls::sign::CertifiedKey;
use rustls::ServerConfig;
use tokio::sync::Mutex;

const CA_COMMON_NAME: &str = "Dust Sandbox Egress MITM CA";
const LEAF_CACHE_CAPACITY: usize = 256;
pub(super) const HTTP_1_1_ALPN: &[u8] = b"http/1.1";

pub struct MitmCa {
    ca_cert: Certificate,
    ca_key_pair: KeyPair,
    ca_cert_pem: String,
    leaf_cache: Mutex<LruCache<String, Arc<CertifiedKey>>>,
}

impl MitmCa {
    pub fn load_or_generate(cert_path: &Path, key_path: &Path) -> Result<Self> {
        let cert_exists = cert_path
            .try_exists()
            .with_context(|| format!("failed to stat CA cert file {}", cert_path.display()))?;
        let key_exists = key_path
            .try_exists()
            .with_context(|| format!("failed to stat CA key file {}", key_path.display()))?;

        match (cert_exists, key_exists) {
            (true, true) => Self::load(cert_path, key_path),
            (false, false) => {
                let ca = Self::generate().context("failed to generate persistent MITM CA")?;
                ca.write_persistent(cert_path, key_path)
                    .context("failed to persist generated MITM CA")?;
                Ok(ca)
            }
            _ => {
                bail!(
                    "incomplete MITM CA state: cert exists={}, key exists={} (cert={}, key={})",
                    cert_exists,
                    key_exists,
                    cert_path.display(),
                    key_path.display()
                )
            }
        }
    }

    pub fn generate() -> Result<Self> {
        let params = Self::new_ca_params()?;
        let ca_key_pair = KeyPair::generate().context("failed to generate CA key pair")?;
        let ca_cert = params
            .self_signed(&ca_key_pair)
            .context("failed to self-sign CA certificate")?;
        let ca_cert_pem = ca_cert.pem();

        Ok(Self {
            ca_cert,
            ca_key_pair,
            ca_cert_pem,
            leaf_cache: Mutex::new(Self::new_leaf_cache()),
        })
    }

    fn load(cert_path: &Path, key_path: &Path) -> Result<Self> {
        let ca_cert_pem = fs::read_to_string(cert_path)
            .with_context(|| format!("failed to read CA cert file {}", cert_path.display()))?;
        let ca_key_pem = fs::read_to_string(key_path)
            .with_context(|| format!("failed to read CA key file {}", key_path.display()))?;
        let params = CertificateParams::from_ca_cert_pem(&ca_cert_pem)
            .with_context(|| format!("failed to parse CA cert file {}", cert_path.display()))?;
        let ca_key_pair = KeyPair::from_pem(&ca_key_pem)
            .with_context(|| format!("failed to parse CA key file {}", key_path.display()))?;

        // The on-disk cert and key must agree on the public key. Without this
        // check, a stray cert-from-A + key-from-B pair would happily load:
        // leaves we sign would validate against B's public key, but front
        // installs the on-disk (A's) cert in the trust bundle, so clients
        // would reject every forged leaf. The current write path never
        // overwrites an existing pair, so this can't happen today, but the
        // check makes the invariant explicit against future re-key paths or
        // external tampering.
        verify_cert_key_match(&ca_cert_pem, &ca_key_pair).with_context(|| {
            format!(
                "CA cert/key pair on disk is inconsistent (cert={}, key={})",
                cert_path.display(),
                key_path.display()
            )
        })?;

        let ca_cert = params
            .self_signed(&ca_key_pair)
            .context("failed to reconstruct persisted CA certificate")?;

        Ok(Self {
            ca_cert,
            ca_key_pair,
            ca_cert_pem,
            leaf_cache: Mutex::new(Self::new_leaf_cache()),
        })
    }

    pub async fn server_config_for(&self, sni: &str) -> Result<Arc<ServerConfig>> {
        let certified = self.get_or_mint_leaf(sni).await?;
        let resolver = SingleCertResolver { key: certified };
        let mut config = ServerConfig::builder()
            .with_no_client_auth()
            .with_cert_resolver(Arc::new(resolver));
        config.alpn_protocols = vec![HTTP_1_1_ALPN.to_vec()];
        Ok(Arc::new(config))
    }

    fn new_ca_params() -> Result<CertificateParams> {
        let mut params =
            CertificateParams::new(Vec::<String>::new()).context("invalid CA params")?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, CA_COMMON_NAME);
        params.distinguished_name = dn;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];

        Ok(params)
    }

    fn new_leaf_cache() -> LruCache<String, Arc<CertifiedKey>> {
        let Some(capacity) = NonZeroUsize::new(LEAF_CACHE_CAPACITY) else {
            unreachable!("leaf cache capacity must be non-zero");
        };
        LruCache::new(capacity)
    }

    fn write_persistent(&self, cert_path: &Path, key_path: &Path) -> Result<()> {
        write_file_atomically(cert_path, self.ca_cert_pem.as_bytes(), 0o644)
            .with_context(|| format!("failed to write CA cert file {}", cert_path.display()))?;
        write_file_atomically(key_path, self.ca_key_pair.serialize_pem().as_bytes(), 0o600)
            .with_context(|| format!("failed to write CA key file {}", key_path.display()))?;
        Ok(())
    }

    async fn get_or_mint_leaf(&self, sni: &str) -> Result<Arc<CertifiedKey>> {
        let mut cache = self.leaf_cache.lock().await;
        if let Some(existing) = cache.get(sni).cloned() {
            return Ok(existing);
        }

        let minted = self.mint_leaf(sni)?;
        cache.put(sni.to_string(), Arc::clone(&minted));
        Ok(minted)
    }

    fn mint_leaf(&self, sni: &str) -> Result<Arc<CertifiedKey>> {
        let mut params =
            CertificateParams::new(Vec::<String>::new()).context("invalid leaf params")?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, sni);
        params.distinguished_name = dn;
        params.subject_alt_names = vec![SanType::DnsName(
            sni.to_string()
                .try_into()
                .context("invalid SNI for leaf cert")?,
        )];

        let leaf_key = KeyPair::generate().context("failed to generate leaf key pair")?;
        let leaf = params
            .signed_by(&leaf_key, &self.ca_cert, &self.ca_key_pair)
            .context("failed to sign leaf certificate")?;

        let leaf_der = CertificateDer::from(leaf.der().to_vec());
        let key_der = PrivateKeyDer::from(PrivatePkcs8KeyDer::from(leaf_key.serialize_der()));
        let signing_key = rustls::crypto::ring::sign::any_supported_type(&key_der)
            .context("failed to load leaf signing key")?;

        Ok(Arc::new(CertifiedKey::new(vec![leaf_der], signing_key)))
    }

    #[cfg(test)]
    pub(super) fn ca_cert_der(&self) -> CertificateDer<'static> {
        CertificateDer::from(self.ca_cert.der().to_vec())
    }
}

#[derive(Debug)]
struct SingleCertResolver {
    key: Arc<CertifiedKey>,
}

impl ResolvesServerCert for SingleCertResolver {
    fn resolve(&self, _client_hello: rustls::server::ClientHello<'_>) -> Option<Arc<CertifiedKey>> {
        Some(Arc::clone(&self.key))
    }
}

fn verify_cert_key_match(cert_pem: &str, key_pair: &KeyPair) -> Result<()> {
    use x509_parser::prelude::FromDer;
    let (_, pem_block) = x509_parser::pem::parse_x509_pem(cert_pem.as_bytes())
        .map_err(|err| anyhow::anyhow!("failed to parse cert PEM: {err}"))?;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(&pem_block.contents)
        .map_err(|err| anyhow::anyhow!("failed to parse cert DER: {err}"))?;
    let cert_spki = cert.public_key().raw;
    let key_spki = key_pair.public_key_der();
    if cert_spki != key_spki.as_slice() {
        bail!("CA cert SubjectPublicKeyInfo does not match key pair public key");
    }
    Ok(())
}

fn write_file_atomically(path: &Path, contents: &[u8], mode: u32) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create directory {}", parent.display()))?;
    }

    let tmp_path = temporary_path_for(path)?;
    let write_result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(mode)
            .open(&tmp_path)
            .with_context(|| format!("failed to open temp file {}", tmp_path.display()))?;
        file.write_all(contents)
            .with_context(|| format!("failed to write temp file {}", tmp_path.display()))?;
        file.sync_all()
            .with_context(|| format!("failed to sync temp file {}", tmp_path.display()))?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }

    fs::rename(&tmp_path, path).with_context(|| {
        format!(
            "failed to rename temp file {} to {}",
            tmp_path.display(),
            path.display()
        )
    })?;
    Ok(())
}

fn temporary_path_for(path: &Path) -> Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .with_context(|| format!("invalid CA file path {}", path.display()))?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before UNIX epoch")?
        .as_nanos();

    Ok(path.with_file_name(format!(
        ".{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        suffix
    )))
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    #[test]
    fn load_or_generate_writes_and_reuses_persistent_ca() -> Result<()> {
        let dir = tempfile::tempdir().context("failed to create tempdir")?;
        let cert_path = dir.path().join("egress-ca.pem");
        let key_path = dir.path().join("egress-ca.key");

        let generated = MitmCa::load_or_generate(&cert_path, &key_path)?;
        let cert_pem =
            fs::read_to_string(&cert_path).context("failed to read generated cert PEM")?;
        let key_pem = fs::read_to_string(&key_path).context("failed to read generated key PEM")?;

        assert_eq!(generated.ca_cert_pem, cert_pem);
        assert_eq!(
            fs::metadata(&cert_path)
                .context("failed to stat cert")?
                .permissions()
                .mode()
                & 0o777,
            0o644
        );
        assert_eq!(
            fs::metadata(&key_path)
                .context("failed to stat key")?
                .permissions()
                .mode()
                & 0o777,
            0o600
        );

        let loaded = MitmCa::load_or_generate(&cert_path, &key_path)?;
        assert_eq!(loaded.ca_cert_pem, cert_pem);
        assert_eq!(
            fs::read_to_string(&key_path).context("failed to reread key PEM")?,
            key_pem
        );

        Ok(())
    }

    #[test]
    fn corrupt_persistent_ca_fails_closed() -> Result<()> {
        let dir = tempfile::tempdir().context("failed to create tempdir")?;
        let cert_path = dir.path().join("egress-ca.pem");
        let key_path = dir.path().join("egress-ca.key");
        fs::write(&cert_path, "not a cert").context("failed to write bad cert")?;
        fs::write(&key_path, "not a key").context("failed to write bad key")?;

        match MitmCa::load_or_generate(&cert_path, &key_path) {
            Ok(_) => anyhow::bail!("corrupt CA unexpectedly loaded"),
            Err(error) => {
                assert!(error.to_string().contains("failed to parse CA cert file"));
            }
        }

        Ok(())
    }

    #[test]
    fn partial_persistent_ca_state_fails_closed() -> Result<()> {
        let dir = tempfile::tempdir().context("failed to create tempdir")?;
        let cert_path = dir.path().join("egress-ca.pem");
        let key_path = dir.path().join("egress-ca.key");
        fs::write(
            &cert_path,
            "-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----\n",
        )
        .context("failed to write partial cert")?;

        match MitmCa::load_or_generate(&cert_path, &key_path) {
            Ok(_) => anyhow::bail!("partial CA unexpectedly loaded"),
            Err(error) => {
                assert!(error.to_string().contains("incomplete MITM CA state"));
            }
        }

        Ok(())
    }

    #[test]
    fn mismatched_cert_and_key_fails_closed() -> Result<()> {
        let dir_a = tempfile::tempdir().context("failed to create tempdir A")?;
        let dir_b = tempfile::tempdir().context("failed to create tempdir B")?;
        let cert_a = dir_a.path().join("egress-ca.pem");
        let key_a = dir_a.path().join("egress-ca.key");
        let cert_b = dir_b.path().join("egress-ca.pem");
        let key_b = dir_b.path().join("egress-ca.key");

        // Generate two independent CAs.
        let _ = MitmCa::load_or_generate(&cert_a, &key_a)?;
        let _ = MitmCa::load_or_generate(&cert_b, &key_b)?;

        // Cross the cert from CA A with the key from CA B in a third dir.
        let dir_mixed = tempfile::tempdir().context("failed to create tempdir mixed")?;
        let cert_mixed = dir_mixed.path().join("egress-ca.pem");
        let key_mixed = dir_mixed.path().join("egress-ca.key");
        fs::copy(&cert_a, &cert_mixed).context("failed to copy cert A")?;
        fs::copy(&key_b, &key_mixed).context("failed to copy key B")?;

        match MitmCa::load_or_generate(&cert_mixed, &key_mixed) {
            Ok(_) => anyhow::bail!("mismatched cert/key unexpectedly loaded"),
            Err(error) => {
                let msg = format!("{:#}", error);
                assert!(
                    msg.contains("CA cert/key pair on disk is inconsistent"),
                    "unexpected error: {msg}"
                );
                assert!(
                    msg.contains("SubjectPublicKeyInfo"),
                    "unexpected error: {msg}"
                );
            }
        }

        Ok(())
    }

    #[tokio::test]
    async fn server_config_for_forces_http1_alpn() -> Result<()> {
        let ca = Arc::new(MitmCa::generate()?);

        let config = ca.server_config_for("api.openai.com").await?;

        assert_eq!(config.alpn_protocols, vec![HTTP_1_1_ALPN.to_vec()]);
        Ok(())
    }

    #[tokio::test]
    async fn leaf_cache_is_lru_bounded() -> Result<()> {
        let ca = Arc::new(MitmCa::generate()?);

        for i in 0..(LEAF_CACHE_CAPACITY + 10) {
            let sni = format!("host-{i}.example.com");
            ca.server_config_for(&sni).await?;
        }

        assert_eq!(ca.leaf_cache.lock().await.len(), LEAF_CACHE_CAPACITY);
        Ok(())
    }
}
