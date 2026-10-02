export function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:mb-8">
      <h2 id={id} className="text-3xl sm:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="max-w-2xl text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
