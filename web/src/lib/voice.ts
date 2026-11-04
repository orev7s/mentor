/**
 * Voice input and read-aloud.
 *
 * Speech to text records a clip in the WebView and posts it to the server, which calls Groq
 * Whisper. The key never reaches the client.
 *
 * Text to speech uses the platform voice: on Android the WebView's `speechSynthesis` is backed
 * by the system TTS engine, so replies read out in the installed language voice.
 */

/** Turkish, Arabic or English, the languages this app is used in. */
export type VoiceLanguage = "tr" | "ar" | "en"

export interface Recording {
  /** Resolves once the microphone is live. Rejects when permission is denied. */
  started: Promise<void>
  /** Stop and collect the audio. */
  stop: () => Promise<Blob>
  /** Stop and throw the audio away. */
  cancel: () => void
}

const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
]

export function recordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  )
}

/** Start capturing the microphone. The mic indicator shows while this is live. */
export function startRecording(): Recording {
  const chunks: BlobPart[] = []
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let cancelled = false

  const started = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    if (cancelled) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.start()
  })()

  const release = () => stream?.getTracks().forEach((track) => track.stop())

  return {
    started,
    async stop() {
      await started
      const live = recorder
      if (!live) throw new Error("The microphone did not start.")
      const blob = await new Promise<Blob>((resolve) => {
        live.onstop = () => resolve(new Blob(chunks, { type: live.mimeType || "audio/webm" }))
        live.stop()
      })
      release()
      return blob
    },
    cancel() {
      cancelled = true
      try {
        recorder?.state !== "inactive" && recorder?.stop()
      } catch {
        // already stopped
      }
      release()
    },
  }
}

/* -------------------------------------------------------------------------------------------------
 * Read aloud
 * -------------------------------------------------------------------------------------------------*/

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/** Pick a voice for the text: Arabic script, Turkish letters, else English. */
export function languageFor(text: string): VoiceLanguage {
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return "ar"
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return "tr"
  return "en"
}

const LOCALES: Record<VoiceLanguage, string> = { tr: "tr-TR", ar: "ar-SA", en: "en-US" }

function voiceFor(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const base = locale.split("-")[0]?.toLowerCase() ?? ""
  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(base))
  )
}

/**
 * Strip what should not be read out loud: code fences, inline code, tables, link markup and
 * emphasis. The reader is for prose.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " Code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/\$+([^$]+)\$+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface SpeakHandlers {
  onStart?: () => void
  onEnd?: () => void
}

/** Read text out loud, replacing anything already speaking. Returns false when unsupported. */
export function speak(text: string, handlers: SpeakHandlers = {}): boolean {
  if (!speechSupported()) return false
  const clean = speakableText(text)
  if (!clean) return false

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  const language = languageFor(clean)
  utterance.lang = LOCALES[language]
  const voice = voiceFor(utterance.lang)
  if (voice) utterance.voice = voice
  utterance.onstart = () => handlers.onStart?.()
  utterance.onend = () => handlers.onEnd?.()
  utterance.onerror = () => handlers.onEnd?.()
  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}
