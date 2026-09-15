"use client";

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-stone-300 rounded-2xl">
      <p className="font-display text-xl text-stone-800">{title}</p>
      <p className="text-stone-500 text-sm mt-1">{body}</p>
      {actionLabel && (
        <button onClick={onAction} className="mt-4 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
