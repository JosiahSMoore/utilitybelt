"use client";

export function ConfirmModal({
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-amber-50 rounded-2xl w-full max-w-sm p-5">
        <p className="text-sm text-stone-700 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-full text-sm font-medium bg-orange-700 text-amber-50">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
