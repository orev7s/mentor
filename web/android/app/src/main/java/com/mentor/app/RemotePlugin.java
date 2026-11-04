package com.mentor.app;

import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Load a URL in the app's own WebView.
 *
 * The web layer switches from the bundled page to the agent server after
 * pairing. A plain `window.location` navigation is caught by
 * `shouldOverrideUrlLoading`, which sends anything that is not in
 * `allowNavigation` to an external browser. A wildcard allowNavigation entry
 * would work for the host check but also makes Capacitor's local asset server
 * intercept every http(s) request, which breaks the remote page. Loading the
 * URL directly on the WebView skips both problems.
 */
@CapacitorPlugin(name = "Remote")
public class RemotePlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        final WebView webView = getBridge().getWebView();
        if (webView == null) {
            call.reject("WebView is not available");
            return;
        }
        getActivity().runOnUiThread(() -> webView.loadUrl(url));
        call.resolve();
    }
}
