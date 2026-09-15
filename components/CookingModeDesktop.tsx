"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Pause, Play, Square, X } from "lucide-react";
import type { CookingLayoutProps } from "@/components/CookingMode";

// The light iPad/desktop split view (≥820px — CookingMode routes anything
// narrower to CookingModePhone instead, so this never has to handle a
// cramped viewport).
export default function CookingModeDesktop({
  recipe,
  steps,
  sections,
  checked,
  activeStep,
  setActiveStep,
  sidebarScope,
  setSidebarScope,
  sectionStatus,
  isSectionCollapsed,
  toggleSectionCollapse,
  comingUpSections,
  sectionRefs,
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
  StartTimerControl,
  goToPrevStep,
  goToNextStep,
  handleStepTouchStart,
  handleStepTouchEnd,
  renderIngredientRow,
  focusContentRef,
  stepTextRef,
  stepFontSize,
  setConfirmingExit,
  formatClock,
  timerRemainingMs,
}: CookingLayoutProps) {
  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Ingredient sidebar */}
      <div className="flex flex-col flex-none w-[360px] lg:w-[392px] bg-white border-r border-black/[0.07] overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex-none">
          <div className="text-[10.5px] uppercase tracking-widest font-semibold text-black/45 mb-2">Cooking now</div>
          <div className="cook-serif text-[22px] font-semibold tracking-tight text-[var(--cook-ink)]">{recipe.name}</div>
          <div className="flex gap-2 mt-3.5">
            <button
              onClick={() => setSidebarScope("step")}
              className={`text-[12.5px] font-semibold px-4 py-2 rounded-full ${
                sidebarScope === "step" ? "bg-[var(--cook-green)] text-white" : "bg-black/5 text-black/55"
              }`}
            >
              This step
            </button>
            <button
              onClick={() => setSidebarScope("all")}
              className={`text-[12.5px] font-semibold px-4 py-2 rounded-full ${
                sidebarScope === "all" ? "bg-[var(--cook-green)] text-white" : "bg-black/5 text-black/55"
              }`}
            >
              All ingredients
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3 divide-y divide-black/[0.07]">
          {sections.map((section) => {
            const status = sectionStatus(section);
            const collapsed = isSectionCollapsed(section, status);
            const total = section.items.length;
            const checkedCount = section.items.filter((i) => checked.has(i.id)).length;

            return (
              <div key={section.key} ref={(el) => { sectionRefs.current[section.key] = el; }} className="py-5 first:pt-0">
                {section.title && (
                  <button
                    onClick={() => toggleSectionCollapse(section, status)}
                    className="w-full flex items-center justify-between gap-2 mb-2.5 text-left"
                  >
                    <span
                      className={`text-[10.5px] uppercase tracking-widest font-semibold ${
                        status === "done" ? "text-black/30" : "text-black/45"
                      }`}
                    >
                      {status === "done" ? `${section.title} · done` : section.title}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-black/30 flex-none transition-transform ${collapsed ? "" : "rotate-180"}`}
                    />
                  </button>
                )}
                {collapsed ? (
                  <div className="flex items-center justify-between px-4 py-3 rounded-[10px] bg-[var(--cook-row)]">
                    <span className="text-[13.5px] text-black/40">
                      {total} ingredient{total === 1 ? "" : "s"}
                    </span>
                    {checkedCount === total ? (
                      <Check size={15} className="text-[var(--cook-green)]" strokeWidth={3} />
                    ) : (
                      <span className="text-xs text-black/30">
                        {checkedCount}/{total} checked
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">{section.items.map(renderIngredientRow)}</div>
                )}
              </div>
            );
          })}

          {comingUpSections.length > 0 && (
            <div className="py-5 first:pt-0">
              <p className="text-[10.5px] uppercase tracking-widest font-semibold text-black/40 mb-2.5">Coming up</p>
              <div className="space-y-1.5">
                {comingUpSections.map(({ section, stepIdx }) => (
                  <button
                    key={section.key}
                    onClick={() => setActiveStep(stepIdx)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[10px] bg-[var(--cook-row)] text-left"
                  >
                    <span className="text-[13.5px] text-black/60">{section.title ?? "Ingredients"}</span>
                    <span className="text-xs text-black/40">
                      {section.items.length} items · step {stepIdx + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pt-4 pb-5 border-t border-black/[0.07] flex-none">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="text-[10.5px] uppercase tracking-widest font-semibold text-black/45">Timers</span>
            {timers.length > 0 && <span className="text-[11.5px] text-black/40">{timers.length} running</span>}
          </div>
          {timers.length === 0 ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 rounded-[10px] bg-[var(--cook-row)]">
              <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-dashed border-black/25 flex-none" />
              <span className="text-[13px] text-black/40">No timer running</span>
            </div>
          ) : (
            <div className="space-y-2">
              {timers.map((t) => {
                const remaining = timerRemainingMs(t, now);
                const ringing = remaining <= 0;
                const pct = Math.min(100, Math.max(0, 100 - (remaining / t.durationMs) * 100));
                return (
                  <div
                    key={t.id}
                    className={`px-4 py-3.5 rounded-xl border ${
                      ringing
                        ? "bg-[var(--cook-orange)]/10 border-[var(--cook-orange)] animate-pulse"
                        : "bg-[var(--cook-step-bg)] border-[var(--cook-gold-border)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className={`text-[10.5px] uppercase tracking-widest font-bold mb-1 truncate ${
                            ringing ? "text-[var(--cook-orange)]" : "text-[var(--cook-gold-text)]"
                          }`}
                        >
                          Step {t.stepIndex + 1} · {t.label}
                        </div>
                        <div className="cook-serif text-[26px] font-semibold tabular-nums leading-none text-[var(--cook-ink)]">
                          {ringing ? "Time's up" : formatClock(remaining)}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-none">
                        <button
                          onClick={() => (t.running ? pauseTimer(t.id) : resumeTimer(t.id))}
                          title={ringing && t.running ? "Dismiss" : t.running ? "Pause" : "Resume"}
                          className="w-9 h-9 rounded-full bg-white border border-black/10 flex items-center justify-center text-black/60"
                        >
                          {ringing && t.running ? <Square size={13} /> : t.running ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button
                          onClick={() => clearTimer(t.id)}
                          className="w-9 h-9 rounded-full bg-white border border-black/10 flex items-center justify-center text-black/45"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {!ringing && (
                      <span className="block h-1 rounded mt-3 relative bg-[var(--cook-gold-text)]/20">
                        <span
                          className="absolute left-0 top-0 bottom-0 rounded bg-[var(--cook-gold-text)]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                    <div className="flex items-center justify-end mt-2">
                      <button
                        onClick={() => addMinuteToTimer(t.id)}
                        className={`text-[11.5px] font-semibold ${
                          ringing ? "text-[var(--cook-orange)]" : "text-[var(--cook-gold-text)]"
                        }`}
                      >
                        +1 min
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Instructions panel */}
      <div
        onTouchStart={handleStepTouchStart}
        onTouchEnd={handleStepTouchEnd}
        className={`flex flex-col flex-1 min-h-0 ${
          activeStep === null ? "overflow-y-auto" : "overflow-hidden"
        } bg-[var(--cook-step-bg)] p-4 md:p-6`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap flex-none">
          <div className="flex flex-wrap gap-1.5">
            {steps.length > 0 && (
              <>
                <button
                  onClick={() => setActiveStep(null)}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold ${
                    activeStep === null ? "bg-white border border-black/10 text-black/60" : "bg-black/5 text-black/50 hover:bg-black/10"
                  }`}
                >
                  All steps
                </button>
                {steps.map((_, idx) => {
                  const isDone = activeStep !== null && idx < activeStep;
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveStep(idx)}
                      className={`w-[31px] h-[31px] rounded-full text-[13px] font-bold flex items-center justify-center ${
                        activeStep === idx
                          ? "bg-[var(--cook-green)] text-white"
                          : isDone
                            ? "bg-[var(--cook-green)]/10 border border-[var(--cook-green)] text-[var(--cook-green)]"
                            : "bg-black/5 text-black/50 hover:bg-black/10"
                      }`}
                    >
                      {isDone ? <Check size={14} strokeWidth={3} /> : idx + 1}
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <button
            onClick={() => setConfirmingExit(true)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-black/5 text-black/45 hover:bg-black/10"
          >
            <X size={16} />
          </button>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-black/50">No instructions added.</p>
        ) : (
          <>
            {activeStep === null ? (
              <ol className="space-y-4 max-w-3xl pb-24">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="cook-serif text-lg text-black/35 flex-shrink-0 w-6">{idx + 1}</span>
                    <div>
                      {step.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {step.categories.map((c) => (
                            <span
                              key={c}
                              className="text-[10px] font-bold uppercase tracking-wide bg-[var(--cook-gold-bg)] text-[var(--cook-gold-text)] px-1.5 py-0.5 rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-lg text-[var(--cook-ink)] leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              // Centred, capped-width column (not a top-left block) — a
              // short step shouldn't leave two-thirds of the pane empty.
              <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center md:px-[48px]">
                <div ref={focusContentRef} className="w-full max-w-[660px] max-h-full overflow-hidden flex flex-col pb-40">
                  {steps[activeStep].categories.length > 0 && (
                    <div className="flex-none flex flex-wrap items-center gap-2 mb-5">
                      {steps[activeStep].categories.map((c) => (
                        <span
                          key={c}
                          className="text-[10.5px] font-bold uppercase tracking-wide bg-[var(--cook-gold-bg)] text-[var(--cook-gold-text)] px-2.5 py-1.5 rounded-md"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p
                    ref={stepTextRef}
                    style={{ fontSize: `${stepFontSize}px` }}
                    className="cook-serif text-[var(--cook-ink)] leading-[1.28] tracking-tight flex-1 min-h-0 overflow-hidden"
                  >
                    {steps[activeStep].text}
                  </p>

                  {timerForActiveStep ? (
                    <div className="flex-none mt-8 flex items-center gap-2.5 text-[13.5px] text-black/50">
                      <span className="w-2 h-2 rounded-full bg-[var(--cook-gold-text)]" />
                      <span>
                        {formatClock(timerRemainingMs(timerForActiveStep, now))} timer running — see the sidebar
                      </span>
                    </div>
                  ) : (
                    <div className="flex-none">
                      <StartTimerControl
                        onStart={(minutes) => startTimer(activeStep, defaultTimerLabel(activeStep, activeCategories), minutes)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {steps.length > 0 && (
        <div className="flex fixed bottom-0 left-0 right-0 md:left-[360px] lg:left-[392px] items-center justify-between gap-4 px-4 py-5 md:px-7 bg-gradient-to-t from-[var(--cook-step-bg)] via-[var(--cook-step-bg)] to-transparent pointer-events-none z-10">
          <button
            onClick={goToPrevStep}
            disabled={activeStep === null}
            className="pointer-events-auto w-14 h-14 rounded-full bg-black/5 flex items-center justify-center disabled:opacity-30 flex-shrink-0"
          >
            <ChevronLeft size={22} className="text-black/40" />
          </button>
          <div className="pointer-events-auto flex-1 flex flex-col items-center gap-2">
            {activeStep !== null ? (
              <>
                <span className="text-xs text-black/45 font-medium">
                  Step {activeStep + 1} of {steps.length}
                </span>
                <span className="block w-64 max-w-full h-1 rounded bg-black/[0.08] relative">
                  <span
                    className="absolute left-0 top-0 bottom-0 rounded bg-[var(--cook-green)]"
                    style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
                  />
                </span>
              </>
            ) : (
              <span className="text-xs text-black/45 font-medium">All steps</span>
            )}
          </div>
          <button
            onClick={goToNextStep}
            disabled={activeStep !== null && activeStep === steps.length - 1}
            className="pointer-events-auto flex items-center gap-2.5 h-[52px] pl-6 pr-2.5 rounded-full bg-[var(--cook-green)] text-white font-semibold text-[14.5px] disabled:opacity-30 flex-shrink-0"
          >
            {activeStep !== null && activeStep === steps.length - 1 ? "Finish" : "Next step"}
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <ChevronRight size={17} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
