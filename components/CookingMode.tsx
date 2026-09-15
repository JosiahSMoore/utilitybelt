"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pause, Play, Square, X } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  generateId,
  groupIngredientsBySection,
  parseInstructionSteps,
  scaleQuantityDisplay,
  sectionStepIndex,
} from "@/lib/helpers";
import type { Recipe } from "@/lib/types";

type CookTimer = {
  id: string;
  stepIndex: number;
  label: string;
  durationMs: number;
  endsAt: number; // authoritative only while `running`
  running: boolean;
  remainingMsWhenPaused: number;
};

const TIMER_PRESET_MINUTES = [1, 5, 10, 15, 20, 30];

function timerRemainingMs(t: CookTimer, now: number): number {
  return t.running ? Math.max(0, t.endsAt - now) : t.remainingMsWhenPaused;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function defaultTimerLabel(stepIndex: number, categories: string[]): string {
  if (categories.length > 0) {
    return categories[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return `Step ${stepIndex + 1}`;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // audio isn't essential — the visual ringing state still shows
  }
}

function timerStorageKey(sessionKey: string) {
  return `cookTimers:${sessionKey}`;
}

function loadTimers(sessionKey: string): CookTimer[] {
  try {
    const raw = localStorage.getItem(timerStorageKey(sessionKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTimers(sessionKey: string, timers: CookTimer[]) {
  try {
    localStorage.setItem(timerStorageKey(sessionKey), JSON.stringify(timers));
  } catch {
    // localStorage unavailable (private mode, etc.) — timers just won't
    // survive a reload.
  }
}

function loadCookingState(key: string): { checked: string[]; step: number | null } {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { checked: [], step: null };
    const parsed = JSON.parse(raw);
    return {
      checked: Array.isArray(parsed.checked) ? parsed.checked : [],
      step: typeof parsed.step === "number" ? parsed.step : null,
    };
  } catch {
    return { checked: [], step: null };
  }
}

function saveCookingState(key: string, state: { checked: string[]; step: number | null }) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — cooking still works,
    // it just won't survive an accidental reload.
  }
}

function StartTimerControl({ onStart }: { onStart: (minutes: number) => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      {TIMER_PRESET_MINUTES.map((m) => (
        <button
          key={m}
          onClick={() => onStart(m)}
          className="text-sm font-semibold px-3.5 py-2.5 rounded-full bg-white border border-black/10 text-[var(--cook-ink)] hover:bg-black/5"
        >
          {m} min
        </button>
      ))}
      <input
        type="number"
        min={0.5}
        step={0.5}
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="Custom"
        className="w-24 text-sm px-3.5 py-2.5 rounded-full border border-black/10 bg-white"
      />
      <button
        onClick={() => {
          const n = parseFloat(custom);
          if (n > 0) {
            onStart(n);
            setCustom("");
          }
        }}
        className="text-sm font-semibold px-5 py-2.5 rounded-full bg-[var(--cook-orange)] text-white"
      >
        Start timer
      </button>
    </div>
  );
}

export default function CookingMode({
  recipe,
  flexIds,
  servingMultiplier,
  sessionKey,
  onClose,
}: {
  recipe: Recipe;
  flexIds: string[];
  servingMultiplier: number;
  sessionKey: string;
  onClose: () => void;
}) {
  const steps = useMemo(() => parseInstructionSteps(recipe.instructions), [recipe.instructions]);
  const sections = useMemo(() => {
    // Flex ingredients live wherever they were placed in the recipe rather
    // than a separate trailing group — only the ones active for this
    // cooking session are included.
    const cookingIngredients = recipe.ingredients.filter((i) => !i.isFlex || flexIds.includes(i.id));
    return groupIngredientsBySection(cookingIngredients);
  }, [recipe.ingredients, flexIds]);
  const stepIndexBySection = useMemo(() => sectionStepIndex(sections, steps), [sections, steps]);

  const initial = useMemo(() => loadCookingState(sessionKey), [sessionKey]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial.checked));
  const [activeStep, setActiveStep] = useState<number | null>(initial.step);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [mobileTab, setMobileTab] = useState<"ingredients" | "instructions">("ingredients");
  const [sidebarScope, setSidebarScope] = useState<"step" | "all">("step");
  // Per-section manual expand/collapse, overriding whatever the scope's own
  // default would be. Sticky across scope changes and step navigation — once
  // you've opened or closed a category yourself, it stays that way until you
  // tap it again.
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});
  const [timers, setTimers] = useState<CookTimer[]>(() => loadTimers(sessionKey));
  const [now, setNow] = useState(() => Date.now());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const focusContentRef = useRef<HTMLDivElement | null>(null);
  const stepTextRef = useRef<HTMLParagraphElement | null>(null);
  const [stepFontSize, setStepFontSize] = useState(42);

  useEffect(() => {
    saveCookingState(sessionKey, { checked: Array.from(checked), step: activeStep });
  }, [checked, activeStep, sessionKey]);

  useEffect(() => {
    saveTimers(sessionKey, timers);
  }, [timers, sessionKey]);

  useEffect(() => {
    if (activeStep === null) return;
    const step = steps[activeStep];
    if (!step || step.categories.length === 0) return;
    const match = sections.find((s) => s.title && step.categories.includes(s.title.toUpperCase()));
    if (match) {
      sectionRefs.current[match.key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStep, steps, sections]);

  // Instead of letting a long step scroll, shrink its text until it fits the
  // available space — measure at the largest size, then step the font size
  // down until the content no longer overflows its (non-scrolling) container.
  useLayoutEffect(() => {
    if (activeStep === null) return;
    function fit() {
      const container = focusContentRef.current;
      const textEl = stepTextRef.current;
      if (!container || !textEl) return;
      const maxFont = window.innerWidth >= 768 ? 42 : 32;
      const minFont = 18;
      let size = maxFont;
      textEl.style.fontSize = `${size}px`;
      while (size > minFont && container.scrollHeight > container.clientHeight) {
        size -= 2;
        textEl.style.fontSize = `${size}px`;
      }
      setStepFontSize(size);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [activeStep, steps]);

  // Wall-clock (`endsAt`) timers stay correct even if the interval is
  // throttled in a backgrounded tab — this only ticks re-renders, it never
  // does the actual timekeeping. Skipped entirely when nothing is running,
  // so an idle cooking session doesn't re-render every second for no reason.
  useEffect(() => {
    if (!timers.some((t) => t.running)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers]);

  // Persistent alarm: as long as a timer is both `running` and expired, this
  // re-fires once per tick (the 1s interval above) — so it keeps beeping
  // until you either clear it or hit the stop-alarm control, which sets
  // `running: false` and drops it out of this check.
  useEffect(() => {
    if (timers.some((t) => t.running && timerRemainingMs(t, now) <= 0)) {
      playBeep();
    }
  }, [timers, now]);

  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock) {
          wakeLockRef.current = await nav.wakeLock.request("screen");
        }
      } catch {
        // unsupported or denied — cooking still works without it
      }
    }
    acquire();
    function onVisibility() {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmingExit(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // From step 1, "back" returns to the All-steps overview rather than doing
  // nothing — only the overview itself is a true dead end for Prev.
  function goToPrevStep() {
    setActiveStep((s) => {
      if (s === null) return s;
      return s > 0 ? s - 1 : null;
    });
  }

  function goToNextStep() {
    setActiveStep((s) => {
      if (s === null) return 0;
      return s < steps.length - 1 ? s + 1 : s;
    });
  }

  // Swipe left/right between steps (iPad, or any touch device) — only while
  // focused on a single step; a large-enough, mostly-horizontal touch
  // gesture is treated as a swipe so it doesn't fight with vertical
  // scrolling of a long step.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleStepTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleStepTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || activeStep === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goToNextStep();
    else goToPrevStep();
  }

  function startTimer(stepIndex: number, label: string, minutes: number) {
    if (!minutes || minutes <= 0) return;
    const durationMs = minutes * 60_000;
    const timer: CookTimer = {
      id: generateId(),
      stepIndex,
      label,
      durationMs,
      endsAt: Date.now() + durationMs,
      running: true,
      remainingMsWhenPaused: durationMs,
    };
    setTimers((prev) => [...prev, timer]);
  }

  function pauseTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && t.running
          ? { ...t, running: false, remainingMsWhenPaused: timerRemainingMs(t, Date.now()) }
          : t
      )
    );
  }

  function resumeTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id && !t.running ? { ...t, running: true, endsAt: Date.now() + t.remainingMsWhenPaused } : t
      )
    );
  }

  function addMinuteToTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return t.running ? { ...t, endsAt: t.endsAt + 60_000 } : { ...t, remainingMsWhenPaused: t.remainingMsWhenPaused + 60_000 };
      })
    );
  }

  function clearTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  function confirmExit() {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(timerStorageKey(sessionKey));
    } catch {
      // ignore
    }
    onClose();
  }

  const activeCategories = activeStep !== null ? steps[activeStep]?.categories ?? [] : [];
  const timerForActiveStep = activeStep !== null ? timers.find((t) => t.stepIndex === activeStep) : undefined;

  function sectionStatus(section: (typeof sections)[number]): "general" | "current" | "done" | "future" {
    if (activeStep === null) return "general";
    const mapped = stepIndexBySection.get(section.key);
    if (mapped === undefined) return "general";
    if (mapped === activeStep) return "current";
    return mapped < activeStep ? "done" : "future";
  }

  // "All ingredients" shows everything expanded by default, same as the "All
  // steps" overview — a section only compresses if you tap it shut, or if
  // you're in "This step" scope, which defaults every non-current section
  // (aside from untracked/"general" ones with no step of their own) closed.
  function defaultCollapsed(section: (typeof sections)[number], status: ReturnType<typeof sectionStatus>): boolean {
    if (!section.title) return false;
    if (sidebarScope === "all") return false;
    if (status === "general") return false;
    return status !== "current";
  }

  function isSectionCollapsed(section: (typeof sections)[number], status: ReturnType<typeof sectionStatus>): boolean {
    const override = collapseOverrides[section.key];
    return override !== undefined ? override : defaultCollapsed(section, status);
  }

  function toggleSectionCollapse(section: (typeof sections)[number], status: ReturnType<typeof sectionStatus>) {
    setCollapseOverrides((prev) => ({ ...prev, [section.key]: !isSectionCollapsed(section, status) }));
  }

  const comingUpSections = useMemo(() => {
    if (activeStep === null) return [];
    return sections
      .map((section) => ({ section, stepIdx: stepIndexBySection.get(section.key) }))
      .filter((x): x is { section: (typeof sections)[number]; stepIdx: number } => x.stepIdx !== undefined && x.stepIdx > activeStep)
      .sort((a, b) => a.stepIdx - b.stepIdx);
  }, [sections, stepIndexBySection, activeStep]);

  function renderIngredientRow(ing: Recipe["ingredients"][number]) {
    const isChecked = checked.has(ing.id);
    return (
      <button
        key={ing.id}
        onClick={() => toggleChecked(ing.id)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[10px] border text-left ${
          isChecked ? "bg-[var(--cook-row)] border-transparent" : "bg-[var(--cook-step-bg)] border-[var(--cook-step-border)]"
        }`}
      >
        <span
          className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-none ${
            isChecked ? "bg-[var(--cook-green)] text-white text-[10px] font-bold" : "border-[1.5px] border-black/30"
          }`}
        >
          {isChecked && "✓"}
        </span>
        <span className={`flex-1 text-sm font-semibold ${isChecked ? "line-through text-black/40" : "text-[var(--cook-ink)]"}`}>
          {ing.name}
        </span>
        <span className={`text-sm ${isChecked ? "text-black/35" : "text-black/50"}`}>
          {scaleQuantityDisplay(ing.quantity, servingMultiplier)} {ing.unit}
        </span>
      </button>
    );
  }

  return (
    <div className="cook-mode fixed inset-0 z-50 flex flex-col overscroll-none bg-[var(--cook-canvas)]">
      <div className="md:hidden flex border-b border-black/10 bg-white flex-shrink-0">
        <button
          onClick={() => setMobileTab("ingredients")}
          className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 ${
            mobileTab === "ingredients" ? "text-[var(--cook-green)] border-[var(--cook-green)]" : "text-black/35 border-transparent"
          }`}
        >
          Ingredients
        </button>
        <button
          onClick={() => setMobileTab("instructions")}
          className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 ${
            mobileTab === "instructions" ? "text-[var(--cook-green)] border-[var(--cook-green)]" : "text-black/35 border-transparent"
          }`}
        >
          Instructions
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Ingredient sidebar */}
        <div
          className={`${
            mobileTab === "ingredients" ? "flex" : "hidden"
          } md:flex flex-col flex-1 min-h-0 md:flex-none md:w-[360px] lg:w-[392px] bg-white md:border-r border-black/[0.07] overflow-hidden`}
        >
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
              {timers.length > 0 && (
                <span className="text-[11.5px] text-black/40">
                  {timers.length} running
                </span>
              )}
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
                          ? "bg-[var(--cook-gold-bg)] border-[var(--cook-orange)] animate-pulse"
                          : "bg-[var(--cook-step-bg)] border-[var(--cook-gold-border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10.5px] uppercase tracking-widest font-bold text-[var(--cook-gold-text)] mb-1 truncate">
                            Step {t.stepIndex + 1} · {t.label}
                          </div>
                          <div className="cook-serif text-[26px] font-semibold tabular-nums leading-none text-[var(--cook-ink)]">
                            {ringing ? "Time's up" : formatClock(remaining)}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-none">
                          <button
                            onClick={() => (t.running ? pauseTimer(t.id) : resumeTimer(t.id))}
                            title={ringing && t.running ? "Stop alarm" : t.running ? "Pause" : "Resume"}
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
                      <span className="block h-1 rounded mt-3 relative bg-[var(--cook-gold-text)]/20">
                        <span
                          className="absolute left-0 top-0 bottom-0 rounded bg-[var(--cook-gold-text)]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      {!ringing && (
                        <div className="flex items-center justify-end mt-2">
                          <button
                            onClick={() => addMinuteToTimer(t.id)}
                            className="text-[11.5px] font-semibold text-[var(--cook-gold-text)]"
                          >
                            +1 min
                          </button>
                        </div>
                      )}
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
          className={`${
            mobileTab === "instructions" ? "flex" : "hidden"
          } md:flex flex-col flex-1 min-h-0 ${
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
                  {steps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveStep(idx)}
                      className={`w-[31px] h-[31px] rounded-full text-[13px] font-bold ${
                        activeStep === idx ? "bg-[var(--cook-green)] text-white" : "bg-black/5 text-black/50 hover:bg-black/10"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
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
                <div ref={focusContentRef} className="flex-1 min-h-0 overflow-hidden flex flex-col max-w-3xl pb-40">
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
              )}
            </>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div
          className={`${
            mobileTab === "instructions" ? "flex" : "hidden"
          } md:flex fixed bottom-0 left-0 right-0 md:left-[360px] lg:left-[392px] items-center justify-between gap-4 px-4 py-5 md:px-7 bg-gradient-to-t from-[var(--cook-step-bg)] via-[var(--cook-step-bg)] to-transparent pointer-events-none z-10`}
        >
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
            Next step
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <ChevronRight size={17} />
            </span>
          </button>
        </div>
      )}

      {confirmingExit && (
        <ConfirmModal
          message={
            timers.length > 0
              ? "Exit cooking mode? Your checklist progress and running timers will be cleared."
              : "Exit cooking mode? Your checklist progress will be cleared."
          }
          confirmLabel="Exit"
          onCancel={() => setConfirmingExit(false)}
          onConfirm={confirmExit}
        />
      )}
    </div>
  );
}
