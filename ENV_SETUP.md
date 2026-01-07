# Environment Variables Setup

This project uses a **layered approach** for managing 100+ environment variables, separating public configuration from
sensitive credentials.

## 📚 The Four Layers

Environment variables are loaded in this order (later layers override earlier ones):

```
1. devbox.json          → Base public config (committed)
2. .env                 → Docker Compose config (committed)
3. .env.local           → Local dev overrides (gitignored)
4. .env.secrets         → Sensitive credentials (gitignored)
```

## 🚀 Quick Setup

### 1. Copy the example files

```bash
cp .env.local.example .env.local
cp .env.secrets.example .env.secrets
```

### 2. Fill in your env

Edit `.env.local` and replace all `CHANGE_ME` values with real credentials

Edit `.env.secrets` and replace all placeholder values with real credentials:

- API keys (OpenAI, Anthropic, etc.)
- OAuth client IDs and secrets
- Webhook secrets
- Encryption keys

### 3. Customize local settings (optional)

Edit `.env.local` if you need to override any local development settings:

- Change ports
- Use different database names
- Override service URLs

### 4. Load the environment

```bash
direnv allow
```

## 📋 What Goes Where?

### devbox.json (`env` section)

✅ **Public, committed config:**

- Database connection strings (localhost)
- Service ports
- Non-sensitive defaults
- Development flags

### .env.local

✅ **Local dev overrides, NOT committed:**

- Development workspace IDs
- Test bucket names
- Local service URLs
- Feature flags
- GCP project IDs

### .env.secrets

🔒 **Sensitive credentials, NEVER committed:**

- API keys (OpenAI, Anthropic, Google, etc.)
- OAuth client secrets
- Webhook secrets
- Encryption keys
- Stripe keys
- SendGrid keys
- WorkOS credentials

## 🔍 Checking Your Setup

Verify variables are loaded:

```bash
echo $DUST_MANAGED_OPENAI_API_KEY   # Should show your key
echo $DUST_CLIENT_FACING_URL        # Should show http://localhost:3000
```

List all Dust environment variables:

```bash
env | grep DUST_ | sort
```

## ⚠️ Security Notes

1. **NEVER commit `.env.secrets`** - it contains real credentials
2. **NEVER commit `.env.local`** - it may contain sensitive IDs
3. **.env.*.example files are safe** - they only show structure
4. **Keep `.env` generic** - only for Docker Compose defaults

## 🔄 Updating Configuration

### Adding a new public variable

→ Add to `devbox.json` env section

### Adding a new local dev setting

→ Add to `.env.local.example` and your `.env.local`

### Adding a new secret

→ Add to `.env.secrets.example` with placeholder
→ Add real value to your `.env.secrets`

## 📦 For New Team Members

1. Clone the repo
2. Run `cp .env.local.example .env.local`
3. Run `cp .env.secrets.example .env.secrets`
4. Get real secrets from 1Password
5. Fill in `.env.secrets`
6. Run `direnv allow`
7. Run `devbox services up`

## 🐛 Troubleshooting

**Variables not loading?**

```bash
direnv reload
```

**Not sure which file to edit?**

- Public/shared setting → `devbox.json`
- Your local preference → `.env.local`
- Secret/credential → `.env.secrets`

**Want to see the load order?**
Check the output when entering the directory:

```
🌟 Dust development environment activated
   📝 Loaded: devbox.json → .env → .env.local → .env.secrets
```
