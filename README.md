## [Dust](https://dust.tt)

Custom AI agent platform to speed up your work.

Check out our [user guides and developer platform](https://docs.dust.tt)

## Development Setup

This project uses [Devbox](https://www.jetify.com/devbox) for reproducible development environments.

**Quick start:**
```bash
# Install devbox
curl -fsSL https://get.jetify.com/devbox | bash

# Install direnv and configure shell
brew install direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc

# Clone and setup
git clone <repo>
cd dust
direnv allow
devbox shell
devbox run setup

# Start all services (single command)
devbox services up
```

See [DEVBOX_SETUP.md](./DEVBOX_SETUP.md) for detailed instructions.

## We're hiring

- [Software Engineer](https://jobs.ashbyhq.com/dust/bad88b68-e2db-47f0-ab42-4d6dd2664e76)
- [Frontend Engineer](https://jobs.ashbyhq.com/dust/f4b23a43-5d07-4ea3-b291-90db7db5e011)
- [Security Engineer](https://jobs.ashbyhq.com/dust/4ef6ceae-4779-4113-a82c-198b4b341ef9)
