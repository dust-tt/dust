package com.dust.mobile.android.notifications

import com.dust.mobile.android.DustApplication
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class DustFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val payload = DustNotificationPayload.fromData(message.data, message.sentTime) ?: return
        (application as DustApplication).graph.catchUpWidgetController.onNotification(payload)
        NotificationRenderer(this).show(payload)
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        (application as DustApplication).graph.pushRegistrationManager.onNewToken(token)
    }
}
