import {
  checklistContent,
  profileFieldDefinitions,
} from "@/components/channel-profile/channelProfileContent";
import { ChecklistCard } from "@/components/channel-profile/ChecklistCard";
import { ProfileField } from "@/components/channel-profile/ProfileField";
import { SectionCard } from "@/components/channel-profile/SectionCard";

type AudienceFocusSectionProps = {
  value: string;
  onChange: (value: string) => void;
};

export function AudienceFocusSection({
  value,
  onChange,
}: AudienceFocusSectionProps) {
  return (
    <SectionCard
      title="Step 1: Start with the audience"
      description="Clarify who you actually want to serve, not who you are."
    >
      <ProfileField
        field={profileFieldDefinitions.audienceFocus}
        value={value}
        onChange={onChange}
      />
      <ChecklistCard
        title={checklistContent.audienceFocus.title}
        items={checklistContent.audienceFocus.items}
        className="p-3"
      />
    </SectionCard>
  );
}
