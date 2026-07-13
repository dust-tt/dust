plugins {
    alias(libs.plugins.android.application)
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
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

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

dependencies {
    implementation(project(":core"))

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)

    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
}
