# This script is run when the prodbox container is started.
# Some commands can only be run once the container is deployed, because they rely on some files
# that are not available at build time.

# only allow to pull via fast-forward
git config pull.ff only

# Setting up the ssh key to pull from Github
# we need to copy the key from the mounted volume because ssh only accept keys
# that are not readable by others and we can't chmod on the mounted volume.
mkdir -p ~/.ssh
chmod 700 ~/.ssh

cp /etc/github-deploykey-deploybox/github-deploykey-deploybox ~/.ssh/github-deploykey-deploybox

# Pin GitHub's SSH host keys statically instead of using ssh-keyscan (TOFU).
# Trust-on-first-use lets a network attacker intercept the keyscan and present
# a malicious key. These values are published at
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
# and verified against a live keyscan at the time of this commit.
cat >> ~/.ssh/known_hosts <<'EOF'
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
EOF

chmod 600 ~/.ssh/*

# Only allow to pull via fast-forward
git config pull.ff only
git remote set-url origin git@github.com:dust-tt/dust.git

git pull origin main

echo "export PS1='\[\e[0;31m\]prodbox(${REGION}${CELL:+ $CELL})\[\e[0m\]:\w\$ '" >> /root/.bashrc

# This is the script used to start the container, so it needs to stay alive, otherwise the
# kube pod (container) dies.
tail -f /dev/null
