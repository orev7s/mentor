/**
 * Files that are not sent as vision input get a path note appended on the server
 * so the agent knows what to read with a tool. That note is for the model, not the
 * student: strip it before rendering a user turn, otherwise a photo prompt shows a
 * second "Attached files" bubble.
 */
/**
 * The note is always appended at the end, as a heading followed by `- path`
 * lines. Requiring that shape keeps a student who types the phrase themselves
 * from losing the rest of their message.
 */
const NOTE = /\n\nAttached files \([^)]*\):\n(?:- [^\n]*\n?)+\s*$/;

export function stripAttachmentNote(text: string): string {
  return text.replace(NOTE, "").trimEnd();
}