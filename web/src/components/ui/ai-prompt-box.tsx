"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUp,
  BrainCog,
  Globe,
  Loader2,
  Mic,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------------------------------
 * Styles
 * -----------------------------------------------------------------------------------------------*/

const styles = `
  .ai-prompt-textarea::-webkit-scrollbar {
    width: 6px;
  }
  .ai-prompt-textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  .ai-prompt-textarea::-webkit-scrollbar-thumb {
    background-color: #444444;
    border-radius: 3px;
  }
  .ai-prompt-textarea::-webkit-scrollbar-thumb:hover {
    background-color: #555555;
  }
`;

function useStyleInjection() {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "ai-prompt-box-styles";
    if (document.getElementById(id)) return;
    const styleSheet = document.createElement("style");
    styleSheet.id = id;
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
  }, []);
}

/* -------------------------------------------------------------------------------------------------
 * Textarea
 * -----------------------------------------------------------------------------------------------*/

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "ai-prompt-textarea flex min-h-[44px] w-full resize-none rounded-md border-none bg-transparent px-3 py-2.5 text-base text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      rows={1}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/* -------------------------------------------------------------------------------------------------
 * Tooltip
 * -----------------------------------------------------------------------------------------------*/

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-[#333333] bg-[#1F2023] px-3 py-1.5 text-sm text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/* -------------------------------------------------------------------------------------------------
 * Dialog
 * -----------------------------------------------------------------------------------------------*/

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-[#333333] bg-[#1F2023] p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:max-w-[800px]",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-[#2E3033]/80 p-2 transition-all hover:bg-[#2E3033]">
        <X className="h-5 w-5 text-gray-200 hover:text-white" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-gray-100", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

/* -------------------------------------------------------------------------------------------------
 * Button
 * -----------------------------------------------------------------------------------------------*/

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses = {
      default: "bg-white text-black hover:bg-white/80",
      outline: "border border-[#444444] bg-transparent hover:bg-[#3A3A40]",
      ghost: "bg-transparent hover:bg-[#3A3A40]",
    };
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-sm",
      lg: "h-12 px-6",
      icon: "aspect-[1/1] h-8 w-8 rounded-full",
    };
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

/* -------------------------------------------------------------------------------------------------
 * Voice recorder (used when the box owns recording itself)
 * -----------------------------------------------------------------------------------------------*/

interface VoiceRecorderProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: (duration: number) => void;
  visualizerBars?: number;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  visualizerBars = 32,
}) => {
  const [time, setTime] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = React.useRef(onStartRecording);
  const stopRef = React.useRef(onStopRecording);
  startRef.current = onStartRecording;
  stopRef.current = onStopRecording;

  React.useEffect(() => {
    if (isRecording) {
      startRef.current();
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stopRef.current(time);
      setTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center py-3 transition-all duration-300",
        isRecording ? "opacity-100" : "h-0 opacity-0",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="font-mono text-sm text-white/80">{formatTime(time)}</span>
      </div>
      <div className="flex h-10 w-full items-center justify-center gap-0.5 px-4">
        {[...Array(visualizerBars)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 animate-pulse rounded-full bg-white/50"
            style={{
              height: `${Math.max(15, Math.random() * 100)}%`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Image preview dialog
 * -----------------------------------------------------------------------------------------------*/

interface ImageViewDialogProps {
  imageUrl: string | null;
  onClose: () => void;
}

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] border-none bg-transparent p-0 shadow-none md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl bg-[#1F2023] shadow-2xl"
        >
          <img
            src={imageUrl}
            alt="Full preview"
            className="max-h-[80vh] w-full rounded-2xl object-contain"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Prompt input context
 * -----------------------------------------------------------------------------------------------*/

interface PromptInputContextType {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
}

const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
});

function usePromptInput() {
  const context = React.useContext(PromptInputContext);
  if (!context) throw new Error("usePromptInput must be used within a PromptInput");
  return context;
}

interface PromptInputProps {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || "");
    const handleChange = (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              "rounded-3xl border border-[#444444] bg-[#1F2023] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300",
              isLoading && "border-red-500/70",
              className,
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    );
  },
);
PromptInput.displayName = "PromptInput";

interface PromptInputTextareaProps {
  disableAutosize?: boolean;
  placeholder?: string;
}

const PromptInputTextarea: React.FC<
  PromptInputTextareaProps & React.ComponentProps<typeof Textarea>
> = ({ className, onKeyDown, disableAutosize = false, placeholder, ...props }) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height =
      typeof maxHeight === "number"
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
  }, [value, maxHeight, disableAutosize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  };

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn("text-base", className)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={props["aria-label"] ?? "Message"}
      {...props}
    />
  );
};

interface PromptInputActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

const PromptInputActions: React.FC<PromptInputActionsProps> = ({
  children,
  className,
  ...props
}) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const PromptInputAction: React.FC<PromptInputActionProps> = ({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}) => {
  const { disabled } = usePromptInput();
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

const CustomDivider: React.FC = () => (
  <div className="relative mx-1 h-6 w-[1.5px]">
    <div
      className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-[#9b87f5]/70 to-transparent"
      style={{
        clipPath:
          "polygon(0% 0%, 100% 0%, 100% 40%, 140% 50%, 100% 60%, 100% 100%, 0% 100%, 0% 60%, -40% 50%, 0% 40%)",
      }}
    />
  </div>
);

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