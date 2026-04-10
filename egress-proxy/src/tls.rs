use anyhow::{anyhow, Result};
use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
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
    let certs = CertificateDer::pem_file_iter(path)?.collect::<Result<Vec<_>, _>>()?;

    if certs.is_empty() {
        return Err(anyhow!(
            "TLS certificate file does not contain certificates"
        ));
    }

    Ok(certs)
}

fn load_private_key(path: &Path) -> Result<PrivateKeyDer<'static>> {
    PrivateKeyDer::from_pem_file(path)
        .map_err(|error| anyhow!("TLS private key file does not contain a private key: {error}"))
}
