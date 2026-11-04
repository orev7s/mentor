import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** How long a question waits for the student before the agent gets control back. */
const QUESTION_TIMEOUT_MS = 20 * 60 * 1000;

export interface AskQuestion {
  question: string;
  options: string[];
  allowMultiple?: boolean;
}

export interface AskAnswer {
  question: string;
  selected: string[];
}

interface AskDetails {
  questions: AskQuestion[];
  answers: AskAnswer[] | null;
}

interface PendingQuestion {
  resolve: (answers: AskAnswer[] | null) => void;
  timer: NodeJS.Timeout;
}

/**
 * Holds the tool call open until the student answers in the app. The tool result
 * carries the answers, so the agent continues the same run with them in context.
 */
export class QuestionBroker {
  private pending = new Map<string, PendingQuestion>();

  ask(toolCallId: string): Promise<AskAnswer[] | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(toolCallId);
        resolve(null);
      }, QUESTION_TIMEOUT_MS);
      timer.unref?.();
      this.pending.set(toolCallId, { resolve, timer });
    });
  }

  answer(toolCallId: string, answers: AskAnswer[]): boolean {
    const pending = this.pending.get(toolCallId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(toolCallId);
    pending.resolve(answers);
    return true;
  }

  /** The run was stopped or the session closed: let the tool return instead of hanging. */
  cancel(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      this.pending.delete(id);
    }
  }
}

/**
 * Asks the student one or more multiple-choice questions and waits for the reply.
 * The client renders the questions as a card; answers come back over HTTP and are
 * returned here as the tool result.
 */
export function buildAskTool(broker: QuestionBroker) {
  return defineTool({
    name: "ask_student",
    label: "Ask student",
    description:
      "Ask the student up to six multiple-choice questions and wait for their answers. Use it when the student asks to be quizzed, when you need to check what they know, or when a choice (topic, difficulty, format, level) blocks you. Each question needs two to six short options. Keep it to what you need: one question is fine, more only when they belong together.",
    parameters: Type.Object({
      intro: Type.Optional(
        Type.String({
          description: "One short line above the questions, e.g. 'Let us see what you already know.'",
        }),
      ),
      questions: Type.Array(
        Type.Object({
          question: Type.String({ description: "The question, in plain language" }),
          options: Type.Array(Type.String({ description: "One answer option" }), {
            minItems: 2,
            maxItems: 6,
          }),
          allowMultiple: Type.Optional(
            Type.Boolean({ description: "Let the student pick more than one option" }),
          ),
        }),
        { minItems: 1, maxItems: 6 },
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { intro?: string; questions: AskQuestion[] },
    ) => {
      const answers = await broker.ask(toolCallId);
      if (!answers) {
        const details: AskDetails = { questions: params.questions, answers: null };
        return {
          content: [
            {
              type: "text" as const,
              text: "The student did not answer (the question timed out or the run was stopped). Continue without it, or ask in plain chat.",
            },
          ],
          details,
        };
      }

      const lines = params.questions.map((question, index) => {
        // Match on the text, but fall back to position so repeated wording still resolves.
        const answer =
          answers.find((item) => item.question === question.question) ?? answers[index];
        const picked = answer?.selected.length ? answer.selected.join(", ") : "(no answer)";
        return `${index + 1}. ${question.question}\n   Student: ${picked}`;
      });

      const details: AskDetails = { questions: params.questions, answers };
      return {
        content: [
          {
            type: "text" as const,
            text: `Student answers:\n${lines.join("\n")}`,
          },
        ],
        details,
      };
    },
  });
}
