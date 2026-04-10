use anyhow::{anyhow, Result};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Arc;
use tokio_rustls::TlsAcceptor;

pub fn load_tls_acceptor(cert_path: &Path, key_path: &Path) -> Result<TlsAcceptor> {
    // TODO(sandbox-egress): Reload TLS cert/key on SIGHUP for rotation without restart.
    let cert_chain = load_cert_chain(cert_path)?;
    let private_key = load_private_key(key_path)?;

    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key)?;

    Ok(TlsAcceptor::from(Arc::new(config)))
}

fn load_cert_chain(path: &Path) -> Result<Vec<CertificateDer<'static>>> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let certs = rustls_pemfile::certs(&mut reader).collect::<Result<Vec<_>, _>>()?;

    if certs.is_empty() {
        return Err(anyhow!(
            "TLS certificate file does not contain certificates"
        ));
    }

    Ok(certs)
}

fn load_private_key(path: &Path) -> Result<PrivateKeyDer<'static>> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let private_key = rustls_pemfile::private_key(&mut reader)?
        .ok_or_else(|| anyhow!("TLS private key file does not contain a private key"))?;

    Ok(private_key)
}
