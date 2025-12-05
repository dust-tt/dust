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
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/*

# Only allow to pull via fast-forward
git config pull.ff only
git remote set-url origin git@github.com:dust-tt/dust.git

git pull origin main

echo "export PS1='\[\e[0;31m\]prodbox(${REGION})\[\e[0m\]:\w\$ '" >> /root/.bashrc

# This is the script used to start the container, so it needs to stay alive, otherwise the
# kube pod (container) dies.
tail -f /dev/null
