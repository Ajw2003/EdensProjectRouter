package com.edens.router;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

// Runs www/remote.js (key row, Needs-you notifications) on the PC's page, not on the app's own local page.
// shortcut: no foreground service, so Android may pause this WebView (and the link) a few minutes after the app
// leaves the screen; upgrade by adding a foreground service with a persistent notification.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final String script = readAsset("public/remote.js");
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                boolean local = url != null && url.contains("//localhost");
                if (!local && script != null) view.evaluateJavascript(script, null);
            }
        });
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            android.util.Log.e("EdensRouter", "could not read " + name, e);
            return null;
        }
    }
}
