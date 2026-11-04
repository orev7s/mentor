/** State shared between the hook and its extracted modules. */
export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface RunState {
  assistantId: string;
  /**
   * Part index per provider content block, keyed by `contentIndex`. Keeping this
   * is what stops a text delta after a tool call from being merged into the text
   * before it, and lets a finished tool call replace the raw argument text some
   * providers stream for the same block.
   */
  blocks: Map<number, number>;
  tools: Map<string, number>;
}

let sequence = 0;
export const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++sequence}`;
