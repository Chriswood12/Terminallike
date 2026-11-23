package com.terminallike.screensaver;

import android.service.dreams.DreamService;
import android.view.View;
import android.view.WindowManager;

/**
 * Android TV / Google TV System Screensaver (DreamService) that displays the live
 * Terminallike Vercel web app fullscreen in WebView.
 *
 * Pressing any button on the TV remote immediately dismisses the screensaver and returns
 * to Projectivy Launcher (or whichever app was open).
 */
public class TerminallikeDreamService extends DreamService {
    private ScreensaverWebViewFactory.Controller webController;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();

        // Any remote press exits the screensaver immediately.
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(Prefs.isScreenBright(this));

        if (getWindow() != null) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }

        webController = ScreensaverWebViewFactory.create(this);
        setContentView(webController.getWebView());
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (webController != null) {
            webController.load();
        }
    }

    @Override
    public void onDreamingStopped() {
        super.onDreamingStopped();
        if (webController != null) {
            webController.getWebView().onPause();
        }
    }

    @Override
    public void onDetachedFromWindow() {
        if (webController != null) {
            webController.destroy();
            webController = null;
        }
        super.onDetachedFromWindow();
    }
}
