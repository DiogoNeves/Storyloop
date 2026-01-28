import type { AudienceBucket } from "@/api/channel";

export const MIN_BUCKETS = 3;
export const MAX_BUCKETS = 4;

export type FieldKind = "input" | "textarea";

export type ChecklistSection = {
  title: string;
  items: string[];
};

export type FieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  className?: string;
  controlClassName?: string;
};

export type ProfileFieldKey =
  | "audienceFocus"
  | "bucketsLockedNotes"
  | "personalConnectionNotes";

export type ProfileFieldDefinition = FieldDefinition & {
  key: ProfileFieldKey;
};

export type BucketFieldDefinition = Omit<FieldDefinition, "id"> & {
  idSuffix: string;
  key: keyof AudienceBucket;
};

export type ResolvedBucketField = FieldDefinition & {
  key: keyof AudienceBucket;
};

export const profileFieldDefinitions = {
  audienceFocus: {
    key: "audienceFocus",
    id: "channel-audience-focus",
    label: "Who do you want to serve?",
    placeholder: "Describe the people you want to help most.",
    kind: "textarea",
    controlClassName: "min-h-[120px]",
  },
  bucketsLockedNotes: {
    key: "bucketsLockedNotes",
    id: "channel-buckets-locked-notes",
    label: "Notes on locking these buckets",
    placeholder: "Why do these feel coherent and motivating?",
    kind: "textarea",
  },
  personalConnectionNotes: {
    key: "personalConnectionNotes",
    id: "channel-personal-connection-notes",
    label: "Which audience do you belong to or deeply understand?",
    placeholder: "Call out the audience(s) you know best.",
    kind: "textarea",
  },
} satisfies Record<ProfileFieldKey, ProfileFieldDefinition>;

export const bucketFieldDefinitions = {
  name: {
    key: "name",
    idSuffix: "name",
    label: "Audience identity",
    placeholder: "Ex: Solo filmmakers",
    kind: "input",
  },
  description: {
    key: "description",
    idSuffix: "description",
    label: "Description",
    placeholder: "Add context you can empathize with.",
    kind: "textarea",
    className: "sm:col-span-2",
  },
  careAndUnderstanding: {
    key: "careAndUnderstanding",
    idSuffix: "care",
    label: "Pressure test: do you care about and understand them?",
    placeholder: "What proves you care and understand this group?",
    kind: "textarea",
    className: "sm:col-span-2",
  },
  otherCreatorsWatched: {
    key: "otherCreatorsWatched",
    idSuffix: "creators",
    label: "What other creators or content do they watch?",
    placeholder: "List channels, shows, or formats they already follow.",
    kind: "textarea",
    className: "sm:col-span-2",
  },
  personalConnectionNotes: {
    key: "personalConnectionNotes",
    idSuffix: "personal-notes",
    label: "Personal connection notes",
    placeholder: "What makes you part of or close to this audience?",
    kind: "textarea",
    className: "sm:col-span-2",
  },
  valueEmotion: {
    key: "valueEmotion",
    idSuffix: "emotion",
    label: "Desired emotion",
    placeholder: "Ex: relief, confidence, curiosity",
    kind: "input",
  },
  valueAction: {
    key: "valueAction",
    idSuffix: "action",
    label: "Immediate action",
    placeholder: "Ex: open their project timeline tonight",
    kind: "input",
  },
  valueNotes: {
    key: "valueNotes",
    idSuffix: "value-notes",
    label: "Notes on specificity and repeatability",
    placeholder: "What makes this emotion/action consistent?",
    kind: "textarea",
    className: "sm:col-span-2",
  },
} satisfies Record<string, BucketFieldDefinition>;

export const checklistContent = {
  audienceFocus: {
    title: "Mental checklist (while you write)",
    items: [
      "Start with who you want to serve (even if you lose some legacy viewers).",
      "Describe them in human terms, not demographics.",
      "Make it vivid: a real moment they’re in (late-night laptop, stuck job, etc.).",
      "This should make it obvious what to make next and what the value exchange is.",
    ],
  },
  careNote: {
    title: "Checklist for this note",
    items: [
      "Cite a specific moment that proves you care.",
      "Share how you learned about them.",
      "Describe how you would show up to help.",
      "If they feel stuck, point to the first small step (not a life-changing leap).",
    ],
  },
  creatorsNote: {
    title: "Checklist for this note",
    items: [
      "Call out your shared background or role.",
      "Note lived experience or time alongside them.",
      "Explain why that connection still feels real.",
      "Write it like you’re talking to yourself in that season of life.",
    ],
  },
  bucketMental: {
    title: "Mental checklist",
    items: [
      "3–4 buckets max: distinct, nameable groups.",
      "Each bucket can be described in one sentence.",
      "Buckets are different enough to change what you make next.",
      "It’s okay if one bucket is a “current/legacy” audience—as long as you’re clear about it.",
    ],
  },
  bucketsLockedMental: {
    title: "Mental checklist",
    items: [
      "You’re a member of at least one bucket (or you can’t honestly empathize).",
      "Say what makes the connection real (not performative).",
      "If you don’t care about this audience, don’t build for them.",
    ],
  },
  valueSpecificity: {
    title: "Checklist for specificity",
    items: [
      "The emotion is precise, not vague.",
      "The action can happen today without extra context.",
      "Title/thumbnail should set the same expectation.",
    ],
  },
  valueRealism: {
    title: "Checklist for realism",
    items: [
      "The action fits their time, resources, and skill.",
      "No wishful leaps required.",
      "Prefer “small steps” over overwhelming inspiration.",
    ],
  },
  valueRepeatability: {
    title: "Checklist for repeatability",
    items: [
      "They could repeat the action next week.",
      "The promise stays consistent over time.",
      "Ask: “Who is this for, and why are they watching?”",
    ],
  },
} satisfies Record<string, ChecklistSection>;

export const bucketFieldId = (bucketId: string, field: string) =>
  `bucket-${bucketId}-${field}`;

export const buildBucketField = (
  bucketId: string,
  definition: BucketFieldDefinition,
): ResolvedBucketField => ({
  ...definition,
  id: bucketFieldId(bucketId, definition.idSuffix),
});
