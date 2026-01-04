import { type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  /** Input element ID for label association */
  id: string;
  /** Label text */
  label: ReactNode;
  /** The form control (Input, Textarea, Select, etc.) */
  children: ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Show required indicator */
  required?: boolean;
  /** Help text displayed below the input */
  description?: ReactNode;
  /** Error message displayed below the input */
  error?: ReactNode;
}

/**
 * Wrapper component for form fields with label, optional description,
 * and error message support.
 */
export function FormField({
  id,
  label,
  children,
  className,
  required,
  description,
  error,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
