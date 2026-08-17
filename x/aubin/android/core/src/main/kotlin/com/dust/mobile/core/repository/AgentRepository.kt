package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.AgentConfigurationsResponse
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class AgentRepository(
    private val apiClient: ApiClient,
) {
    private val cacheScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val cacheMutex = Mutex()
    private val cache = mutableMapOf<String, AgentCacheEntry>()
    private val inFlight = mutableMapOf<String, Deferred<List<LightAgentConfiguration>>>()

    suspend fun fetchAgents(
        workspaceId: String,
        tokenProvider: TokenProvider,
    ): List<LightAgentConfiguration> {
        val now = System.currentTimeMillis()
        val request = cacheMutex.withLock {
            cache[workspaceId]
                ?.takeIf { now - it.fetchedAtMillis < CACHE_TTL_MILLIS }
                ?.let { return it.agents }

            inFlight[workspaceId] ?: cacheScope.async {
                apiClient.authenticatedGet<AgentConfigurationsResponse>(
                    "${Endpoints.agentConfigurations(workspaceId)}?view=list",
                    tokenProvider,
                ).agentConfigurations
            }.also { inFlight[workspaceId] = it }
        }

        return try {
            request.await().also { agents ->
                cacheMutex.withLock {
                    cache[workspaceId] = AgentCacheEntry(
                        agents = agents,
                        fetchedAtMillis = System.currentTimeMillis(),
                    )
                    if (inFlight[workspaceId] === request) inFlight.remove(workspaceId)
                }
            }
        } catch (error: Throwable) {
            cacheMutex.withLock {
                if (inFlight[workspaceId] === request) inFlight.remove(workspaceId)
            }
            throw error
        }
    }

    suspend fun peekCachedAgents(workspaceId: String): List<LightAgentConfiguration>? =
        cacheMutex.withLock { cache[workspaceId]?.agents }

    suspend fun clearCache() {
        cacheMutex.withLock {
            cache.clear()
            inFlight.values.forEach { it.cancel() }
            inFlight.clear()
        }
    }

    private data class AgentCacheEntry(
        val agents: List<LightAgentConfiguration>,
        val fetchedAtMillis: Long,
    )

    private companion object {
        const val CACHE_TTL_MILLIS = 5 * 60 * 1_000L
    }
}
