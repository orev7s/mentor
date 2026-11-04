package com.mentor.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
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
            result.put("filename", filename);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not start the download", error);
        }
    }

    /**
     * The id crosses the bridge as a JSON number, which Capacitor hands to Java
     * as an Integer for values that fit. PluginCall.getLong only accepts a Long,
     * so it would reject every normal download id. Read the raw value instead.
     */
    private Long downloadId(PluginCall call) {
        Object value = call.getData().opt("id");
        if (value instanceof Number) return ((Number) value).longValue();
        if (value instanceof String) {
            try {
                return Long.parseLong((String) value);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    /** "pending", "running", "successful" or "failed". */
    @PluginMethod
    public void status(PluginCall call) {
        Long id = downloadId(call);
        if (id == null) {
            call.reject("id is required");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("DownloadManager is not available");
            return;
        }

        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Download not found");
                return;
            }
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int titleIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE);
            int raw = cursor.getInt(statusIndex);
            String state =
                raw == DownloadManager.STATUS_SUCCESSFUL
                    ? "successful"
                    : raw == DownloadManager.STATUS_FAILED
                        ? "failed"
                        : raw == DownloadManager.STATUS_RUNNING
                            ? "running"
                            : "pending";
            JSObject result = new JSObject();
            result.put("status", state);
            if (titleIndex >= 0 && !cursor.isNull(titleIndex)) {
                result.put("filename", cursor.getString(titleIndex));
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read the download", error);
        }
    }

    /** Open a finished download in the app that handles its type. */
    @PluginMethod
    public void open(PluginCall call) {
        Long id = downloadId(call);
        if (id == null) {
            call.reject("id is required");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("DownloadManager is not available");
            return;
        }

        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Download not found");
                return;
            }
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) {
                call.reject("The file is still downloading");
                return;
            }
            int uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
            int typeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE);
            String uriString = cursor.getString(uriIndex);
            String mime = typeIndex >= 0 && !cursor.isNull(typeIndex) ? cursor.getString(typeIndex) : null;

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(uriString), mime != null ? mime : "*/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No app can open this file", error);
        } catch (Exception error) {
            call.reject("Could not open the file", error);
        }
    }
}