package com.mentor.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Saves a file straight to the public Downloads folder with the name the app
 * chose. The WebView cannot do this: it either stores a blob as `download.bin`
 * or hands the URL to a browser. DownloadManager also keeps the notification
 * and the correct MIME type from the server.
 */
@CapacitorPlugin(name = "Downloader")
public class DownloaderPlugin extends Plugin {

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            filename = "mentor-file";
        }
        // Nothing path-like or illegal in the public Downloads folder.
        filename = filename.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        if (filename.isEmpty()) filename = "mentor-file";

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) {
            request.addRequestHeader("Cookie", cookies);
        }
        request.setTitle(filename);
        request.setDescription(filename);
        request.allowScanningByMediaScanner();
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("DownloadManager is not available");
            return;
        }

        try {
            long id = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("id", id);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not start the download", error);
        }
    }
}