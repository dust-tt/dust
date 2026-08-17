package com.dust.mobile.android.ui.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.onActionContainer

@Composable
internal fun LoginScreen(
    onLogin: () -> Unit,
    onSignUp: () -> Unit,
    onLocalPreview: (() -> Unit)? = null,
    notice: String? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.dust_logo),
                contentDescription = stringResource(R.string.dust_logo_content_description),
                modifier = Modifier.size(width = 144.dp, height = 36.dp),
            )
            Text(
                "The Operating System for AI Agents",
                color = MaterialTheme.colorScheme.onBackground,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Normal,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(32.dp))
        val visibleNotice = notice?.takeIf { it.isNotBlank() }
        if (visibleNotice != null) {
            LoginNotice(visibleNotice)
            Spacer(Modifier.height(12.dp))
        }
        DustButton(
            label = "Sign in",
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            onClick = onLogin,
        )
        Spacer(Modifier.height(12.dp))
        DustButton(
            label = "Sign up",
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            onClick = onSignUp,
            variant = DustButtonVariant.Outline,
        )
        if (onLocalPreview != null) {
            Spacer(Modifier.height(8.dp))
            DustButton(
                label = "Try sample workspace",
                modifier = Modifier.fillMaxWidth(),
                onClick = onLocalPreview,
                variant = DustButtonVariant.Text,
            )
        }
        Spacer(Modifier.height(48.dp))
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun LoginNotice(message: String) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 360.dp),
        color = MaterialTheme.colorScheme.actionContainer,
        contentColor = MaterialTheme.colorScheme.onActionContainer,
        shape = RoundedCornerShape(DustRadii.control),
    ) {
        Text(
            message,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
    }
}
