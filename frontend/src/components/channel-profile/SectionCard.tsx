import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SectionCardProps {
  title: string;
  description?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  contentClassName,
  children,
}: SectionCardProps) {
  return (
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
}
