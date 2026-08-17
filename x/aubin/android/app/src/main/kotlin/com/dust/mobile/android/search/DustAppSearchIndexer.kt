package com.dust.mobile.android.search

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.appsearch.app.AppSearchSession
import androidx.appsearch.app.PutDocumentsRequest
import androidx.appsearch.app.SearchSpec
import androidx.appsearch.app.SetSchemaRequest
import androidx.appsearch.builtintypes.Thing
import androidx.appsearch.localstorage.LocalStorage
import androidx.appsearch.platformstorage.PlatformStorage
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.Space
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal class DustAppSearchIndexer(context: Context) {
    private val context = context.applicationContext
    private val writeMutex = Mutex()

    val supportsSystemSurfaces: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    suspend fun indexWorkspaceContent(
        workspaceId: String,
        conversations: List<Conversation>,
        pods: List<Space>,
        displayedBySystem: Boolean,
    ) {
        replaceNamespace(
            namespace = contentNamespace(workspaceId),
            entries = conversationSearchEntries(workspaceId, conversations) +
                podSearchEntries(workspaceId, pods),
            displayedBySystem = displayedBySystem,
        )
    }

    suspend fun indexAgents(
        workspaceId: String,
        agents: List<LightAgentConfiguration>,
        displayedBySystem: Boolean,
    ) {
        replaceNamespace(
            namespace = agentNamespace(workspaceId),
            entries = agentSearchEntries(workspaceId, agents),
            displayedBySystem = displayedBySystem,
        )
    }

    suspend fun updateSystemVisibility(displayedBySystem: Boolean) {
        writeMutex.withLock {
            useSession { session -> session.setSchemaAsync(schemaRequest(displayedBySystem)).get() }
        }
    }

    suspend fun clear() {
        writeMutex.withLock {
            useSession { session ->
                session.setSchemaAsync(
                    SetSchemaRequest.Builder()
                        .setForceOverride(true)
                        .build(),
                ).get()
                session.requestFlushAsync().get()
            }
        }
    }

    private suspend fun replaceNamespace(
        namespace: String,
        entries: List<AndroidSearchEntry>,
        displayedBySystem: Boolean,
    ) {
        writeMutex.withLock {
            useSession { session ->
                session.setSchemaAsync(schemaRequest(displayedBySystem)).get()
                session.removeAsync(
                    "",
                    SearchSpec.Builder().addFilterNamespaces(namespace).build(),
                ).get()
                if (entries.isNotEmpty()) {
                    val request = PutDocumentsRequest.Builder().apply {
                        entries.forEach { addDocuments(it.toThing()) }
                    }.build()
                    check(session.putAsync(request).get().isSuccess) {
                        "AppSearch rejected one or more Dust search entries"
                    }
                }
                session.requestFlushAsync().get()
            }
        }
    }

    private fun schemaRequest(displayedBySystem: Boolean): SetSchemaRequest =
        SetSchemaRequest.Builder()
            .addDocumentClasses(Thing::class.java)
            .setDocumentClassDisplayedBySystem(
                Thing::class.java,
                displayedBySystem && supportsSystemSurfaces,
            )
            .build()

    private suspend fun <T> useSession(block: (AppSearchSession) -> T): T =
        withContext(Dispatchers.IO) {
            openSession().use(block)
        }

    private fun openSession(): AppSearchSession =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            openPlatformSession()
        } else {
            LocalStorage.createSearchSessionAsync(
                LocalStorage.SearchContext.Builder(context, DATABASE_NAME).build(),
            ).get()
        }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun openPlatformSession(): AppSearchSession =
        PlatformStorage.createSearchSessionAsync(
            PlatformStorage.SearchContext.Builder(context, DATABASE_NAME).build(),
        ).get()

    private fun AndroidSearchEntry.toThing(): Thing =
        Thing.Builder(namespace, id)
            .setName(title)
            .setDescription(description)
            .setAlternateNames(alternateNames)
            .setUrl(deepLink)
            .setDocumentScore(score)
            .setCreationTimestampMillis(creationTimestampMillis)
            .build()

    private companion object {
        const val DATABASE_NAME = "dust_search"
    }
}
