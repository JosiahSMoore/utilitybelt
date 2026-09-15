"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Menu, Pause, Play, X } from "lucide-react";
import type { CookingLayoutProps } from "@/components/CookingMode";

const TIMER_PRESET_MINUTES = [1, 5, 10, 15, 20, 30];

function PhoneStartTimerControl({ onStart }: { onStart: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState(10);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <div className="relative mt-4" ref={menuRef}>
      <div className="flex items-stretch gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="px-4 rounded-full text-[13px] font-semibold bg-[rgba(246,242,228,.08)] border border-[rgba(246,242,228,.18)] text-[#e7c95f]"
        >
          {minutes} min ▾
        </button>
        <button
          onClick={() => onStart(minutes)}
          className="flex-1 px-5 py-3 rounded-full text-[13.5px] font-bold bg-[#e7c95f] text-[#103023]"
        >
          Start timer
        </button>
      </div>
      {open && (
        <div className="absolute z-10 bottom-full mb-2 left-0 bg-[#0c261c] border border-[rgba(246,242,228,.18)] rounded-xl shadow-lg p-1.5 w-36">
          {TIMER_PRESET_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMinutes(m);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                m === minutes ? "bg-[#e7c95f]/15 text-[#e7c95f] font-semibold" : "text-[#f6f2e4] hover:bg-white/5"
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CookingModePhone({
  steps,
  sections,
  stepIndexBySection,
  checked,
  toggleChecked,
  activeStep,
  setActiveStep,
  currentStepItems,
  timers,
  now,
  pauseTimer,
  resumeTimer,
  addMinuteToTimer,
  clearTimer,
  timerForActiveStep,
  activeCategories,
  startTimer,
  defaultTimerLabel,
  goToPrevStep,
  goToNextStep,
  handleStepTouchStart,
  handleStepTouchEnd,
  sheetOpen,
  setSheetOpen,
  setConfirmingExit,
  formatClock,
  timerRemainingMs,
}: CookingLayoutProps) {
  const stepIdx = activeStep ?? 0;
  const step = steps[stepIdx];
  const total = steps.length;
  const uncheckedCount = currentStepItems.filter((i) => !checked.has(i.id)).length;
  // Pending (not-yet-started) timers are only editable from the desktop
  // sidebar's "+" control for now — the phone dock only shows ones actually
  // running or paused.
  const sortedTimers = timers
    .filter((t) => t.status !== "pending")
    .sort((a, b) => timerRemainingMs(a, now) - timerRemainingMs(b, now));
  const primaryTimer = sortedTimers[0];
  const secondaryTimers = sortedTimers.slice(1);
  const bigStepText = (step?.text.length ?? 0) <= 220;

  if (!step) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#f6f2e4] px-8 text-center">
        <p className="text-sm text-[rgba(246,242,228,.6)]">No instructions added.</p>
        <button
          onClick={() => setConfirmingExit(true)}
          className="mt-6 px-5 py-2.5 rounded-full bg-[rgba(246,242,228,.1)] text-sm font-semibold"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Progress header */}
      <div className="flex items-center gap-3 px-[18px] pt-3.5 flex-none">
        <button
          onClick={() => setConfirmingExit(true)}
          className="w-9 h-9 rounded-full bg-[rgba(246,242,228,.1)] text-[rgba(246,242,228,.7)] flex items-center justify-center flex-none"
        >
          <X size={15} />
        </button>
        <div className="flex-1 flex gap-[5px]">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className="flex-1 h-[5px] rounded-[3px]"
              style={{ background: idx <= stepIdx ? "#e7c95f" : "rgba(246,242,228,.2)" }}
            />
          ))}
        </div>
        <span className="text-xs text-[rgba(246,242,228,.55)] tabular-nums flex-none">
          {stepIdx + 1}/{total}
        </span>
      </div>

      {/* Step body */}
      <div
        onTouchStart={handleStepTouchStart}
        onTouchEnd={handleStepTouchEnd}
        className="flex-1 min-h-0 overflow-y-auto px-[22px] pt-[26px] pb-4"
      >
        {step.categories.length > 0 && (
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            <span className="text-[10.5px] tracking-[.13em] uppercase font-bold text-[#103023] bg-[#e7c95f] px-2.5 py-1.5 rounded-md">
              {step.categories[0]}
            </span>
          </div>
        )}
        <p
          className="cook-serif text-[#f6f2e4] tracking-[-.012em]"
          style={{ fontSize: bigStepText ? 31 : 27, lineHeight: 1.3 }}
        >
          {step.text}
        </p>

        {currentStepItems.length > 0 && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[10.5px] tracking-[.14em] uppercase font-bold text-[rgba(246,242,228,.5)]">
                For this step
              </span>
              <span className="text-xs text-[rgba(246,242,228,.5)]">
                {uncheckedCount} of {currentStepItems.length} left
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentStepItems.map((ing) => {
                const isChecked = checked.has(ing.id);
                return (
                  <button
                    key={ing.id}
                    onClick={() => toggleChecked(ing.id)}
                    className={`flex items-center gap-2.5 px-[15px] py-3 rounded-full text-sm min-h-[44px] ${
                      isChecked
                        ? "bg-[rgba(231,201,95,.12)] border border-[rgba(231,201,95,.4)] text-[rgba(246,242,228,.5)]"
                        : "bg-[rgba(246,242,228,.08)] border border-[rgba(246,242,228,.18)] text-[#f6f2e4]"
                    }`}
                  >
                    {isChecked ? (
                      <span className="w-[17px] h-[17px] rounded-full bg-[#e7c95f] text-[#103023] text-[10px] font-bold flex items-center justify-center flex-none">
                        ✓
                      </span>
                    ) : (
                      <span className="w-[17px] h-[17px] rounded-full border-[1.5px] border-[rgba(246,242,228,.4)] flex-none" />
                    )}
                    <span className={isChecked ? "line-through" : ""}>{ing.name}</span>
                    <b className={`font-semibold ${isChecked ? "" : "text-[#e7c95f]"}`}>
                      {ing.quantity} {ing.unit}
                    </b>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {timerForActiveStep ? (
          <div className="mt-5 flex items-center gap-2.5 text-[13.5px] text-[rgba(246,242,228,.6)]">
            <span className="w-2 h-2 rounded-full bg-[#e7c95f]" />
            {formatClock(timerRemainingMs(timerForActiveStep, now))} timer running
          </div>
        ) : (
          <PhoneStartTimerControl
            onStart={(minutes) => startTimer(stepIdx, defaultTimerLabel(stepIdx, activeCategories), minutes)}
          />
        )}

        <button
          onClick={() => setSheetOpen(true)}
          className="mt-4 w-full flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border border-dashed border-[rgba(246,242,228,.25)] text-[rgba(246,242,228,.7)] text-[13.5px] font-medium"
        >
          <Menu size={15} />
          All ingredients
          <span className="ml-auto text-xs text-[rgba(246,242,228,.45)]">
            {sections.reduce((sum, s) => sum + s.items.length, 0)} items
          </span>
        </button>
      </div>

      {/* Timer dock */}
      {sortedTimers.length > 0 && (
        <div className="px-3.5 pb-1 flex-none space-y-2">
          {[primaryTimer, ...secondaryTimers].map((t, i) => {
            const remaining = timerRemainingMs(t, now);
            const ringing = remaining <= 0;
            const pct = Math.min(100, Math.max(0, 100 - (remaining / t.durationMs) * 100));
            const primary = i === 0;
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-2xl ${primary ? "px-[15px] py-3.5" : "px-3.5 py-2.5"}`}
                style={{
                  background: ringing ? "rgba(176,67,12,.25)" : "rgba(231,201,95,.13)",
                  border: `1px solid ${ringing ? "#b0430c" : "rgba(231,201,95,.38)"}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] tracking-[.13em] uppercase font-bold text-[#e7c95f] mb-0.5 truncate">
                    {t.stepIndex !== null ? `Step ${t.stepIndex + 1} · ${t.label}` : t.label}
                  </div>
                  <div
                    className="cook-serif font-semibold tabular-nums leading-tight text-[#f6f2e4]"
                    style={{ fontSize: primary ? 28 : 18 }}
                  >
                    {ringing ? "Time's up" : formatClock(remaining)}
                  </div>
                  {primary && !ringing && (
                    <span className="block h-1 rounded mt-2 relative bg-[rgba(231,201,95,.22)]">
                      <span
                        className="absolute left-0 top-0 bottom-0 rounded bg-[#e7c95f]"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  )}
                </div>
                {primary && (
                  <button
                    onClick={() => addMinuteToTimer(t.id)}
                    className="text-xs font-semibold text-[#e7c95f] px-3 py-2 rounded-full bg-[rgba(246,242,228,.1)] flex-none"
                  >
                    +1 min
                  </button>
                )}
                <button
                  onClick={() => (t.status === "running" ? pauseTimer(t.id) : resumeTimer(t.id))}
                  className={`rounded-full bg-[rgba(246,242,228,.1)] flex items-center justify-center text-[rgba(246,242,228,.8)] flex-none ${
                    primary ? "w-11 h-11" : "w-8 h-8"
                  }`}
                >
                  {t.status === "running" ? <Pause size={primary ? 15 : 12} /> : <Play size={primary ? 15 : 12} />}
                </button>
                <button
                  onClick={() => clearTimer(t.id)}
                  className={`rounded-full bg-[rgba(246,242,228,.1)] flex items-center justify-center text-[rgba(246,242,228,.6)] flex-none ${
                    primary ? "w-11 h-11" : "w-8 h-8"
                  }`}
                >
                  <X size={primary ? 14 : 11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-1 flex-none">
        <button
          onClick={goToPrevStep}
          disabled={stepIdx === 0}
          className="w-[52px] h-[52px] rounded-full border border-[rgba(246,242,228,.22)] text-[rgba(246,242,228,.55)] flex items-center justify-center flex-none disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={goToNextStep}
          className="flex-1 h-[52px] rounded-full bg-[#e7c95f] text-[#103023] text-[15.5px] font-bold flex items-center justify-center gap-2"
        >
          {stepIdx === total - 1 ? "Finish" : "Done, next step"}
          {stepIdx !== total - 1 && <ChevronRight size={17} />}
        </button>
      </div>

      {/* All-ingredients sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-[#0c261c]/60"
          />
          <div className="relative bg-[var(--cook-step-bg)] rounded-t-[24px] flex flex-col" style={{ height: "88%" }}>
            <span className="block w-[38px] h-1 rounded bg-black/[0.16] mx-auto mt-3.5 mb-3.5 flex-none" />
            <div className="flex items-baseline gap-2.5 px-[18px] mb-3.5 flex-none">
              <span className="cook-serif text-xl font-semibold text-[var(--cook-ink)]">All ingredients</span>
              <span className="text-xs text-black/45">
                {sections.reduce((sum, s) => sum + s.items.length, 0)} · {total} steps
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                className="ml-auto text-[12.5px] font-semibold text-[var(--cook-green)]"
              >
                Done
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pb-3 flex flex-col gap-4">
              {sections.map((section) => {
                const mappedIdx = stepIndexBySection.get(section.key);
                const isCurrent = mappedIdx === stepIdx;
                return (
                  <div key={section.key}>
                    {section.title && (
                      <div className="flex items-center gap-2 mb-2.5">
                        <span
                          className="w-[7px] h-[7px] rounded-full flex-none"
                          style={{ background: isCurrent ? "#8a6a10" : "rgba(0,0,0,.2)" }}
                        />
                        <span
                          className="text-[10.5px] tracking-[.14em] uppercase font-bold"
                          style={{ color: isCurrent ? "#8a6a10" : "rgba(0,0,0,.45)" }}
                        >
                          {section.title}
                          {isCurrent ? " · now" : mappedIdx !== undefined ? ` · step ${mappedIdx + 1}` : ""}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {section.items.map((ing) => {
                        const isChecked = checked.has(ing.id);
                        return (
                          <button
                            key={ing.id}
                            onClick={() => toggleChecked(ing.id)}
                            className={`flex items-center gap-3 px-3.5 py-3 rounded-[10px] text-left ${
                              isCurrent
                                ? isChecked
                                  ? "bg-black/[0.04]"
                                  : "bg-white border border-[#f0dd9c]"
                                : "bg-[var(--cook-row)]"
                            }`}
                          >
                            <span
                              className={`w-[19px] h-[19px] rounded-full flex items-center justify-center flex-none ${
                                isChecked ? "bg-[var(--cook-green)] text-white text-[10px] font-bold" : "border-[1.5px] border-black/25"
                              }`}
                            >
                              {isChecked && "✓"}
                            </span>
                            <span
                              className={`flex-1 text-sm font-medium ${
                                isChecked ? "line-through text-black/40" : "text-[var(--cook-ink)]"
                              }`}
                            >
                              {ing.name}
                            </span>
                            <span className="text-[13px] text-black/45">
                              {ing.quantity} {ing.unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {primaryTimer && (
              <div className="flex-none px-[18px] pb-4 pt-2">
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-[var(--cook-gold-border)]">
                  <span className="text-[10px] tracking-[.13em] uppercase font-bold text-[var(--cook-gold-text)] flex-none">
                    {primaryTimer.stepIndex !== null ? `Step ${primaryTimer.stepIndex + 1}` : primaryTimer.label}
                  </span>
                  <span className="cook-serif text-2xl font-semibold tabular-nums ml-auto text-[var(--cook-ink)]">
                    {formatClock(timerRemainingMs(primaryTimer, now))}
                  </span>
                  <button
                    onClick={() => (primaryTimer.status === "running" ? pauseTimer(primaryTimer.id) : resumeTimer(primaryTimer.id))}
                    className="w-10 h-10 rounded-full bg-[var(--cook-row)] border border-black/[0.08] flex items-center justify-center text-black/60 flex-none"
                  >
                    {primaryTimer.status === "running" ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => clearTimer(primaryTimer.id)}
                    className="w-10 h-10 rounded-full bg-[var(--cook-row)] border border-black/[0.08] flex items-center justify-center text-black/45 flex-none"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
