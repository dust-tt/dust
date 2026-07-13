GRADLE ?= ./gradlew
ANDROID_SDK ?= $(firstword $(ANDROID_HOME) $(ANDROID_SDK_ROOT) $(wildcard $(HOME)/Library/Android/sdk) $(wildcard $(HOME)/Android/Sdk))
ifneq ($(strip $(ANDROID_SDK)),)
export ANDROID_HOME := $(ANDROID_SDK)
export ANDROID_SDK_ROOT := $(ANDROID_SDK)
endif
ADB ?= $(if $(ANDROID_SDK),$(ANDROID_SDK)/platform-tools/adb,adb)
EMULATOR ?= $(if $(ANDROID_SDK),$(ANDROID_SDK)/emulator/emulator,)
AVD ?= DustSamsungS23
SYSTEM_IMAGE ?= system-images;android-35;google_apis;arm64-v8a
PACKAGE ?= com.dust.mobile
ACTIVITY ?= .android.MainActivity
DEBUG_APK ?= app/build/outputs/apk/debug/app-debug.apk
PROD_DEBUG_APK ?= app/build/outputs/apk/prodDebug/app-prodDebug.apk
PRESENTATION_AUTH_TIMEOUT_SECONDS ?= $(if $(AUTH_TIMEOUT_SECONDS),$(AUTH_TIMEOUT_SECONDS),900)

.DEFAULT_GOAL := help

.PHONY: help show-app bypass-login doctor test verify presentation-check presentation-refresh presentation-check-workos presentation-capture-workos presentation-check-clean presentation-index presentation-summary check-presentation-pack check-brand-assets check-build-config core-test app-test build assemble-debug assemble-prod-debug install-debug install-prod-debug run-debug run-prod-debug run-prod-debug-local-preview smoke-samsung-prod smoke-samsung-prod-visible smoke-samsung-prod-visible-fresh smoke-samsung-local-preview present-samsung-local-preview smoke-samsung-auth-resilience smoke-samsung-auth-resilience-current smoke-samsung-authenticated-preflight smoke-samsung-authenticated smoke-samsung-demo-ui lint-debug lint-prod-debug logs uninstall clean-local

## help: list available targets
help:
	@echo "Dust Android - make targets"
	@echo
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo
	@echo "Variables: GRADLE=$(GRADLE) ADB=$(ADB) PACKAGE=$(PACKAGE) ACTIVITY=$(ACTIVITY) AVD=$(AVD) ANDROID_SERIAL=<serial>"

## show-app: install prodDebug and open the credential-free sample workspace inbox on the attached visible device
show-app:
	@set -e; \
	$(MAKE) run-prod-debug-local-preview; \
	scripts/print-presentation-summary.sh

## bypass-login: alias for show-app
bypass-login: show-app

## doctor: check Java, Android SDK, adb, and Samsung emulator readiness
doctor:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" bash scripts/doctor.sh

## test: run all Gradle tests
test:
	$(GRADLE) test

## verify: run the full Android test/build/lint gate
verify: check-brand-assets
	$(GRADLE) :core:test :app:testDebugUnitTest :app:assembleDebug :app:lintDebug :app:assembleProdDebug :app:lintProdDebug :app:assembleRelease
	$(MAKE) check-build-config

## presentation-check: run the full readiness gate, verify artifacts, and leave the Samsung sample workspace inbox open
presentation-check:
	$(MAKE) doctor
	$(MAKE) verify
	$(MAKE) smoke-samsung-prod-visible
	$(MAKE) smoke-samsung-auth-resilience-current
	$(MAKE) smoke-samsung-demo-ui
	$(MAKE) smoke-samsung-authenticated-preflight
	$(MAKE) present-samsung-local-preview
	$(MAKE) presentation-index
	$(MAKE) clean-local
	$(MAKE) check-presentation-pack REQUIRE_DEMO_ARTIFACTS=1

## presentation-refresh: refresh screenshots/index without full verify and leave the Samsung sample workspace inbox open
presentation-refresh:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) smoke-samsung-demo-ui; \
	$(MAKE) smoke-samsung-authenticated-preflight; \
	$(MAKE) present-samsung-local-preview; \
	$(MAKE) presentation-index; \
	$(MAKE) clean-local; \
	$(MAKE) check-presentation-pack REQUIRE_DEMO_ARTIFACTS=1

## presentation-check-workos: run the full readiness gate with manual WorkOS sign-in capture
presentation-check-workos:
	$(MAKE) doctor
	$(MAKE) verify
	$(MAKE) smoke-samsung-prod-visible
	$(MAKE) smoke-samsung-auth-resilience-current
	$(MAKE) smoke-samsung-demo-ui
	AUTH_TIMEOUT_SECONDS="$(PRESENTATION_AUTH_TIMEOUT_SECONDS)" $(MAKE) smoke-samsung-authenticated
	$(MAKE) present-samsung-local-preview
	$(MAKE) presentation-index
	$(MAKE) clean-local
	$(MAKE) check-presentation-pack REQUIRE_DEMO_ARTIFACTS=1

## presentation-capture-workos: capture real WorkOS screenshots after presentation-check is already fresh
presentation-capture-workos:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	AUTH_TIMEOUT_SECONDS="$(PRESENTATION_AUTH_TIMEOUT_SECONDS)" $(MAKE) smoke-samsung-authenticated; \
	$(MAKE) present-samsung-local-preview; \
	$(MAKE) presentation-index; \
	$(MAKE) clean-local; \
	$(MAKE) check-presentation-pack REQUIRE_DEMO_ARTIFACTS=1

## presentation-check-clean: alias for presentation-check
presentation-check-clean: presentation-check

## presentation-index: write a single HTML entry point for current Samsung review artifacts
presentation-index:
	scripts/write-presentation-index.sh

## presentation-summary: print current presentation entry points and refresh commands
presentation-summary:
	@scripts/print-presentation-summary.sh

## check-presentation-pack: verify current Samsung presentation artifacts and final app state
check-presentation-pack:
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" REQUIRE_DEMO_ARTIFACTS="$(REQUIRE_DEMO_ARTIFACTS)" scripts/check-presentation-pack.sh

## check-brand-assets: verify Android Dust logos match the source brand SVG colors
check-brand-assets:
	scripts/check-brand-assets.sh

## check-build-config: verify generated build variants use expected URLs and bypass flags
check-build-config:
	$(GRADLE) :app:generateDebugBuildConfig :app:generateProdDebugBuildConfig :app:generateReleaseBuildConfig :app:processDebugMainManifest :app:processProdDebugMainManifest :app:processReleaseMainManifest
	scripts/check-build-config.sh

## core-test: run JVM tests for the core module only
core-test:
	$(GRADLE) -PskipAndroidApp=true :core:test

## app-test: run Android app JVM tests
app-test:
	$(GRADLE) :app:testDebugUnitTest

## build: run the full Gradle build
build:
	$(GRADLE) build

## assemble-debug: build the debug APK
assemble-debug:
	$(GRADLE) :app:assembleDebug

## assemble-prod-debug: build a debuggable APK pointed at production
assemble-prod-debug:
	$(GRADLE) :app:assembleProdDebug

## install-debug: build and install the debug APK on the attached device/emulator
install-debug: assemble-debug
	$(ADB) install -r $(DEBUG_APK)

## install-prod-debug: build and install the production-targeted debug APK
install-prod-debug: assemble-prod-debug
	$(ADB) install -r $(PROD_DEBUG_APK)

## run-debug: install and launch the debug app on the attached device/emulator
run-debug: install-debug
	$(ADB) shell am start -n $(PACKAGE)/$(ACTIVITY)

## run-prod-debug: install and launch the production-targeted debug app
run-prod-debug: install-prod-debug
	$(ADB) shell am start -n $(PACKAGE)/$(ACTIVITY)

## run-prod-debug-local-preview: install prodDebug and open the local preview session
run-prod-debug-local-preview:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) install-prod-debug; \
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/open-local-preview.sh

## smoke-samsung-prod: run prodDebug smoke checks on a Samsung-sized emulator/device
smoke-samsung-prod:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/smoke-samsung-prod.sh

## smoke-samsung-prod-visible: run prodDebug smoke checks and leave a visible Samsung emulator open
smoke-samsung-prod-visible:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" VISIBLE=1 KEEP_EMULATOR=1 scripts/smoke-samsung-prod.sh

## smoke-samsung-prod-visible-fresh: run visible prod smoke from a wiped Samsung AVD
smoke-samsung-prod-visible-fresh:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" FRESH_AVD=1 VISIBLE=1 KEEP_EMULATOR=1 scripts/smoke-samsung-prod.sh

## smoke-samsung-local-preview: capture local preview UI flow on a Samsung-sized emulator/device
smoke-samsung-local-preview:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) install-prod-debug; \
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/smoke-samsung-local-preview.sh

## present-samsung-local-preview: refresh Samsung sample workspace artifacts and leave prodDebug sample workspace inbox open
present-samsung-local-preview:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) smoke-samsung-local-preview

## smoke-samsung-auth-resilience: verify browser auth survives app process death
smoke-samsung-auth-resilience:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" KEEP_EMULATOR=1 scripts/smoke-samsung-prod.sh
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/smoke-samsung-auth-resilience.sh

## smoke-samsung-auth-resilience-current: verify browser auth process-death handling on the installed app
smoke-samsung-auth-resilience-current:
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/smoke-samsung-auth-resilience.sh

## smoke-samsung-authenticated-preflight: verify Samsung viewport and prod login readiness without credentials
smoke-samsung-authenticated-preflight:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) install-prod-debug; \
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" PREFLIGHT_ONLY=1 scripts/smoke-samsung-authenticated.sh

## smoke-samsung-authenticated: wait for manual prod sign-in, then capture signed-in UI
smoke-samsung-authenticated:
	@set -e; \
	trap '$(MAKE) clean-local >/dev/null' EXIT; \
	$(MAKE) install-prod-debug; \
	ADB="$(ADB)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" scripts/smoke-samsung-authenticated.sh

## smoke-samsung-demo-ui: run Samsung smoke checks and capture debug demo UI screenshots
smoke-samsung-demo-ui:
	ADB="$(ADB)" EMULATOR="$(EMULATOR)" AVD="$(AVD)" SYSTEM_IMAGE="$(SYSTEM_IMAGE)" PACKAGE="$(PACKAGE)" ACTIVITY="$(ACTIVITY)" CAPTURE_DEMO_UI=1 scripts/smoke-samsung-prod.sh

## lint-debug: run Android lint for the debug variant
lint-debug:
	$(GRADLE) :app:lintDebug

## lint-prod-debug: run Android lint for the prodDebug variant
lint-prod-debug:
	$(GRADLE) :app:lintProdDebug

## logs: stream logcat for the running app process
logs:
	@pid="$$( $(ADB) shell pidof -s $(PACKAGE) | tr -d '\r' )"; \
	if [ -z "$$pid" ]; then \
		echo "No running process for $(PACKAGE). Start the app first."; \
		exit 1; \
	fi; \
	$(ADB) logcat --pid="$$pid"

## uninstall: remove the app from the attached device/emulator
uninstall:
	$(ADB) uninstall $(PACKAGE) || true

## clean-local: remove local Gradle/Kotlin build artifacts
clean-local:
	rm -rf .gradle .kotlin app/build core/build
