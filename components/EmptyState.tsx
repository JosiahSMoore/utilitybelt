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
    <div className="text-center py-16 bg-white border border-black/[0.07] rounded-2xl">
      <p className="font-display text-xl font-semibold text-stone-900">{title}</p>
      <p className="text-black/45 text-[13.5px] mt-1.5">{body}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          className="mt-5 bg-[#b0430c] text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-full"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
