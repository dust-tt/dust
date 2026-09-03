variable "WORKERS_IMAGE_TAG" {
  default = ""
}

variable "WORKERS_LATEST_IMAGE_TAG" {
  default = ""
}

# Comma-separated, same image pushed to additional registries.
variable "WORKERS_EXTRA_TAGS" {
  default = ""
}

variable "FRONT_API_IMAGE_TAG" {
  default = ""
}

variable "FRONT_API_LATEST_IMAGE_TAG" {
  default = ""
}

variable "FRONT_API_EXTRA_TAGS" {
  default = ""
}

group "front-images" {
  targets = ["workers", "front-api"]
}

target "_front-base" {
  context    = "."
  dockerfile = "./dockerfiles/front.Dockerfile"
  platforms  = ["linux/amd64"]
}

target "workers" {
  inherits = ["_front-base"]
  target   = "workers"
  tags     = compact(concat([WORKERS_IMAGE_TAG, WORKERS_LATEST_IMAGE_TAG], split(",", WORKERS_EXTRA_TAGS)))
}

target "front-api" {
  inherits = ["_front-base"]
  target   = "front-api"
  tags     = compact(concat([FRONT_API_IMAGE_TAG, FRONT_API_LATEST_IMAGE_TAG], split(",", FRONT_API_EXTRA_TAGS)))
}
