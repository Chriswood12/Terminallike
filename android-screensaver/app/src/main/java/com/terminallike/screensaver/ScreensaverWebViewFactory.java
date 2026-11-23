package com.terminallike.screensaver;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Configures a fullscreen OLED-safe WebView for Terminallike with automatic offline retry.
 */
public final class ScreensaverWebViewFactory {
    private static final long RETRY_DELAY_MS = 15_000L;

    private ScreensaverWebViewFactory() {}

    public static final class Controller {
        private final WebView webView;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final String targetUrl;
        private boolean destroyed = false;

        private final Runnable retryTask = new Runnable() {
            @Override
            public void run() {
                if (!destroyed) {
                    webView.loadUrl(targetUrl);
                }
            }
        };

        @SuppressLint("SetJavaScriptEnabled")
        Controller(Context context, String url) {
            this.targetUrl = url;
            this.webView = new WebView(context);
            this.webView.setBackgroundColor(Color.BLACK);
            this.webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
            this.webView.setVerticalScrollBarEnabled(false);
            this.webView.setHorizontalScrollBarEnabled(false);
            this.webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            this.webView.setFocusable(false);
            this.webView.setFocusableInTouchMode(false);
            this.webView.setKeepScreenOn(true);

            WebSettings settings = this.webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setTextZoom(100);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            this.webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onReceivedError(
                        WebView view,
                        WebResourceRequest request,
                        WebResourceError error
                ) {
                    if (request != null && request.isForMainFrame() && !destroyed) {
                        showOfflineFallbackAndRetry(view, error != null ? error.getDescription() : "Network error");
                    }
                }

                @Override
                public void onPageFinished(WebView view, String loadedUrl) {
                    if (loadedUrl != null && loadedUrl.startsWith("http")) {
                        handler.removeCallbacks(retryTask);
                    }
                }
            });
        }

        private void showOfflineFallbackAndRetry(WebView view, CharSequence reason) {
            String safeReason = reason == null ? "Offline" : reason.toString()
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;");
            String html = "<!doctype html><html><head><meta charset='utf-8'>"
                    + "<style>html,body{margin:0;height:100%;background:#000;color:#8c877e;"
                    + "font-family:monospace;display:flex;align-items:center;justify-content:center;"
                    + "text-align:center;} .box{max-width:640px;padding:24px;} "
                    + "h1{color:#e8e4dc;font-size:20px;font-weight:500;letter-spacing:0.08em;} "
                    + "p{font-size:14px;line-height:1.6;}</style></head><body><div class='box'>"
                    + "<h1>TERMINALLIKE</h1>"
                    + "<p>Waiting for connection (" + safeReason + ")…<br>Retrying automatically.</p>"
                    + "</div></body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
            handler.removeCallbacks(retryTask);
            handler.postDelayed(retryTask, RETRY_DELAY_MS);
        }

        public WebView getWebView() {
            return webView;
        }

        public void load() {
            if (!destroyed) {
                webView.loadUrl(targetUrl);
            }
        }

        public void destroy() {
            destroyed = true;
            handler.removeCallbacks(retryTask);
            webView.stopLoading();
            webView.setWebViewClient(new WebViewClient());
            webView.loadUrl("about:blank");
            webView.onPause();
            webView.destroy();
        }
    }

    public static Controller create(Context context) {
        return new Controller(context, Prefs.buildScreensaverUrl(context));
    }
}
