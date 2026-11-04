package com.mentor.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;

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
        // Without a MIME type DownloadManager stores the file as application/octet-stream,
        // so Android's chooser cannot offer a PDF reader or a document editor for it.
        String mime = call.getString("mime");
        if (mime == null || mime.isEmpty()) {
            int dot = filename.lastIndexOf('.');
            if (dot >= 0 && dot < filename.length() - 1) {
                mime = MimeTypeMap.getSingleton()
                    .getMimeTypeFromExtension(filename.substring(dot + 1).toLowerCase());
            }
        }
        if (mime != null && !mime.isEmpty()) {
            request.setMimeType(mime);
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

    /** Open a finished download in an app the student picks. */
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
            int typeIndex = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE);
            String mime = typeIndex >= 0 && !cursor.isNull(typeIndex) ? cursor.getString(typeIndex) : null;
            if (mime == null || mime.isEmpty()) {
                mime = manager.getMimeTypeForDownloadedFile(id);
            }

            // The content URI, not COLUMN_LOCAL_URI. A file:// URI cannot be handed
            // to another app on Android 7 and later, which is why the old button did
            // nothing. DownloadManager exposes a content URI the target can read.
            Uri content = manager.getUriForDownloadedFile(id);
            if (content == null) {
                call.reject("The file is not available yet");
                return;
            }

            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(content, mime != null && !mime.isEmpty() ? mime : "*/*");
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // Always ask which app. A bare ACTION_VIEW jumps straight into a default
            // handler, and the student has no way to pick a PDF reader or an editor.
            Intent chooser = Intent.createChooser(view, "Open with");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No app can open this file", error);
        } catch (Exception error) {
            call.reject("Could not open the file", error);
        }
    }
}