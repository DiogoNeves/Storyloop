import type { ChannelProfileAdvice } from "@/api/channel";
import { ChecklistCard } from "@/components/channel-profile/ChecklistCard";
import { ProfileField } from "@/components/channel-profile/ProfileField";
import { SectionCard } from "@/components/channel-profile/SectionCard";

type AudienceFocusSectionProps = {
  advice: ChannelProfileAdvice;
  value: string;
  onChange: (value: string) => void;
};

export function AudienceFocusSection({
  advice,
  value,
  onChange,
}: AudienceFocusSectionProps) {
  return (
    <SectionCard
      title="Step 1: Start with the audience"
      description="Clarify who you actually want to serve, not who you are."
    >
      <ProfileField
        field={advice.profileFields.audienceFocus}
        value={value}
        onChange={onChange}
      />
      <ChecklistCard
        title={advice.checklists.audienceFocus.title}
        items={advice.checklists.audienceFocus.items}
        className="p-3"
      />
    </SectionCard>
  );
}
