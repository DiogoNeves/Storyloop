import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusMessage } from "@/components/ui/status-message";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MIN_BUCKETS = 3;
const MAX_BUCKETS = 4;

const createEmptyBucket = (): AudienceBucket => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  careAndUnderstanding: "",
  careAndUnderstandingConfirmed: false,
  otherCreatorsWatched: "",
  personalConnection: false,
  personalConnectionNotes: "",
  valueEmotion: "",
  valueAction: "",
  valueSpecific: false,
  valueRealistic: false,
  valueRepeatable: false,
  valueNotes: "",
});

const createEmptyProfile = (): ChannelProfile => ({
  audienceFocus: "",
  personalConnectionConfirmed: false,
  personalConnectionNotes: "",
  bucketsLocked: false,
  bucketsLockedNotes: "",
  audienceBuckets: Array.from({ length: MIN_BUCKETS }, createEmptyBucket),
});

const normalizeProfile = (profile: ChannelProfile | null): ChannelProfile => {
  const base = profile ?? createEmptyProfile();
  const buckets = (base.audienceBuckets ?? []).map((bucket) => ({
    ...createEmptyBucket(),
    ...bucket,
    id: bucket.id || crypto.randomUUID(),
  }));
  while (buckets.length < MIN_BUCKETS) {
    buckets.push(createEmptyBucket());
  }
  return {
    ...createEmptyProfile(),
    ...base,
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Step 1: Start with the audience
            </CardTitle>
            <CardDescription>
              Clarify who you actually want to serve, not who you are.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="channel-audience-focus">
              Who do you want to serve?
            </Label>
            <Textarea
              id="channel-audience-focus"
              value={profile.audienceFocus ?? ""}
              onChange={(event) =>
                updateProfile({ audienceFocus: event.target.value })
              }
              placeholder="Describe the people you want to help most."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Steps 2–6: Build your audience buckets
            </CardTitle>
            <CardDescription>
              Create 3–4 distinct groups, name them in human terms, and
              pressure-test your care and understanding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <div className="space-y-2">
                    <Label htmlFor={`bucket-${bucket.id}-name`}>
                      Audience identity
                    </Label>
                    <Input
                      id={`bucket-${bucket.id}-name`}
                      value={bucket.name ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.id, { name: event.target.value })
                      }
                      placeholder="Ex: Solo filmmakers"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`bucket-${bucket.id}-description`}>
                      Description
                    </Label>
                    <Textarea
                      id={`bucket-${bucket.id}-description`}
                      value={bucket.description ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Add context you can empathize with."
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`bucket-${bucket.id}-care`}>
                      Pressure test: do you care about and understand them?
                    </Label>
                    <Textarea
                      id={`bucket-${bucket.id}-care`}
                      value={bucket.careAndUnderstanding ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.id, {
                          careAndUnderstanding: event.target.value,
                        })
                      }
                      placeholder="What proves you care and understand this group?"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                    <div>
                      <p className="text-sm font-medium">
                        I genuinely care and understand this group
                      </p>
                    </div>
                    <Switch
                      checked={bucket.careAndUnderstandingConfirmed ?? false}
                      onCheckedChange={(checked) =>
                        updateBucket(bucket.id, {
                          careAndUnderstandingConfirmed: checked,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`bucket-${bucket.id}-creators`}>
                      What other creators or content do they watch?
                    </Label>
                    <Textarea
                      id={`bucket-${bucket.id}-creators`}
                      value={bucket.otherCreatorsWatched ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.id, {
                          otherCreatorsWatched: event.target.value,
                        })
                      }
                      placeholder="List channels, shows, or formats they already follow."
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                    <div>
                      <p className="text-sm font-medium">
                        I personally belong to or deeply understand this
                        audience
                      </p>
                    </div>
                    <Switch
                      checked={bucket.personalConnection ?? false}
                      onCheckedChange={(checked) =>
                        updateBucket(bucket.id, {
                          personalConnection: checked,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`bucket-${bucket.id}-personal-notes`}>
                      Personal connection notes
                    </Label>
                    <Textarea
                      id={`bucket-${bucket.id}-personal-notes`}
                      value={bucket.personalConnectionNotes ?? ""}
                      onChange={(event) =>
                        updateBucket(bucket.id, {
                          personalConnectionNotes: event.target.value,
                        })
                      }
                      placeholder="What makes you part of or close to this audience?"
                    />
                  </div>
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
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  I feel these buckets are coherent and motivating
                </p>
                <p className="text-xs text-muted-foreground">
                  Lock them in once they feel right.
                </p>
              </div>
              <Switch
                checked={profile.bucketsLocked ?? false}
                onCheckedChange={(checked) =>
                  updateProfile({ bucketsLocked: checked })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-buckets-locked-notes">
                Notes on locking these buckets
              </Label>
              <Textarea
                id="channel-buckets-locked-notes"
                value={profile.bucketsLockedNotes ?? ""}
                onChange={(event) =>
                  updateProfile({ bucketsLockedNotes: event.target.value })
                }
                placeholder="Why do these feel coherent and motivating?"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  I personally belong to or deeply understand at least one
                  audience
                </p>
                <p className="text-xs text-muted-foreground">
                  This keeps the channel grounded in real empathy.
                </p>
              </div>
              <Switch
                checked={profile.personalConnectionConfirmed ?? false}
                onCheckedChange={(checked) =>
                  updateProfile({ personalConnectionConfirmed: checked })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-personal-connection-notes">
                Which audience do you belong to or deeply understand?
              </Label>
              <Textarea
                id="channel-personal-connection-notes"
                value={profile.personalConnectionNotes ?? ""}
                onChange={(event) =>
                  updateProfile({
                    personalConnectionNotes: event.target.value,
                  })
                }
                placeholder="Call out the audience(s) you know best."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Steps 7–10: Value audit (Identity–Emotion–Action)
            </CardTitle>
            <CardDescription>
              For each audience bucket, define the emotion you want them to feel
              and the action you want them to take.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <div className="space-y-2">
                      <Label htmlFor={`bucket-${bucket.id}-emotion`}>
                        Desired emotion
                      </Label>
                      <Input
                        id={`bucket-${bucket.id}-emotion`}
                        value={bucket.valueEmotion ?? ""}
                        onChange={(event) =>
                          updateBucket(bucket.id, {
                            valueEmotion: event.target.value,
                          })
                        }
                        placeholder="Ex: relief, confidence, curiosity"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`bucket-${bucket.id}-action`}>
                        Immediate action
                      </Label>
                      <Input
                        id={`bucket-${bucket.id}-action`}
                        value={bucket.valueAction ?? ""}
                        onChange={(event) =>
                          updateBucket(bucket.id, {
                            valueAction: event.target.value,
                          })
                        }
                        placeholder="Ex: open their project timeline tonight"
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">
                          Emotion and action are specific
                        </p>
                      </div>
                      <Switch
                        checked={bucket.valueSpecific ?? false}
                        onCheckedChange={(checked) =>
                          updateBucket(bucket.id, { valueSpecific: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">
                          Emotion and action are realistic
                        </p>
                      </div>
                      <Switch
                        checked={bucket.valueRealistic ?? false}
                        onCheckedChange={(checked) =>
                          updateBucket(bucket.id, { valueRealistic: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">
                          Emotion and action are repeatable
                        </p>
                      </div>
                      <Switch
                        checked={bucket.valueRepeatable ?? false}
                        onCheckedChange={(checked) =>
                          updateBucket(bucket.id, { valueRepeatable: checked })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`bucket-${bucket.id}-value-notes`}>
                        Notes on specificity and repeatability
                      </Label>
                      <Textarea
                        id={`bucket-${bucket.id}-value-notes`}
                        value={bucket.valueNotes ?? ""}
                        onChange={(event) =>
                          updateBucket(bucket.id, {
                            valueNotes: event.target.value,
                          })
                        }
                        placeholder="What makes this emotion/action consistent?"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Steps 11–13: Use the framework as a filter
            </CardTitle>
            <CardDescription>
              Before making a video, check if the idea delivers the intended
              emotion and action for at least one audience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              If a concept only chases views without serving a defined audience,
              rework or discard it.
            </p>
            <p>
              Keep the Identity–Emotion–Action framework visible when you
              brainstorm ideas.
            </p>
          </CardContent>
        </Card>

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
