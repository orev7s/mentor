package com.mentor.app;

import android.app.DownloadManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // Insets in CSS pixels, pushed into the page so the header clears the status
    // bar and the composer clears the keyboard.
    private int insetTop;
    private int insetBottom;
    private int insetLeft;
    private int insetRight;
    private int insetKeyboard;
    private boolean pageLoaded;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The JS download button calls this plugin. Register before super.onCreate, which loads plugins.
        registerPlugin(DownloaderPlugin.class);
        // Read aloud uses the Android text-to-speech engine through this plugin.
        registerPlugin(SpeakerPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 15 and later force edge-to-edge, so the page runs under the
        // system bars. Draw there on purpose and hand the inset sizes to CSS.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        final WebView webView = getBridge().getWebView();

        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    pageLoaded = true;
                    injectInsets(view);
                }
            }
        );

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            float density = getResources().getDisplayMetrics().density;
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            insetTop = Math.round(bars.top / density);
            insetBottom = Math.round(bars.bottom / density);
            insetLeft = Math.round(bars.left / density);
            insetRight = Math.round(bars.right / density);
            insetKeyboard = Math.round(ime.bottom / density);
            if (pageLoaded) injectInsets((WebView) view);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);

        // Fallback for any link the agent writes in chat, so the WebView never
        // quietly saves a blob as `download.bin`.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            // The listener often reports a generic type. Fall back to the file extension so
            // Android stores, and later opens, a PDF or DOCX as itself.
            if (mimeType == null || mimeType.isEmpty() || "application/octet-stream".equals(mimeType)) {
                String guessed = guessMime(fileName);
                if (guessed != null) mimeType = guessed;
            }
            if (mimeType != null) {
                request.setMimeType(mimeType);
            }
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            request.setTitle(fileName);
            request.setDescription(fileName);
            request.allowScanningByMediaScanner();
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager != null) {
                manager.enqueue(request);
            }
        });
    }

    /**
     * The Android back button. Give the web UI first refusal so it can close an
     * overlay, then walk back through the WebView's own history, and only then
     * send the app to the background instead of killing it.
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            "window.__mentorHandleBack ? (window.__mentorHandleBack() ? '1' : '0') : '0'",
            value -> {
                boolean handled = value != null && value.contains("1");
                if (handled) return;
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        );
    }

    /** MIME type from a file name, or null when the extension is unknown. */
    private static String guessMime(String fileName) {
        if (fileName == null) return null;
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) return null;
        String ext = fileName.substring(dot + 1).toLowerCase();
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
    }

    private void injectInsets(WebView view) {
        String js =
            "(function(){var s=document.documentElement.style;" +
            "s.setProperty('--safe-top-native','" +
            insetTop +
            "px');" +
            "s.setProperty('--safe-bottom-native','" +
            insetBottom +
            "px');" +
            "s.setProperty('--safe-left-native','" +
            insetLeft +
            "px');" +
            "s.setProperty('--safe-right-native','" +
            insetRight +
            "px');" +
            "s.setProperty('--keyboard-inset-native','" +
            insetKeyboard +
            "px');})();";
        view.post(() -> view.evaluateJavascript(js, null));
    }
}