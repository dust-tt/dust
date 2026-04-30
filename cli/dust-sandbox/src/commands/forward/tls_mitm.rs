use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::server::ResolvesServerCert;
use rustls::sign::CertifiedKey;
use rustls::ServerConfig;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const CA_COMMON_NAME: &str = "Dust Sandbox Egress MITM CA";

pub struct MitmCa {
    ca_cert: Certificate,
    ca_key_pair: KeyPair,
    ca_cert_pem: String,
    leaf_cache: Mutex<HashMap<String, Arc<CertifiedKey>>>,
}

impl MitmCa {
    pub fn generate() -> Result<Self> {
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

        let ca_key_pair = KeyPair::generate().context("failed to generate CA key pair")?;
        let ca_cert = params
            .self_signed(&ca_key_pair)
            .context("failed to self-sign CA certificate")?;
        let ca_cert_pem = ca_cert.pem();

        Ok(Self {
            ca_cert,
            ca_key_pair,
            ca_cert_pem,
            leaf_cache: Mutex::new(HashMap::new()),
        })
    }

    pub async fn write_ca_pem(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .with_context(|| format!("failed to create CA directory {}", parent.display()))?;
        }
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(path)
            .await
            .with_context(|| format!("failed to open CA file {}", path.display()))?;
        file.write_all(self.ca_cert_pem.as_bytes())
            .await
            .with_context(|| format!("failed to write CA file {}", path.display()))?;
        Ok(())
    }

    pub async fn server_config_for(self: &Arc<Self>, sni: &str) -> Result<Arc<ServerConfig>> {
        let certified = self.get_or_mint_leaf(sni).await?;
        let resolver = SingleCertResolver { key: certified };
        let config = ServerConfig::builder()
            .with_no_client_auth()
            .with_cert_resolver(Arc::new(resolver));
        Ok(Arc::new(config))
    }

    async fn get_or_mint_leaf(&self, sni: &str) -> Result<Arc<CertifiedKey>> {
        if let Some(existing) = self.leaf_cache.lock().await.get(sni).cloned() {
            return Ok(existing);
        }
        let minted = self.mint_leaf(sni)?;
        self.leaf_cache
            .lock()
            .await
            .insert(sni.to_string(), Arc::clone(&minted));
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
