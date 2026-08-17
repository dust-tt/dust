package com.dust.mobile.android.quicksettings

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.core.net.toUri
import androidx.core.service.quicksettings.PendingIntentActivityWrapper
import androidx.core.service.quicksettings.TileServiceCompat
import com.dust.mobile.android.MainActivity
import com.dust.mobile.android.R
import com.dust.mobile.android.auth.AndroidTokenStore

class AskDustTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val isSignedIn = AndroidTokenStore(this).loadTokens() != null
        qsTile?.apply {
            label = getString(R.string.ask_dust_tile_label)
            state = if (isSignedIn) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            contentDescription = getString(R.string.ask_dust_tile_label)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                subtitle = if (isSignedIn) "New conversation" else "Sign in"
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                stateDescription = if (isSignedIn) "Ready" else "Sign in required"
            }
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        val launch = Runnable(::launchComposer)
        if (isLocked && isSecure) {
            unlockAndRun(launch)
        } else {
            launch.run()
        }
    }

    private fun launchComposer() {
        val intent = Intent(Intent.ACTION_VIEW, "dust://compose".toUri(), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        TileServiceCompat.startActivityAndCollapse(
            this,
            PendingIntentActivityWrapper(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT,
                false,
            ),
        )
    }
}
