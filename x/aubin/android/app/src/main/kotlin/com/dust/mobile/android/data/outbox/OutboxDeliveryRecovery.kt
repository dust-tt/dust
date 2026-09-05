package com.dust.mobile.android.data.outbox

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus

internal fun PersistedOutboxItem.recoverInterruptedDelivery(): PersistedOutboxItem =
    if (status == PersistedOutboxStatus.SENDING) withUnconfirmedDelivery() else this

internal fun PersistedOutboxItem.withUnconfirmedDelivery(): PersistedOutboxItem = copy(
    status = PersistedOutboxStatus.FAILED,
    lastError = "Delivery wasn't confirmed. Check your conversations before sending again.",
)
