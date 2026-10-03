import type { ReactNode } from "react";

export function SectionHeading({ id, title, subtitle, action }: { id: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-8">
      <div className="flex flex-col gap-1.5">
        <h2 id={id} className="text-[1.75rem] sm:text-4xl">
          {title}
        </h2>
        {subtitle ? <p className="max-w-2xl text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
