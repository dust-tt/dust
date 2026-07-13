package com.dust.mobile.core.model

enum class CatchUpSwipeAction {
    MARK_AS_READ,
    KEEP_FOR_LATER,
}

fun catchUpSwipeAction(dragOffsetPx: Float, thresholdPx: Float): CatchUpSwipeAction? =
    when {
        dragOffsetPx > thresholdPx -> CatchUpSwipeAction.MARK_AS_READ
        dragOffsetPx < -thresholdPx -> CatchUpSwipeAction.KEEP_FOR_LATER
        else -> null
    }
