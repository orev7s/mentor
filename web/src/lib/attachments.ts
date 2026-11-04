/**
 * Files that are not sent as vision input get a path note appended on the server
 * so the agent knows what to read with a tool. That note is for the model, not the
 * student: strip it before rendering a user turn, otherwise a photo prompt shows a
 * second "Attached files" bubble.
 */
const NOTE_MARKER = "\n\nAttached files (";

export function stripAttachmentNote(text: string): string {
  const index = text.indexOf(NOTE_MARKER);
  return index < 0 ? text : text.slice(0, index).trimEnd();
}