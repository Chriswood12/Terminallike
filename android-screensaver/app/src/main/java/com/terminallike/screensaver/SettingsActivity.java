package com.terminallike.screensaver;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.Toast;

/**
 * D-pad friendly Android TV settings screen for configuring the Terminallike Vercel URL.
 *
 * Also supports one-line ADB configuration:
 *   adb shell am start -n com.terminallike.screensaver/.SettingsActivity --es url https://your-app.vercel.app
 */
public class SettingsActivity extends Activity {
    private EditText editUrl;
    private CheckBox checkBright;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        editUrl = findViewById(R.id.edit_url);
        checkBright = findViewById(R.id.check_bright);
        Button btnSave = findViewById(R.id.btn_save);
        Button btnPreview = findViewById(R.id.btn_preview);
        Button btnSystemSettings = findViewById(R.id.btn_system_settings);

        // Allow setting URL directly via ADB intent extra (--es url https://...)
        String intentUrl = getIntent() != null ? getIntent().getStringExtra("url") : null;
        if (intentUrl != null && Prefs.isValidHttpUrl(intentUrl)) {
            Prefs.setAppUrl(this, intentUrl);
            Toast.makeText(this, getString(R.string.saved_toast, intentUrl.trim()), Toast.LENGTH_LONG).show();
        }

        editUrl.setText(Prefs.getAppUrl(this));
        checkBright.setChecked(Prefs.isScreenBright(this));

        btnSave.setOnClickListener(v -> saveCurrentInput(true));

        btnPreview.setOnClickListener(v -> {
            if (saveCurrentInput(false)) {
                startActivity(new Intent(this, PreviewActivity.class));
            }
        });

        btnSystemSettings.setOnClickListener(v -> openDreamSettings());

        // Focus the Save button by default so the TV keyboard doesn't pop up immediately.
        btnPreview.requestFocus();
    }

    private boolean saveCurrentInput(boolean showToast) {
        String raw = editUrl.getText().toString().trim();
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
            raw = "https://" + raw;
        }
        if (!Prefs.isValidHttpUrl(raw)) {
            Toast.makeText(this, R.string.invalid_url_toast, Toast.LENGTH_SHORT).show();
            return false;
        }
        editUrl.setText(raw);
        Prefs.setAppUrl(this, raw);
        Prefs.setScreenBright(this, checkBright.isChecked());
        if (showToast) {
            Toast.makeText(this, getString(R.string.saved_toast, raw), Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private void openDreamSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS));
        } catch (ActivityNotFoundException e) {
            try {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(this, "Open Android TV Settings → System → Ambient Mode", Toast.LENGTH_LONG).show();
            }
        }
    }
}
