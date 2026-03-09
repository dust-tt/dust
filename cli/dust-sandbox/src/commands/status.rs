use crate::auth::{decode_jwt_claims, SANDBOX_TOKEN_ENV};

pub fn cmd_status() -> anyhow::Result<()> {
    let token = match std::env::var(SANDBOX_TOKEN_ENV) {
        Ok(t) if !t.is_empty() => t,
        _ => {
            println!("Not logged in ({SANDBOX_TOKEN_ENV} is not set)");
            return Ok(());
        }
    };

    let claims = decode_jwt_claims(&token)?;

    println!("Logged in via sandbox token");
    println!("  Workspace:    {}", claims.w_id);
    println!("  Conversation: {}", claims.c_id);
    println!("  User:         {}", claims.u_id);
    println!("  Sandbox:      {}", claims.sb_id);

    if let Some(exp) = claims.exp {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| anyhow::anyhow!("system clock error: {e}"))?
            .as_secs();
        if exp <= now {
            println!("  Token:        EXPIRED");
        } else {
            println!("  Expires in:   {}s", exp - now);
        }
    }

    Ok(())
}
