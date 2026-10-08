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
SIMULATOR ?= iPhone 18 Pro
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

# Quiet by default (warnings and errors only). `make build V=1` shows everything.
ifeq ($(V),1)
  QUIET :=
  XCODEGEN_QUIET :=
  FILTER :=
else
  QUIET := -quiet
  XCODEGEN_QUIET := --quiet
  FILTER := 2>&1 | awk '/^Failed frontend command:/ { skip = 1; next } skip { skip = 0; next } \
    /^note: / || /^\/\* com\.apple\.actool/ || index($$0, "$(CURDIR)/$(BUILD_DIR)/") == 1 { next } NF'
endif

XCODEBUILD := set -o pipefail && xcodebuild $(QUIET) \
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
	@echo "  make build V=1          # full xcodebuild output"

## generate: (re)generate Dust.xcodeproj from project.yml via XcodeGen
.PHONY: generate
generate:
	@xcodegen generate $(XCODEGEN_QUIET)

## build: build the app for the simulator (ENV selects the config)
.PHONY: build
build: generate
	@echo "🔨 Building $(CONFIG)"
	@$(XCODEBUILD) CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- build $(FILTER)
	@echo "✅ Built $(CONFIG)"

## run: build, then boot the simulator, install and launch the app
.PHONY: run
run: build
	@echo "📱 Booting $(SIMULATOR)"
	@xcrun simctl boot "$(SIMULATOR)" 2>/dev/null || true
	@open -a DeviceHub 2>/dev/null || open -a Simulator
	@echo "📲 Installing and launching on $(SIMULATOR)"
	@xcrun simctl install "$(SIMULATOR)" "$(APP_PATH)"
	@xcrun simctl launch "$(SIMULATOR)" $(BUNDLE_ID) >/dev/null
	@echo "🚀 Dust ($(CONFIG)) running on $(SIMULATOR)"

## test: run the test suite on the simulator
.PHONY: test
test: generate
	@echo "🧪 Testing $(CONFIG)"
	@$(XCODEBUILD) CODE_SIGNING_ALLOWED=NO test $(FILTER)
	@echo "✅ Tests passed"

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

## tokens: regenerate SparkleTokens from ../../../sparkle
.PHONY: tokens
tokens:
	node scripts/generate-sparkle-tokens.mjs
	swiftformat SparkleTokens/Sources

## clean: remove build artifacts
.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)

# Convenience aliases per environment: `make build:dev`, `make run:prod`, etc.
.PHONY: build\:dev build\:prod build\:release run\:dev run\:prod run\:release
build\:dev:     ; @$(MAKE) --no-print-directory build ENV=dev
build\:prod:    ; @$(MAKE) --no-print-directory build ENV=prod
build\:release: ; @$(MAKE) --no-print-directory build ENV=release
run\:dev:       ; @$(MAKE) --no-print-directory run   ENV=dev
run\:prod:      ; @$(MAKE) --no-print-directory run   ENV=prod
run\:release:   ; @$(MAKE) --no-print-directory run   ENV=release
