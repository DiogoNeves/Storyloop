import { type AgentMessageRole } from "@/lib/types/agent";

export type ChatTone = "assistant" | "user";

type ToneInput = ChatTone | AgentMessageRole | undefined;

const toneLayouts: Record<
  ChatTone,
  {
    alignment: string;
    bubble: string;
  }
> = {
  user: {
    alignment: "items-end",
    bubble: "max-w-[88%] rounded-2xl bg-primary/70 px-3 py-2",
  },
  assistant: {
    alignment: "items-start",
    bubble: "w-full rounded-2xl bg-transparent px-4 py-2",
  },
};

const toneColors: Record<
  ChatTone,
  {
    heading: string;
    text: string;
  }
> = {
  user: {
    heading: "text-primary-foreground",
    text: "text-primary-foreground/95",
  },
  assistant: {
    heading: "text-foreground",
    text: "text-foreground/90",
  },
};

export const resolveTone = (input?: ToneInput): ChatTone =>
  input === "user" ? "user" : "assistant";

export const getToneLayout = (tone: ChatTone) => toneLayouts[tone];

export const getToneColors = (tone: ChatTone) => toneColors[tone];
