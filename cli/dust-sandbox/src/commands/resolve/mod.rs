use std::io::ErrorKind;
use std::net::SocketAddr;

use anyhow::{Context, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tracing::{debug, info, warn};

const DNS_MESSAGE_MAX_SIZE: usize = 4096;
const DNS_HEADER_SIZE: usize = 12;
const DNS_POINTER_TO_QUESTION: u16 = 0xC00C;
const DNS_TYPE_A: u16 = 1;
const DNS_CLASS_IN: u16 = 1;
const DNS_TTL_SECONDS: u32 = 60;
const SENTINEL_A_RECORD: [u8; 4] = [240, 0, 0, 1];

const FLAG_QUERY_RESPONSE: u16 = 0x8000;
const FLAG_RECURSION_DESIRED: u16 = 0x0100;
const FLAG_RECURSION_AVAILABLE: u16 = 0x0080;
const RCODE_NOERROR: u16 = 0;
const RCODE_FORMERR: u16 = 1;

#[derive(clap::Args, Debug, Clone)]
pub struct ResolveArgs {
    /// Local UDP/TCP address in host:port form
    #[arg(long, default_value = "127.0.0.1:1053")]
    listen: SocketAddr,
}

#[derive(Debug, PartialEq, Eq)]
struct DnsQuery {
    id: u16,
    recursion_desired: bool,
    qname: String,
    qtype: u16,
    qclass: u16,
    question_end: usize,
}

pub async fn cmd_resolve(args: ResolveArgs) -> Result<()> {
    let udp_socket = UdpSocket::bind(args.listen)
        .await
        .with_context(|| format!("failed to bind DNS UDP resolver on {}", args.listen))?;
    let tcp_listener = TcpListener::bind(args.listen)
        .await
        .with_context(|| format!("failed to bind DNS TCP resolver on {}", args.listen))?;

    info!(listen_addr = %args.listen, "starting dsbx DNS resolver");

    let udp_task = tokio::spawn(run_udp_resolver(udp_socket));
    let tcp_task = tokio::spawn(run_tcp_resolver(tcp_listener));

    tokio::select! {
        result = udp_task => {
            result.context("DNS UDP resolver task panicked")??;
        }
        result = tcp_task => {
            result.context("DNS TCP resolver task panicked")??;
        }
    }

    Ok(())
}

async fn run_udp_resolver(socket: UdpSocket) -> Result<()> {
    let mut buffer = [0_u8; DNS_MESSAGE_MAX_SIZE];

    loop {
        let (len, peer_addr) = socket
            .recv_from(&mut buffer)
            .await
            .context("failed to receive DNS UDP query")?;
        let response = build_dns_response(&buffer[..len]);
        if let Err(error) = socket.send_to(&response, peer_addr).await {
            warn!(error = %error, peer_addr = %peer_addr, "failed to send DNS UDP response");
        }
    }
}

async fn run_tcp_resolver(listener: TcpListener) -> Result<()> {
    loop {
        let (stream, peer_addr) = listener
            .accept()
            .await
            .context("failed to accept DNS TCP connection")?;
        tokio::spawn(async move {
            if let Err(error) = handle_tcp_connection(stream).await {
                warn!(error = %error, peer_addr = %peer_addr, "DNS TCP connection failed");
            }
        });
    }
}

async fn handle_tcp_connection(mut stream: TcpStream) -> Result<()> {
    loop {
        let mut len_bytes = [0_u8; 2];
        match stream.read_exact(&mut len_bytes).await {
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::UnexpectedEof => return Ok(()),
            Err(error) => return Err(error).context("failed to read DNS TCP frame length"),
        }

        let frame_len = usize::from(u16::from_be_bytes(len_bytes));
        if frame_len > DNS_MESSAGE_MAX_SIZE {
            drain_exact(&mut stream, frame_len).await?;
            write_tcp_response(&mut stream, &build_formerr_response(&[])).await?;
            continue;
        }

        let mut query = vec![0_u8; frame_len];
        stream
            .read_exact(&mut query)
            .await
            .context("failed to read DNS TCP query")?;
        let response = build_dns_response(&query);
        write_tcp_response(&mut stream, &response).await?;
    }
}

async fn drain_exact(stream: &mut TcpStream, len: usize) -> Result<()> {
    let mut remaining = len;
    let mut buffer = [0_u8; 1024];

    while remaining > 0 {
        let chunk_len = remaining.min(buffer.len());
        stream
            .read_exact(&mut buffer[..chunk_len])
            .await
            .context("failed to drain oversized DNS TCP query")?;
        remaining -= chunk_len;
    }

    Ok(())
}

async fn write_tcp_response(stream: &mut TcpStream, response: &[u8]) -> Result<()> {
    let response_len =
        u16::try_from(response.len()).context("DNS TCP response exceeded u16 length")?;
    stream
        .write_all(&response_len.to_be_bytes())
        .await
        .context("failed to write DNS TCP response length")?;
    stream
        .write_all(response)
        .await
        .context("failed to write DNS TCP response")?;
    Ok(())
}

fn build_dns_response(message: &[u8]) -> Vec<u8> {
    match parse_query(message) {
        Some(query) => {
            debug!(qname = %query.qname, qtype = query.qtype, "synthetic DNS query");
            build_success_response(message, &query)
        }
        None => build_formerr_response(message),
    }
}

fn parse_query(message: &[u8]) -> Option<DnsQuery> {
    if message.len() < DNS_HEADER_SIZE {
        return None;
    }

    let id = read_u16(message, 0)?;
    let flags = read_u16(message, 2)?;
    let is_response = flags & FLAG_QUERY_RESPONSE != 0;
    let opcode = (flags >> 11) & 0x0F;
    if is_response || opcode != 0 {
        return None;
    }

    let question_count = read_u16(message, 4)?;
    if question_count != 1 {
        return None;
    }

    let (qname, qtype_offset) = parse_qname(message, DNS_HEADER_SIZE)?;
    let qtype = read_u16(message, qtype_offset)?;
    let qclass = read_u16(message, qtype_offset + 2)?;
    let question_end = qtype_offset + 4;

    Some(DnsQuery {
        id,
        recursion_desired: flags & FLAG_RECURSION_DESIRED != 0,
        qname,
        qtype,
        qclass,
        question_end,
    })
}

fn parse_qname(message: &[u8], start: usize) -> Option<(String, usize)> {
    let mut labels = Vec::new();
    let mut offset = start;
    let mut wire_len = 0_usize;

    loop {
        let len = usize::from(*message.get(offset)?);
        offset += 1;
        wire_len += 1;

        if len == 0 {
            break;
        }

        if len & 0xC0 != 0 || len > 63 {
            return None;
        }

        wire_len += len;
        if wire_len > 255 {
            return None;
        }

        let label = message.get(offset..offset + len)?;
        labels.push(String::from_utf8_lossy(label).into_owned());
        offset += len;
    }

    let qname = if labels.is_empty() {
        ".".to_string()
    } else {
        labels.join(".")
    };

    Some((qname, offset))
}

fn build_success_response(message: &[u8], query: &DnsQuery) -> Vec<u8> {
    let has_a_answer = query.qtype == DNS_TYPE_A && query.qclass == DNS_CLASS_IN;
    let answer_count = if has_a_answer { 1 } else { 0 };

    let mut response = Vec::with_capacity(DNS_HEADER_SIZE + query.question_end + 16);
    write_u16(&mut response, query.id);
    write_u16(
        &mut response,
        response_flags(query.recursion_desired, RCODE_NOERROR),
    );
    write_u16(&mut response, 1);
    write_u16(&mut response, answer_count);
    write_u16(&mut response, 0);
    write_u16(&mut response, 0);
    response.extend_from_slice(&message[DNS_HEADER_SIZE..query.question_end]);

    if has_a_answer {
        write_u16(&mut response, DNS_POINTER_TO_QUESTION);
        write_u16(&mut response, DNS_TYPE_A);
        write_u16(&mut response, DNS_CLASS_IN);
        write_u32(&mut response, DNS_TTL_SECONDS);
        write_u16(
            &mut response,
            u16::try_from(SENTINEL_A_RECORD.len()).unwrap_or_default(),
        );
        response.extend_from_slice(&SENTINEL_A_RECORD);
    }

    response
}

fn build_formerr_response(message: &[u8]) -> Vec<u8> {
    let id = read_u16(message, 0).unwrap_or_default();
    let recursion_desired = read_u16(message, 2)
        .map(|flags| flags & FLAG_RECURSION_DESIRED != 0)
        .unwrap_or(false);

    let mut response = Vec::with_capacity(DNS_HEADER_SIZE);
    write_u16(&mut response, id);
    write_u16(
        &mut response,
        response_flags(recursion_desired, RCODE_FORMERR),
    );
    write_u16(&mut response, 0);
    write_u16(&mut response, 0);
    write_u16(&mut response, 0);
    write_u16(&mut response, 0);
    response
}

fn response_flags(recursion_desired: bool, rcode: u16) -> u16 {
    let recursion_flag = if recursion_desired {
        FLAG_RECURSION_DESIRED
    } else {
        0
    };

    FLAG_QUERY_RESPONSE | FLAG_RECURSION_AVAILABLE | recursion_flag | rcode
}

fn read_u16(message: &[u8], offset: usize) -> Option<u16> {
    let bytes = message.get(offset..offset + 2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn write_u16(buffer: &mut Vec<u8>, value: u16) {
    buffer.extend_from_slice(&value.to_be_bytes());
}

fn write_u32(buffer: &mut Vec<u8>, value: u32) {
    buffer.extend_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    const TYPE_AAAA: u16 = 28;
    const TYPE_HTTPS: u16 = 65;
    const TYPE_SVCB: u16 = 64;
    const TYPE_TXT: u16 = 16;
    const TYPE_PTR: u16 = 12;

    fn query_for(qname: &str, qtype: u16) -> Vec<u8> {
        let mut query = Vec::new();
        write_u16(&mut query, 0x1234);
        write_u16(&mut query, FLAG_RECURSION_DESIRED);
        write_u16(&mut query, 1);
        write_u16(&mut query, 0);
        write_u16(&mut query, 0);
        write_u16(&mut query, 0);

        for label in qname.split('.') {
            query.push(u8::try_from(label.len()).unwrap_or_default());
            query.extend_from_slice(label.as_bytes());
        }
        query.push(0);
        write_u16(&mut query, qtype);
        write_u16(&mut query, DNS_CLASS_IN);
        query
    }

    fn rcode(response: &[u8]) -> u16 {
        read_u16(response, 2).unwrap_or_default() & 0x000F
    }

    fn answer_count(response: &[u8]) -> u16 {
        read_u16(response, 6).unwrap_or_default()
    }

    #[test]
    fn a_query_returns_sentinel_address() {
        let response = build_dns_response(&query_for("api.openai.com", DNS_TYPE_A));

        assert_eq!(rcode(&response), RCODE_NOERROR);
        assert_eq!(answer_count(&response), 1);
        assert!(response.ends_with(&SENTINEL_A_RECORD));
        assert_eq!(
            read_u32(&response, response.len() - 10),
            Some(DNS_TTL_SECONDS)
        );
    }

    #[test]
    fn unsupported_qtypes_return_noerror_nodata() {
        for qtype in [TYPE_AAAA, TYPE_HTTPS, TYPE_SVCB, TYPE_TXT, TYPE_PTR] {
            let response = build_dns_response(&query_for("example.com", qtype));

            assert_eq!(rcode(&response), RCODE_NOERROR);
            assert_eq!(answer_count(&response), 0);
        }
    }

    #[test]
    fn malformed_query_returns_formerr() {
        let response = build_dns_response(&[0x12, 0x34, 0x01]);

        assert_eq!(read_u16(&response, 0), Some(0x1234));
        assert_eq!(rcode(&response), RCODE_FORMERR);
        assert_eq!(answer_count(&response), 0);
    }

    #[test]
    fn oversized_query_is_handled_as_formerr() {
        let response = build_dns_response(&vec![0_u8; DNS_MESSAGE_MAX_SIZE + 1]);

        assert_eq!(rcode(&response), RCODE_FORMERR);
        assert_eq!(answer_count(&response), 0);
    }

    fn read_u32(message: &[u8], offset: usize) -> Option<u32> {
        let bytes = message.get(offset..offset + 4)?;
        Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }
}
