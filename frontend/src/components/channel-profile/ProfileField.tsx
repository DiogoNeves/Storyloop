import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition } from "@/components/channel-profile/channelProfileContent";

type ProfileFieldProps = {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
};

export function ProfileField({ field, value, onChange }: ProfileFieldProps) {
  return (
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
}
