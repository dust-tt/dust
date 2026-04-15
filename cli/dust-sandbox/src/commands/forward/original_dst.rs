use std::io;
#[cfg(target_os = "linux")]
use std::mem;
use std::net::SocketAddr;
#[cfg(target_os = "linux")]
use std::net::{Ipv4Addr, SocketAddrV4};
#[cfg(target_os = "linux")]
use std::os::fd::AsRawFd;

use tokio::net::TcpStream;

#[cfg(target_os = "linux")]
const SO_ORIGINAL_DST: libc::c_int = 80;

#[cfg(target_os = "linux")]
pub fn resolve_original_dst(stream: &TcpStream) -> io::Result<SocketAddr> {
    match resolve_original_dst_linux(stream) {
        Ok(addr) => Ok(addr),
        Err(_) => stream.local_addr(),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn resolve_original_dst(stream: &TcpStream) -> io::Result<SocketAddr> {
    stream.peer_addr()
}

#[cfg(target_os = "linux")]
fn resolve_original_dst_linux(stream: &TcpStream) -> io::Result<SocketAddr> {
    let fd = stream.as_raw_fd();
    let mut sockaddr: libc::sockaddr_in = unsafe { mem::zeroed() };
    let mut len = mem::size_of::<libc::sockaddr_in>() as libc::socklen_t;

    let result = unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_IP,
            SO_ORIGINAL_DST,
            (&mut sockaddr as *mut libc::sockaddr_in).cast(),
            &mut len,
        )
    };

    if result != 0 {
        return Err(io::Error::last_os_error());
    }

    let ip = Ipv4Addr::from(u32::from_be(sockaddr.sin_addr.s_addr));
    let port = u16::from_be(sockaddr.sin_port);
    Ok(SocketAddr::V4(SocketAddrV4::new(ip, port)))
}
