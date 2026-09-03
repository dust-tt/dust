variable "WORKERS_IMAGE_TAG" {
  default = ""
}

variable "WORKERS_LATEST_IMAGE_TAG" {
  default = ""
}

variable "FRONT_API_IMAGE_TAG" {
  default = ""
}

variable "FRONT_API_LATEST_IMAGE_TAG" {
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
  tags     = compact([WORKERS_IMAGE_TAG, WORKERS_LATEST_IMAGE_TAG])
}

target "front-api" {
  inherits = ["_front-base"]
  target   = "front-api"
  tags     = compact([FRONT_API_IMAGE_TAG, FRONT_API_LATEST_IMAGE_TAG])
}
