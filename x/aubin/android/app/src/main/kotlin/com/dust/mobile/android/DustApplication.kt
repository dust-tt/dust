package com.dust.mobile.android

import android.app.Application
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.notifications.NotificationChannels
import com.dust.mobile.android.notifications.NotificationPresentationState

class DustApplication : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        NotificationChannels.create(this)
        NotificationPresentationState.register(this)
        graph.catchUpWidgetController.publishGeneratedPreview()
    }
}
