import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import {
  channelQueries,
  updateChannelProfile,
  type AudienceBucket,
  type ChannelProfile,
} from "@/api/channel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";

const MIN_BUCKETS = 3;
const MAX_BUCKETS = 4;

type FieldKind = "input" | "textarea";

type ChecklistCardProps = {
  title: string;
  items: string[];
  className?: string;
};

type ChecklistSection = {
  title: string;
  items: string[];
};

type FieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  className?: string;
  controlClassName?: string;
};

type ProfileFieldKey =
  | "audienceFocus"
  | "bucketsLockedNotes"
  | "personalConnectionNotes";

type ProfileFieldDefinition = FieldDefinition & {
  key: ProfileFieldKey;
};

type BucketFieldDefinition = Omit<FieldDefinition, "id"> & {
  idSuffix: string;
  key: keyof AudienceBucket;
};

type ResolvedBucketField = FieldDefinition & {
  key: keyof AudienceBucket;
};

type FormBlock<TField> =
  | { type: "field"; field: TField }
  | { type: "checklist"; checklist: ChecklistSection; className?: string };

const ChecklistCard = ({ title, items, className }: ChecklistCardProps) => (
  <div
    className={`rounded-lg border bg-muted/40 text-muted-foreground ${className ?? ""}`}
  >
    <p className="text-sm font-medium text-foreground">{title}</p>
    <ul className="mt-2 space-y-1 text-xs">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

type FormSectionCardProps = {
  title: string;
  description?: string;
  contentClassName?: string;
  children: ReactNode;
};

const FormSectionCard = ({
  title,
  description,
  contentClassName,
  children,
}: FormSectionCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
    </CardHeader>
    <CardContent className={contentClassName ?? "space-y-2"}>
      {children}
    </CardContent>
  </Card>
);

type FieldControlProps = {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
};

const FieldControl = ({ field, value, onChange }: FieldControlProps) => (
  <FormField id={field.id} label={field.label} className={field.className}>
    {field.kind === "input" ? (
      <Input
        id={field.id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className={field.controlClassName}
      />
    ) : (
      <Textarea
        id={field.id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className={field.controlClassName}
      />
    )}
  </FormField>
);

const profileFieldDefinitions = {
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

const bucketFieldDefinitions = {
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

const checklistContent = {
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

const bucketFieldId = (bucketId: string, field: string) =>
  `bucket-${bucketId}-${field}`;

const buildBucketField = (
  bucketId: string,
  definition: BucketFieldDefinition,
): ResolvedBucketField => ({
  ...definition,
  id: bucketFieldId(bucketId, definition.idSuffix),
});

const audienceFocusBlocks: FormBlock<ProfileFieldDefinition>[] = [
  { type: "field", field: profileFieldDefinitions.audienceFocus },
  {
    type: "checklist",
    checklist: checklistContent.audienceFocus,
    className: "p-3",
  },
];

const bucketNotesBlocks: FormBlock<BucketFieldDefinition>[] = [
  { type: "field", field: bucketFieldDefinitions.name },
  { type: "field", field: bucketFieldDefinitions.description },
  { type: "field", field: bucketFieldDefinitions.careAndUnderstanding },
  {
    type: "checklist",
    checklist: checklistContent.careNote,
    className: "p-3 sm:col-span-2",
  },
  { type: "field", field: bucketFieldDefinitions.otherCreatorsWatched },
  {
    type: "checklist",
    checklist: checklistContent.creatorsNote,
    className: "p-3 sm:col-span-2",
  },
  { type: "field", field: bucketFieldDefinitions.personalConnectionNotes },
];

const audienceBucketsFooterBlocks: FormBlock<ProfileFieldDefinition>[] = [
  {
    type: "checklist",
    checklist: checklistContent.bucketMental,
    className: "p-4",
  },
  { type: "field", field: profileFieldDefinitions.bucketsLockedNotes },
  {
    type: "checklist",
    checklist: checklistContent.bucketsLockedMental,
    className: "p-4",
  },
  { type: "field", field: profileFieldDefinitions.personalConnectionNotes },
];

const valueAuditBlocks: FormBlock<BucketFieldDefinition>[] = [
  { type: "field", field: bucketFieldDefinitions.valueEmotion },
  { type: "field", field: bucketFieldDefinitions.valueAction },
  {
    type: "checklist",
    checklist: checklistContent.valueSpecificity,
    className: "p-3 sm:col-span-2",
  },
  {
    type: "checklist",
    checklist: checklistContent.valueRealism,
    className: "p-3 sm:col-span-2",
  },
  {
    type: "checklist",
    checklist: checklistContent.valueRepeatability,
    className: "p-3 sm:col-span-2",
  },
  { type: "field", field: bucketFieldDefinitions.valueNotes },
];

const createEmptyBucket = (): AudienceBucket => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  careAndUnderstanding: "",
  otherCreatorsWatched: "",
  personalConnectionNotes: "",
  valueEmotion: "",
  valueAction: "",
  valueNotes: "",
});

const createEmptyProfile = (): ChannelProfile => ({
  audienceFocus: "",
  personalConnectionNotes: "",
  bucketsLockedNotes: "",
  audienceBuckets: Array.from({ length: MIN_BUCKETS }, createEmptyBucket),
});

const normalizeProfile = (profile: ChannelProfile | null): ChannelProfile => {
  const base = profile ?? createEmptyProfile();
  const { personalConnectionConfirmed, bucketsLocked, ...baseProfile } = base;
  const buckets = (baseProfile.audienceBuckets ?? []).map((bucket) => {
    const {
      careAndUnderstandingConfirmed,
      personalConnection,
      valueSpecific,
      valueRealistic,
      valueRepeatable,
      ...bucketRest
    } = bucket;
    return {
      ...createEmptyBucket(),
      ...bucketRest,
      id: bucket.id || crypto.randomUUID(),
    };
  });
  while (buckets.length < MIN_BUCKETS) {
    buckets.push(createEmptyBucket());
  }
  return {
    ...createEmptyProfile(),
    ...baseProfile,
    audienceBuckets: buckets.slice(0, MAX_BUCKETS),
  };
};

export function ChannelPage() {
  const queryClient = useQueryClient();
  const channelQuery = useQuery(channelQueries.profile());
  const [profile, setProfile] = useState<ChannelProfile>(createEmptyProfile);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelQuery.data) {
      return;
    }
    setProfile(normalizeProfile(channelQuery.data.profile));
  }, [channelQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateChannelProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(channelQueries.profile().queryKey, data);
      setProfile(normalizeProfile(data.profile));
      setSaveError(null);
      setSaveMessage("Channel profile saved.");
    },
    onError: () => {
      setSaveMessage(null);
      setSaveError("We couldn't save the channel profile. Try again.");
    },
  });

  const handleSave = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setSaveMessage(null);
      setSaveError(null);
      updateMutation.mutate(profile);
    },
    [profile, updateMutation],
  );

  const updateProfile = useCallback((updates: Partial<ChannelProfile>) => {
    setProfile((previous) => ({ ...previous, ...updates }));
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const updateBucket = useCallback(
    (bucketId: string, updates: Partial<AudienceBucket>) => {
      setProfile((previous) => ({
        ...previous,
        audienceBuckets: previous.audienceBuckets.map((bucket) =>
          bucket.id === bucketId ? { ...bucket, ...updates } : bucket,
        ),
      }));
      setSaveMessage(null);
      setSaveError(null);
    },
    [],
  );

  const handleAddBucket = useCallback(() => {
    setProfile((previous) => {
      if (previous.audienceBuckets.length >= MAX_BUCKETS) {
        return previous;
      }
      return {
        ...previous,
        audienceBuckets: [...previous.audienceBuckets, createEmptyBucket()],
      };
    });
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleRemoveBucket = useCallback((bucketId: string) => {
    setProfile((previous) => {
      if (previous.audienceBuckets.length <= MIN_BUCKETS) {
        return previous;
      }
      return {
        ...previous,
        audienceBuckets: previous.audienceBuckets.filter(
          (bucket) => bucket.id !== bucketId,
        ),
      };
    });
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    const updatedAt = channelQuery.data?.updatedAt;
    if (!updatedAt) {
      return "Not saved yet.";
    }
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return "Updated recently.";
    }
    return `Last updated ${date.toLocaleString()}`;
  }, [channelQuery.data?.updatedAt]);

  const isSaving = updateMutation.isPending;
  const renderProfileBlock = (
    block: FormBlock<ProfileFieldDefinition>,
    index: number,
  ) => {
    if (block.type === "checklist") {
      return (
        <ChecklistCard
          key={`${block.checklist.title}-${index}`}
          title={block.checklist.title}
          items={block.checklist.items}
          className={block.className}
        />
      );
    }

    const field = block.field;
    return (
      <FieldControl
        key={field.id}
        field={field}
        value={profile[field.key] ?? ""}
        onChange={(value) =>
          updateProfile({ [field.key]: value } as Partial<ChannelProfile>)
        }
      />
    );
  };

  const renderBucketBlock = (
    bucket: AudienceBucket,
    block: FormBlock<BucketFieldDefinition>,
    index: number,
  ) => {
    if (block.type === "checklist") {
      return (
        <ChecklistCard
          key={`${block.checklist.title}-${index}`}
          title={block.checklist.title}
          items={block.checklist.items}
          className={block.className}
        />
      );
    }

    const fieldDefinition = buildBucketField(bucket.id, block.field);
    return (
      <FieldControl
        key={fieldDefinition.id}
        field={fieldDefinition}
        value={(bucket[fieldDefinition.key] ?? "") as string}
        onChange={(value) =>
          updateBucket(bucket.id, {
            [fieldDefinition.key]: value,
          } as Partial<AudienceBucket>)
        }
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6 pr-2 sm:gap-6 sm:pr-4">
      <section className="rounded-xl border border-border/80 bg-background/90 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Channel identity
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Channel</h1>
            <p className="text-sm text-muted-foreground">
              Define who this channel is for so Loopie can pressure-test ideas
              against your audience.
            </p>
            <p className="text-xs text-muted-foreground">{lastUpdatedLabel}</p>
          </div>
          <Button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save channel profile"}
          </Button>
        </div>
      </section>

      <form className="flex min-h-0 flex-col gap-4" onSubmit={handleSave}>
        <FormSectionCard
          title="Step 1: Start with the audience"
          description="Clarify who you actually want to serve, not who you are."
        >
          {audienceFocusBlocks.map((block, index) =>
            renderProfileBlock(block, index),
          )}
        </FormSectionCard>

        <FormSectionCard
          title="Steps 2–6: Build your audience buckets"
          description="Create 3–4 distinct groups, name them in human terms, and pressure-test your care and understanding."
          contentClassName="space-y-4"
        >
          {profile.audienceBuckets.map((bucket, index) => (
            <div
              key={bucket.id}
              className="space-y-3 rounded-lg border border-border/60 bg-background p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Audience bucket {index + 1}
                </h3>
                {profile.audienceBuckets.length > MIN_BUCKETS ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveBucket(bucket.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {bucketNotesBlocks.map((block, blockIndex) =>
                  renderBucketBlock(bucket, block, blockIndex),
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Aim for 3–4 distinct buckets.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddBucket}
              disabled={profile.audienceBuckets.length >= MAX_BUCKETS}
            >
              Add audience bucket
            </Button>
          </div>
          {audienceBucketsFooterBlocks.map((block, index) =>
            renderProfileBlock(block, index),
          )}
        </FormSectionCard>

        <FormSectionCard
          title="Steps 7–10: Value audit (Identity–Emotion–Action)"
          description="For each audience bucket, define the emotion you want them to feel and the action you want them to take."
          contentClassName="space-y-4"
        >
          {profile.audienceBuckets.map((bucket, index) => {
            const bucketLabel =
              bucket.name?.trim() || `Audience bucket ${index + 1}`;
            return (
              <div
                key={`value-${bucket.id}`}
                className="space-y-3 rounded-lg border border-border/60 bg-background p-4"
              >
                <h3 className="text-sm font-semibold">{bucketLabel}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {valueAuditBlocks.map((block, blockIndex) =>
                    renderBucketBlock(bucket, block, blockIndex),
                  )}
                </div>
              </div>
            );
          })}
        </FormSectionCard>

        <FormSectionCard
          title="Steps 11–13: Use the framework as a filter"
          description="Before making a video, check if the idea delivers the intended emotion and action for at least one audience."
          contentClassName="space-y-2 text-sm text-muted-foreground"
        >
          <p>
            If a concept only chases views without serving a defined audience,
            rework or discard it.
          </p>
          <p>
            Keep the Identity–Emotion–Action framework visible when you
            brainstorm ideas.
          </p>
        </FormSectionCard>

        <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <StatusMessage type="success" message={saveMessage} />
            <StatusMessage type="error" message={saveError} />
            {channelQuery.isError ? (
              <StatusMessage
                type="error"
                message="We couldn't load the channel profile."
              />
            ) : null}
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save channel profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
