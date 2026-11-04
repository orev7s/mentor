package com.mentor.app;

import android.app.DownloadManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
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
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
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