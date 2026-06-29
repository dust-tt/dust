# Build the bee image. Context = the dust repo root (the Dockerfile bakes the
# whole repo). Build only — NEVER `bl deploy` / `bl run` here: those create a
# sandbox and we are quota-limited. Use `bl push` (publish, no sandbox) once the
# image builds clean.
REPO_ROOT := $(shell git rev-parse --show-toplevel)
IMAGE ?= dust-bee

BEE_DIR := $(REPO_ROOT)/x/henry/dust-hive/bee-image
CLI_DIR := $(REPO_ROOT)/x/henry/dust-hive/cli
ES_VERSION := 8.11.3
ES_IMAGE := dust-hive-elasticsearch:$(ES_VERSION)
ES_TAR := $(BEE_DIR)/es-image.tar

.PHONY: build push es-image

# Prebuild the custom Elasticsearch image (stock ES + analysis-icu) on the host
# and save it as a tar the bee bakes in. The bee must not build ES itself —
# compose's `build:` needs buildx (absent) and would rebuild every cold boot.
# Baked + loaded at boot, compose `up` finds the tagged image and skips the
# build. The tag matches docker-compose.yml `elasticsearch.image`. Rebuild the
# tar explicitly with `make es-image` (e.g. on an ES_VERSION bump).
es-image: $(ES_TAR)
$(ES_TAR):
	docker buildx build \
	  --platform linux/amd64 \
	  --load \
	  -f $(CLI_DIR)/elasticsearch.Dockerfile \
	  --build-arg ES_VERSION=$(ES_VERSION) \
	  -t $(ES_IMAGE) \
	  $(CLI_DIR)
	docker save $(ES_IMAGE) -o $(ES_TAR)

# Blaxel sandboxes run on amd64 microVMs, so the image MUST be linux/amd64 even
# when building on an arm64 host (per Blaxel's docker-in-sandbox tutorial).
# --load lands the tagged image in the local docker store for `bl push`.
# Depends on the baked ES tar (built first if missing).
build: $(ES_TAR)
	docker buildx build \
	  --platform linux/amd64 \
	  --load \
	  -f $(BEE_DIR)/Dockerfile \
	  -t $(IMAGE) \
	  $(REPO_ROOT)

# Publishes the image to Blaxel's registry. Does NOT create a sandbox.
push:
	bl push
