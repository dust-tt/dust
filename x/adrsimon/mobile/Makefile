# Dust iOS app — common dev tasks.
#
# Quick start:
#   make run               # build the Dev config and launch it on the simulator
#   make run:prod          # debug build pointing at the prod API
#   make build:release     # release build (prod API)
#   make lint format       # swiftlint + swiftformat
#
# Every env-specific target has two equivalent forms: `make run:prod` or
# `make run ENV=prod`. The ENV variable also works on build/test/etc.
#
# Environments (ENV):
#   dev      debug build   -> dev API  (http://localhost:3000)   [default]
#   prod     debug build   -> prod API (https://dust.tt)
#   release  release build -> prod API (https://dust.tt)

PROJECT   := Dust.xcodeproj
SCHEME    := Dust
BUNDLE_ID := com.dust.mobile
BUILD_DIR := build
SIMULATOR ?= iPhone 17 Pro
ENV       ?= dev

# Map ENV -> Xcode build configuration.
ifeq ($(ENV),dev)
  CONFIG := Dev
else ifeq ($(ENV),prod)
  CONFIG := Prod
else ifeq ($(ENV),release)
  CONFIG := Release
else
  $(error Unknown ENV '$(ENV)'. Use one of: dev, prod, release)
endif

DESTINATION := platform=iOS Simulator,name=$(SIMULATOR)
APP_PATH    := $(BUILD_DIR)/Build/Products/$(CONFIG)-iphonesimulator/Dust.app

# Pretty-print xcodebuild output if xcbeautify is installed (`brew install xcbeautify`).
XCBEAUTIFY := $(shell command -v xcbeautify 2>/dev/null)
ifdef XCBEAUTIFY
  BEAUTIFY := | xcbeautify
else
  BEAUTIFY :=
endif

XCODEBUILD := set -o pipefail && xcodebuild \
	-project $(PROJECT) \
	-scheme $(SCHEME) \
	-configuration $(CONFIG) \
	-sdk iphonesimulator \
	-destination '$(DESTINATION)' \
	-derivedDataPath $(BUILD_DIR)

.DEFAULT_GOAL := help

## help: list available targets
.PHONY: help
help:
	@echo "Dust iOS — make targets (ENV=dev|prod|release, default: $(ENV))"
	@echo
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo
	@echo "Per-env aliases: build:dev build:prod build:release run:dev run:prod run:release"
	@echo
	@echo "Examples:"
	@echo "  make run:prod"
	@echo "  make build:release"
	@echo "  make run SIMULATOR='iPhone 16 Pro'"

## generate: (re)generate Dust.xcodeproj from project.yml via XcodeGen
.PHONY: generate
generate:
	xcodegen generate

## build: build the app for the simulator (ENV selects the config)
.PHONY: build
build: generate
	$(XCODEBUILD) CODE_SIGNING_ALLOWED=NO build $(BEAUTIFY)

## run: build, then boot the simulator, install and launch the app
.PHONY: run
run: build
	@echo "==> Booting $(SIMULATOR)"
	@xcrun simctl boot "$(SIMULATOR)" 2>/dev/null || true
	@open -a Simulator
	@echo "==> Installing $(APP_PATH)"
	@xcrun simctl install "$(SIMULATOR)" "$(APP_PATH)"
	@echo "==> Launching $(BUNDLE_ID) ($(CONFIG))"
	@xcrun simctl launch "$(SIMULATOR)" $(BUNDLE_ID)

## test: run the test suite on the simulator
.PHONY: test
test: generate
	$(XCODEBUILD) CODE_SIGNING_ALLOWED=NO test $(BEAUTIFY)

## logs: stream the running app's logs from the simulator
.PHONY: logs
logs:
	xcrun simctl spawn "$(SIMULATOR)" log stream --level debug --style compact \
		--predicate 'subsystem == "$(BUNDLE_ID)"'

## lint: run SwiftLint
.PHONY: lint
lint:
	swiftlint lint --quiet

## lint-fix: run SwiftLint with autocorrect
.PHONY: lint-fix
lint-fix:
	swiftlint --fix

## format: format sources with SwiftFormat
.PHONY: format
format:
	swiftformat Dust SparkleTokens/Sources

## format-check: check formatting without writing changes
.PHONY: format-check
format-check:
	swiftformat Dust SparkleTokens/Sources --lint

## clean: remove build artifacts
.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)

# Convenience aliases per environment: `make build:dev`, `make run:prod`, etc.
.PHONY: build\:dev build\:prod build\:release run\:dev run\:prod run\:release
build\:dev:     ; @$(MAKE) build ENV=dev
build\:prod:    ; @$(MAKE) build ENV=prod
build\:release: ; @$(MAKE) build ENV=release
run\:dev:       ; @$(MAKE) run   ENV=dev
run\:prod:      ; @$(MAKE) run   ENV=prod
run\:release:   ; @$(MAKE) run   ENV=release
