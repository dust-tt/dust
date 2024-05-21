# This script is run when the prodbox container is started.
# Some commands can only be run once the container is deployed, because they rely on some files
# that are not available at build time.

# only allow to pull via fast-forward
git config pull.ff only

# Setting up the ssh key to pull from Github
# we need to copy the key from the mounted volume because ssh only accept keys
# that are not readable by others and we can't chmod on the mounted volume.
mkdir -p ~/.ssh
cp /etc/github-deploykey-deploybox/github-deploykey-deploybox ~/.ssh/github-deploykey-deploybox
chmod 600 ~/.ssh/github-deploykey-deploybox

# Only allow to pull via fast-forward
git config pull.ff only

# This is the script used to start the container, so it needs to stay alive, otherwise the
# kube pod (container) dies.
tail -f /dev/null