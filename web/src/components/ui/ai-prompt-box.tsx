"use client";

import * as React from "react";
import { ArrowUp, BrainCog, Globe, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button, useStyleInjection } from "./prompt-box/primitives";
import { VoiceRecorder } from "./prompt-box/voice-recorder";
import { ImageViewDialog } from "./prompt-box/image-view-dialog";
import {
  CustomDivider,
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "./prompt-box/prompt-input";

/* -------------------------------------------------------------------------------------------------
 * Main component
 * -----------------------------------------------------------------------------------------------*/

export interface PromptInputBoxProps {
  /** Called with the message and any files picked inside the box. */
  onSend?: (message: string, files?: File[]) => void;
  /** Called when the user asks to stop an in-flight run. */
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Controlled text. Omit to let the box own its value. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Allow sending when there is no text but there is something attached. */
  hasContent?: boolean;
  /** Files are still uploading. Send waits, and the action shows a spinner. */
  uploading?: boolean;

  /** Thinking is on unless the student turns it off. Hide the control when the model cannot think. */
  thinking?: boolean;
  canThink?: boolean;
  onThinkingChange?: (value: boolean) => void;

  /** Web search and fetch. Turning this off disables those tools for the session. */
  search?: boolean;
  canSearch?: boolean;
  onSearchChange?: (value: boolean) => void;

  /** Files picked from the paperclip. When omitted the box keeps its own image previews. */
  onAttachFiles?: (files: File[]) => void;
  accept?: string;
  /** Pending attachments, rendered above the textarea. */
  attachments?: React.ReactNode;
  /** Replace the built-in paperclip with a custom control (for example an attach menu). */
  renderAttach?: () => React.ReactNode;

  /** Voice input. When omitted the box falls back to its own recorder placeholder. */
  recording?: boolean;
  canVoice?: boolean;
  onVoice?: () => void;
}

const IMAGE_ONLY = /^image\//;

export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>(
  (
    {
      onSend = () => {},
      onStop,
      isLoading = false,
      disabled = false,
      placeholder = "Type your message here...",
      className,
      value: valueProp,
      onValueChange,
      hasContent = false,
      uploading = false,
      thinking: thinkingProp,
      canThink = true,
      onThinkingChange,
      search: searchProp,
      canSearch = true,
      onSearchChange,
      onAttachFiles,
      accept = "image/*",
      attachments,
      renderAttach,
      recording,
      canVoice = true,
      onVoice,
    },
    ref,
  ) => {
    useStyleInjection();

    const [input, setInput] = React.useState("");
    const [files, setFiles] = React.useState<File[]>([]);
    const [filePreviews, setFilePreviews] = React.useState<Record<string, string>>({});
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const [localRecording, setLocalRecording] = React.useState(false);
    const [localSearch, setLocalSearch] = React.useState(true);
    const [localThink, setLocalThink] = React.useState(true);
    const uploadInputRef = React.useRef<HTMLInputElement>(null);

    const value = valueProp ?? input;
    const setValue = onValueChange ?? setInput;

    const showSearch = searchProp ?? localSearch;
    const showThink = thinkingProp ?? localThink;
    const isRecording = recording ?? localRecording;

    const setSearch = (next: boolean) => {
      if (searchProp === undefined) setLocalSearch(next);
      onSearchChange?.(next);
    };

    const setThink = (next: boolean) => {
      if (thinkingProp === undefined) setLocalThink(next);
      onThinkingChange?.(next);
    };

    const isImageFile = (file: File) => IMAGE_ONLY.test(file.type);

    const processFile = React.useCallback(
      (file: File) => {
        if (!isImageFile(file)) return;
        if (file.size > 10 * 1024 * 1024) return;
        setFiles([file]);
        const reader = new FileReader();
        reader.onload = (event) =>
          setFilePreviews({ [file.name]: event.target?.result as string });
        reader.readAsDataURL(file);
      },
      [],
    );

    const handlePickFiles = (incoming: File[]) => {
      if (!incoming.length) return;
      if (onAttachFiles) {
        onAttachFiles(incoming);
        return;
      }
      const image = incoming.find(isImageFile);
      if (image) processFile(image);
    };

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = React.useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handlePickFiles(Array.from(e.dataTransfer.files));
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [onAttachFiles],
    );

    const removeFile = (index: number) => {
      const fileToRemove = files[index];
      if (fileToRemove && filePreviews[fileToRemove.name]) setFilePreviews({});
      setFiles([]);
    };

    const handlePaste = React.useCallback(
      (e: ClipboardEvent) => {
        if (onAttachFiles) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          if (item && item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              processFile(file);
              break;
            }
          }
        }
      },
      [onAttachFiles, processFile],
    );

    React.useEffect(() => {
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
    }, [handlePaste]);

    const canSubmit = value.trim() !== "" || files.length > 0 || hasContent;

    const handleSubmit = () => {
      if (uploading) return;
      if (isLoading && !canSubmit) {
        onStop?.();
        return;
      }
      if (!canSubmit) return;
      onSend(value, files);
      if (valueProp === undefined) setInput("");
      setFiles([]);
      setFilePreviews({});
    };

    const toggleVoice = () => {
      if (onVoice) {
        onVoice();
        return;
      }
      setLocalRecording((current) => !current);
    };

    const handleStopRecording = (duration: number) => {
      setLocalRecording(false);
      onSend(`[Voice message - ${duration} seconds]`, []);
    };

    const showStop = isLoading && !canSubmit;
    const showSend = !showStop && canSubmit;
    const actionIsStop = showStop || isRecording;
    const actionLabel = isRecording
      ? "Stop recording"
      : uploading
        ? "Uploading files"
        : showStop
          ? "Stop"
          : showSend
            ? "Send message"
            : canVoice
              ? "Voice input"
              : "Send";

    const handleAction = () => {
      if (uploading) return;
      if (isRecording) {
        toggleVoice();
        return;
      }
      if (showStop) {
        onStop?.();
        return;
      }
      if (canSubmit) {
        handleSubmit();
        return;
      }
      if (canVoice) toggleVoice();
    };

    return (
      <>
        <PromptInput
          value={value}
          onValueChange={setValue}
          isLoading={isLoading}
          onSubmit={handleSubmit}
          className={cn(
            "w-full border-[#444444] bg-[#1F2023] shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300 ease-in-out",
            isRecording && "border-red-500/70",
            className,
          )}
          disabled={disabled || isRecording}
          ref={ref}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {attachments}

          {files.length > 0 && !isRecording ? (
            <div className="flex flex-wrap gap-2 p-0 pb-1 transition-all duration-300">
              {files.map((file, index) => (
                <div key={index} className="group relative">
                  {filePreviews[file.name] ? (
                    <div
                      className="h-16 w-16 cursor-pointer overflow-hidden rounded-xl transition-all duration-300"
                      onClick={() => setSelectedImage(filePreviews[file.name] ?? null)}
                    >
                      <img
                        src={filePreviews[file.name]}
                        alt={file.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeFile(index);
                        }}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {isRecording && !recording ? (
            <VoiceRecorder
              isRecording={isRecording}
              onStartRecording={() => {}}
              onStopRecording={handleStopRecording}
            />
          ) : null}

          <PromptInputTextarea placeholder={placeholder} />

          <PromptInputActions className="justify-between px-1 pb-1 pt-1">
            <div className="flex min-w-0 items-center gap-0.5">
              {renderAttach ? (
                renderAttach()
              ) : (
                <>
                  <PromptInputAction tooltip="Attach a file">
                    <button
                      type="button"
                      aria-label="Attach a file"
                      disabled={isRecording || disabled}
                      onClick={() => uploadInputRef.current?.click()}
                      className="flex h-8 items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[#9CA3AF] transition-colors hover:text-[#D1D5DB] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span className="text-xs">Attach</span>
                    </button>
                  </PromptInputAction>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple={!onAttachFiles}
                    accept={accept}
                    className="hidden"
                    onChange={(event) => {
                      handlePickFiles(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                  />
                </>
              )}

              {canSearch ? (
                <PromptInputAction tooltip={showSearch ? "Search on" : "Search off"}>
                  <button
                    type="button"
                    aria-pressed={showSearch}
                    aria-label={showSearch ? "Turn search off" : "Turn search on"}
                    data-testid="toggle-search"
                    onClick={() => setSearch(!showSearch)}
                    className={cn(
                      "flex h-8 items-center gap-1 rounded-full border px-2 py-1 transition-all",
                      showSearch
                        ? "border-[#1EAEDB] bg-[#1EAEDB]/15 text-[#1EAEDB]"
                        : "border-transparent bg-transparent text-[#9CA3AF] hover:text-[#D1D5DB]",
                    )}
                  >
                    <motion.div
                      animate={{ rotate: showSearch ? 360 : 0, scale: showSearch ? 1.1 : 1 }}
                      whileHover={{
                        rotate: showSearch ? 360 : 15,
                        scale: 1.1,
                        transition: { type: "spring", stiffness: 300, damping: 10 },
                      }}
                      transition={{ type: "spring", stiffness: 260, damping: 25 }}
                    >
                      <Globe className="h-4 w-4" />
                    </motion.div>
                    {showSearch ? (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-shrink-0 overflow-hidden whitespace-nowrap text-xs text-[#1EAEDB]"
                      >
                        Search
                      </motion.span>
                    ) : null}
                  </button>
                </PromptInputAction>
              ) : null}

              {canSearch && canThink ? <CustomDivider /> : null}

              {canThink ? (
                <PromptInputAction tooltip={showThink ? "Thinking on" : "Thinking off"}>
                  <button
                    type="button"
                    aria-pressed={showThink}
                    aria-label={showThink ? "Turn thinking off" : "Turn thinking on"}
                    data-testid="toggle-thinking"
                    onClick={() => setThink(!showThink)}
                    className={cn(
                      "flex h-8 items-center gap-1 rounded-full border px-2 py-1 transition-all",
                      showThink
                        ? "border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#8B5CF6]"
                        : "border-transparent bg-transparent text-[#9CA3AF] hover:text-[#D1D5DB]",
                    )}
                  >
                    <motion.div
                      animate={{ rotate: showThink ? 360 : 0, scale: showThink ? 1.1 : 1 }}
                      whileHover={{
                        rotate: showThink ? 360 : 15,
                        scale: 1.1,
                        transition: { type: "spring", stiffness: 300, damping: 10 },
                      }}
                      transition={{ type: "spring", stiffness: 260, damping: 25 }}
                    >
                      <BrainCog className="h-4 w-4" />
                    </motion.div>
                    {showThink ? (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-shrink-0 overflow-hidden whitespace-nowrap text-xs text-[#8B5CF6]"
                      >
                        Think
                      </motion.span>
                    ) : null}
                  </button>
                </PromptInputAction>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center">
              <PromptInputAction tooltip={actionLabel}>
                <Button
                  type="button"
                  size="icon"
                  aria-label={actionLabel}
                  data-testid="send-button"
                  onClick={handleAction}
                  disabled={disabled || uploading || (!actionIsStop && !showSend && !canVoice)}
                  aria-busy={uploading || undefined}
                  className={cn(
                    "size-8 shrink-0",
                    actionIsStop && "bg-red-500 text-white hover:bg-red-500/80",
                  )}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : actionIsStop ? (
                    <Square className="h-4 w-4 fill-current" />
                  ) : showSend ? (
                    <ArrowUp className="h-5 w-5" />
                  ) : canVoice ? (
                    <Mic className="h-5 w-5" />
                  ) : (
                    <ArrowUp className="h-5 w-5" />
                  )}
                </Button>
              </PromptInputAction>
            </div>
          </PromptInputActions>
        </PromptInput>

        <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      </>
    );
  },
);
PromptInputBox.displayName = "PromptInputBox";
