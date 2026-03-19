package com.strasberry.plugins.capacitorcast

import com.google.android.gms.cast.CastMediaControlIntent

internal object CastRuntimeConfig {
    @Volatile
    var receiverApplicationId: String = CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID

    @Volatile
    var autoJoinPolicy: String = "origin_scoped"
}
