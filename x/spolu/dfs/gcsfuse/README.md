# gcsfuse in Docker

An interactive Ubuntu container with Google's official gcsfuse package, installed the same way as
the Dust sandbox, and ripgrep (`rg`) for search benchmarks. Package versions are resolved at build
time; check them with `gcsfuse --version` and `rg --version`.

On macOS, Docker Desktop runs this in its Linux VM. The GCS mount is accessible inside the
container; it does not appear as a mounted directory in Finder. Docker Desktop does not support
[mount propagation to the host](https://docs.docker.com/engine/storage/bind-mounts/#configure-bind-propagation).

## Build and start

From the repository root:

```sh
docker build -t dfs-gcsfuse x/spolu/dfs/gcsfuse

# Authenticate on the host if Application Default Credentials are not already configured.
gcloud auth application-default login

docker run --rm -it --name dfs-gcsfuse \
  --device /dev/fuse \
  --cap-add SYS_ADMIN \
  --mount "type=bind,src=${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}/application_default_credentials.json,dst=/run/secrets/gcp-adc.json,readonly" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-adc.json \
  dfs-gcsfuse
```

The credential file must exist before starting the container. Your Google account needs access to
the bucket. To use a service account JSON file, substitute its path as the bind mount's `src`.

On Linux hosts where AppArmor blocks FUSE mounts, add `--security-opt apparmor=unconfined` to
`docker run`.

## Mount inside the container

Mount a bucket, using its name without `gs://`:

```sh
gcsfuse --implicit-dirs dust-private-uploads-test /mnt/gcs
ls -la /mnt/gcs
```

To mount only a prefix, use this command instead:

```sh
gcsfuse --implicit-dirs \
  --only-dir w/DevWkSpace/conversations/CONVERSATION_ID/files \
  dust-private-uploads-test /mnt/gcs
```

Add `-o ro` for a read-only mount. gcsfuse runs in the background by default, leaving the shell
available to work with files. Open another shell from the host with:

```sh
docker exec -it dfs-gcsfuse /bin/bash
```

When finished, unmount inside the container before exiting:

```sh
umount /mnt/gcs
exit
```
