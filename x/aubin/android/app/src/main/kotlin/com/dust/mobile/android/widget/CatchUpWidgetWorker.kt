package com.dust.mobile.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.dust.mobile.android.DustApplication

internal class CatchUpWidgetWorker(
    context: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as DustApplication).graph
        val tokens = graph.tokenStore.loadTokens() ?: run {
            graph.catchUpWidgetController.updateLoggedOutWidgets()
            return Result.success()
        }
        val tokenProvider = graph.tokenProvider(tokens) { graph.clearPersistedSession() }
        return runCatching {
            graph.catchUpWidgetController.refreshFromNetwork(tokenProvider)
        }.fold(
            onSuccess = { Result.success() },
            onFailure = { Result.retry() },
        )
    }
}
