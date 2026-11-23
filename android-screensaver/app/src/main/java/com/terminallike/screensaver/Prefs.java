package com.terminallike.screensaver;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

public final class Prefs {
    private static final String FILE_NAME = "terminallike_screensaver_prefs";
    private static final String KEY_APP_URL = "app_url";
    private static final String KEY_SCREEN_BRIGHT = "screen_bright";

    private Prefs() {}

    public static String getAppUrl(Context context) {
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        String saved = sp.getString(KEY_APP_URL, BuildConfig.DEFAULT_APP_URL);
        if (saved == null || saved.trim().isEmpty()) {
            return BuildConfig.DEFAULT_APP_URL;
        }
        return saved.trim();
    }

    public static void setAppUrl(Context context, String url) {
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_APP_URL, url.trim()).apply();
    }

    public static boolean isScreenBright(Context context) {
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        return sp.getBoolean(KEY_SCREEN_BRIGHT, true);
    }

    public static void setScreenBright(Context context, boolean bright) {
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        sp.edit().putBoolean(KEY_SCREEN_BRIGHT, bright).apply();
    }

    public static boolean isValidHttpUrl(String raw) {
        if (raw == null) return false;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return false;
        Uri uri = Uri.parse(trimmed);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && host != null && !host.trim().isEmpty();
    }

    /**
     * Appends ?screensaver=1 so Terminallike starts immediately in clean TV screensaver mode
     * (cursor hidden, floating controls hidden, keyboard hints hidden).
     */
    public static String buildScreensaverUrl(Context context) {
        String base = getAppUrl(context);
        Uri parsed = Uri.parse(base);
        if (parsed.getQueryParameter("screensaver") != null) {
            return base;
        }
        return parsed.buildUpon()
                .appendQueryParameter("screensaver", "1")
                .build()
                .toString();
    }
}
