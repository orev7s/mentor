package com.mentor.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Reads agent replies with the Android system text-to-speech engine, which is
 * the voice the student already has installed and configured. The WebView's
 * own `speechSynthesis` is unreliable here: it often reports support but has no
 * voices and stays silent, so the page asks this plugin instead.
 *
 * One utterance at a time. A new speak call stops the previous reply and
 * resolves its pending call, so the UI never keeps a stale "speaking" state.
 */
@CapacitorPlugin(name = "Speaker")
public class SpeakerPlugin extends Plugin implements TextToSpeech.OnInitListener {

    private TextToSpeech tts;
    private boolean ready;
    private boolean failed;
    private int counter;

    /** The call waiting on the current utterance. Resolves when it finishes or is replaced. */
    private PluginCall activeCall;
    private String activeUtterance;

    /** Text queued while the engine is still starting. */
    private String pendingText;
    private String pendingLanguage;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        failed = !ready;
        if (ready) {
            tts.setOnUtteranceProgressListener(
                new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {}

                    @Override
                    public void onDone(String utteranceId) {
                        complete(utteranceId);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        complete(utteranceId);
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        complete(utteranceId);
                    }
                }
            );
        }

        if (activeCall != null && pendingText != null) {
            String text = pendingText;
            String language = pendingLanguage;
            pendingText = null;
            pendingLanguage = null;
            if (ready) {
                start(activeCall, text, language);
            } else {
                reject(activeCall, "Text to speech is not available on this device");
                activeCall = null;
            }
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        String language = call.getString("language", "en-US");

        // A new reply replaces whatever is being read.
        settleActive();

        if (failed) {
            call.reject("Text to speech is not available on this device");
            return;
        }

        if (!ready) {
            activeCall = call;
            pendingText = text;
            pendingLanguage = language;
            return;
        }

        start(call, text, language);
    }

    private void start(PluginCall call, String text, String language) {
        Locale locale = Locale.forLanguageTag(language);
        int support = tts.setLanguage(locale);
        if (support == TextToSpeech.LANG_MISSING_DATA || support == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.getDefault());
        }

        String id = "mentor-" + (++counter);
        activeCall = call;
        activeUtterance = id;

        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        if (result == TextToSpeech.ERROR) {
            complete(id);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        settleActive();
        call.resolve();
    }

    /** Finish the utterance with this id, ignoring stops from a reply we already replaced. */
    private void complete(String utteranceId) {
        if (activeUtterance == null || !activeUtterance.equals(utteranceId)) return;
        PluginCall call = activeCall;
        activeCall = null;
        activeUtterance = null;
        if (call != null) {
            getBridge().executeOnMainThread(call::resolve);
        }
    }

    private void settleActive() {
        PluginCall call = activeCall;
        activeCall = null;
        activeUtterance = null;
        pendingText = null;
        pendingLanguage = null;
        if (call != null) {
            getBridge().executeOnMainThread(call::resolve);
        }
    }

    private void reject(PluginCall call, String message) {
        getBridge().executeOnMainThread(() -> call.reject(message));
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.handleOnDestroy();
    }
}