package com.dust.mobile.android

import android.app.Application
import com.dust.mobile.android.data.AppGraph

class DustApplication : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
    }
}
