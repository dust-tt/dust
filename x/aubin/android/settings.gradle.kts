pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DustAndroid"
include(":core")

if (providers.gradleProperty("skipAndroidApp").orNull != "true") {
    include(":app")
    include(":baselineprofile")
}
