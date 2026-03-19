package com.strasberry.plugins.capacitorcast

import android.content.Context
import android.content.pm.PackageManager
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions

class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions {
        val receiverApplicationId =
            CastRuntimeConfig.receiverApplicationId.ifBlank {
                readReceiverApplicationIdFromManifest(context)
                    ?: CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID
            }

        val mediaOptions = CastMediaOptions.Builder().build()

        return CastOptions.Builder()
            .setReceiverApplicationId(receiverApplicationId)
            .setCastMediaOptions(mediaOptions)
            .setEnableReconnectionService(true)
            .setResumeSavedSession(true)
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null

    private fun readReceiverApplicationIdFromManifest(context: Context): String? {
        return try {
            val appInfo = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA,
            )

            appInfo.metaData?.getString("com.strasberry.plugins.capacitorcast.RECEIVER_APPLICATION_ID")
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }
}
