plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.androidx.baselineprofile)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.dust.mobile.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dust.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        manifestPlaceholders["authScheme"] = "dust"
        manifestPlaceholders["authHost"] = "auth"
    }

    buildTypes {
        debug {
            buildConfigField("String", "DUST_API_BASE_URL", "\"http://10.0.2.2:3000\"")
            buildConfigField("String", "DUST_APP_URL", "\"http://10.0.2.2:3000\"")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_ENABLED", "true")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_BUTTON_ENABLED", "true")
        }
        create("prodDebug") {
            initWith(getByName("debug"))
            matchingFallbacks += listOf("debug")
            buildConfigField("String", "DUST_API_BASE_URL", "\"https://dust.tt\"")
            buildConfigField("String", "DUST_APP_URL", "\"https://app.dust.tt\"")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_ENABLED", "true")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_BUTTON_ENABLED", "false")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "DUST_API_BASE_URL", "\"https://dust.tt\"")
            buildConfigField("String", "DUST_APP_URL", "\"https://app.dust.tt\"")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_ENABLED", "false")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_BUTTON_ENABLED", "false")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        create("phoneRelease") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("debug")
        }
        create("benchmarkRelease") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_ENABLED", "true")
        }
        create("nonMinifiedRelease") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("Boolean", "LOCAL_AUTH_BYPASS_ENABLED", "true")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets["prodDebug"].java.srcDir("src/debug/kotlin")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions.moduleName.set("dust_android")
}

dependencies {
    implementation(project(":core"))

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appsearch)
    implementation(libs.androidx.appsearch.builtin.types)
    implementation(libs.androidx.appsearch.local.storage)
    implementation(libs.androidx.appsearch.platform.storage)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.datastore)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.preview)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.profileinstaller)
    implementation(libs.androidx.work.runtime)
    implementation(libs.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.adaptive)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)

    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
}

baselineProfile {
    automaticGenerationDuringBuild = false
    saveInSrc = true
    filter {
        include("com.dust.mobile.**")
    }
    variants {
        create("release") {
            from(project(":baselineprofile"))
        }
    }
}
