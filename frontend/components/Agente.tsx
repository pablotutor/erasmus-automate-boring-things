"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { fetchMeals, patchMenuMeal } from "../lib/api";

const BASE = "http://localhost:8000";

const WEEK_DAYS = [
  { label: "Lun", value: "mon" },
  { label: "Mar", value: "tue" },
  { label: "Mié", value: "wed" },
  { label: "Jue", value: "thu" },
  { label: "Vie", value: "fri" },
  { label: "Sáb", value: "sat" },
  { label: "Dom", value: "sun" },
];

const ACT_META: Record<string, { label: string; bg: string; color: string }> = {
  calistenia: { label: "Calistenia", bg: "var(--accent-light)", color: "var(--accent)" },
  running:    { label: "Running",    bg: "#EFF6FF",              color: "#1D4ED8"       },
  fútbol:     { label: "Fútbol",     bg: "#F0FDF4",              color: "#15803D"       },
  viaje:      { label: "Viaje",      bg: "#FFFBEB",              color: "#B45309"       },
};

const LOADING_STEPS = [
  "Analizando contexto semanal...",
  "Filtrando platos del catálogo...",
  "Generando menú con IA...",
  "Verificando presupuesto...",
  "Extrayendo ingredientes...",
  "Analizando ofertas de supermercados...",
  "Preparando el resultado...",
];

const DAY_MAP: Record<string, string> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
};

function normalizeMenu(data: Record<string, unknown>): Result {
  if (data.menu && typeof data.menu === "object") {
    data.menu = Object.fromEntries(
      Object.entries(data.menu as Record<string, unknown>).map(([k, v]) => [DAY_MAP[k] ?? k, v])
    );
  }
  return data as unknown as Result;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ShoppingItem { name: string; quantity?: number; unit?: string; }
interface ShoppingList {
  vegetables?: ShoppingItem[];
  proteins?:   ShoppingItem[];
  dairy?:      ShoppingItem[];
  grains?:     ShoppingItem[];
  pantry?:     ShoppingItem[];
  other?:      ShoppingItem[];
}
interface Result {
  menu: Record<string, { breakfast?: string; lunch?: string; dinner?: string }>;
  shopping_list: ShoppingList;
  supermarket?: { recommended: string; reasoning: string };
  budget_summary?: { budget: number; estimated: number; remaining: number };
  created_at?: string;
}
interface Meal { id: number; name: string; meal_types: string[]; tags: string[]; }

const MEAL_TYPE_META = {
  breakfast: { label: "Desayuno", emoji: "🌅", bg: "#FEF3EB", color: "var(--accent)" },
  lunch:     { label: "Comida",   emoji: "☀️",  bg: "#EFF6FF", color: "#1D4ED8"       },
  dinner:    { label: "Cena",     emoji: "🌙",  bg: "#F5F3FF", color: "#7C3AED"       },
} as const;

const TAG_META_POPUP: Record<string, { bg: string; color: string; label: string }> = {
  gym:          { bg: "#FEF3EB", color: "var(--accent)", label: "Gym"        },
  quick:        { bg: "#F0FDF4", color: "#15803D",       label: "Rápido"     },
  cheap:        { bg: "#FFFBEB", color: "#B45309",       label: "Económico"  },
  "batch-cook": { bg: "#EFF6FF", color: "#1D4ED8",       label: "Batch cook" },
  travel:       { bg: "#F5F3FF", color: "#7C3AED",       label: "Viaje"      },
};

// ── Day toggle cell ──────────────────────────────────────────────────────────

function DayToggle({ dayVal, selected, onChange, disabled = [] }: {
  dayVal: string;
  selected: string[];
  onChange: (days: string[]) => void;
  disabled?: string[];
}) {
  const dis = disabled.includes(dayVal);
  const sel = selected.includes(dayVal);
  return (
    <button
      type="button"
      disabled={dis}
      onClick={() => {
        if (dis) return;
        onChange(sel ? selected.filter(x => x !== dayVal) : [...selected, dayVal]);
      }}
      style={{
        height: 26, borderRadius: 4, padding: 0,
        border: sel ? "2px solid var(--accent)" : "1px solid var(--border)",
        background: sel ? "var(--accent-light)" : "#FAFAF7",
        cursor: dis ? "not-allowed" : "pointer",
        opacity: dis ? 0.3 : 1,
        transition: "all 0.1s",
      }}
    />
  );
}

// ── Week calendar ────────────────────────────────────────────────────────────

function WeekCalendar({ menu, activityByDay, allMeals, week, onMealChange }: {
  menu: Result["menu"];
  activityByDay: Record<string, string[]>;
  allMeals: Meal[];
  week: "current" | "next";
  onMealChange: (day: string, mealType: string, mealName: string) => void;
}) {
  const MEAL_ROWS = [
    { key: "breakfast", label: "Desayuno" },
    { key: "lunch",     label: "Comida"   },
    { key: "dinner",    label: "Cena"     },
  ] as const;

  const [editingCell, setEditingCell] = useState<{ day: string; mealType: string } | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ top: number; left: number } | null>(null);
  const [hoveredMeal, setHoveredMeal] = useState<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const POPUP_W = 252;

  useEffect(() => {
    if (!editingCell) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setEditingCell(null);
        setPopupAnchor(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingCell]);

  useEffect(() => {
    document.body.style.overflow = editingCell ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [editingCell]);

  function handleCellClick(e: React.MouseEvent, day: string, mealType: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= POPUP_W + 12 ? rect.right + 8 : rect.left - POPUP_W - 8;
    setPopupAnchor({ top: rect.top, left });
    setEditingCell({ day, mealType });
  }

  function handleSelect(mealName: string) {
    if (!editingCell) return;
    onMealChange(editingCell.day, editingCell.mealType, mealName);
    patchMenuMeal(week, editingCell.day, editingCell.mealType, mealName).catch(console.error);
    setEditingCell(null);
    setPopupAnchor(null);
  }

  const activeMeta = editingCell
    ? MEAL_TYPE_META[editingCell.mealType as keyof typeof MEAL_TYPE_META]
    : null;
  const activeDay = editingCell
    ? WEEK_DAYS.find(d => d.value === editingCell.day)
    : null;
  const filteredMeals = editingCell
    ? allMeals.filter(m => m.meal_types.includes(editingCell.mealType))
    : [];

  return (
    <>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6, minWidth: 620,
        }}>
          {WEEK_DAYS.map(day => {
            const data = menu[day.value] || {};
            const acts = activityByDay[day.value] ?? [];
            return (
              <div key={day.value}>
                <div style={{
                  textAlign: "center", paddingBottom: 8,
                  borderBottom: "2px solid var(--border)", marginBottom: 6,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1C1917", marginBottom: 4 }}>
                    {day.label}
                  </div>
                  {acts.length > 0
                    ? <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 2 }}>
                        {acts.map(a => {
                          const m = ACT_META[a];
                          return (
                            <span key={a} style={{
                              fontSize: 9, fontWeight: 700, padding: "2px 5px",
                              borderRadius: 999, background: m.bg, color: m.color,
                              textTransform: "uppercase", letterSpacing: "0.04em",
                            }}>{m.label}</span>
                          );
                        })}
                      </div>
                    : <span style={{ fontSize: 9, color: "#D1D5DB" }}>descanso</span>
                  }
                </div>

                {MEAL_ROWS.map(mt => {
                  const name = data[mt.key];
                  const isEditing = editingCell?.day === day.value && editingCell?.mealType === mt.key;
                  return (
                    <div key={mt.key} style={{ marginBottom: 4 }}>
                      <div
                        onClick={e => handleCellClick(e, day.value, mt.key)}
                        style={{
                          background: name ? "#fff" : "#FAFAF7",
                          border: `1px solid ${isEditing ? "var(--accent)" : name ? "var(--border)" : "#F3F4F6"}`,
                          borderRadius: 6, padding: 7, minHeight: 66,
                          cursor: "pointer",
                          transition: "border-color 0.15s, box-shadow 0.15s",
                          boxShadow: isEditing ? "0 0 0 3px var(--accent-light)" : "none",
                        }}
                      >
                        <div style={{
                          fontSize: 9, fontWeight: 600, color: "#A8A29E",
                          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
                        }}>{mt.label}</div>
                        {name
                          ? <div style={{ fontSize: 11, color: "#1C1917", lineHeight: 1.45, fontWeight: 500 }}>{name}</div>
                          : <div style={{ fontSize: 11, color: "#D1D5DB", fontStyle: "italic" }}>—</div>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {editingCell && popupAnchor && activeMeta && (
        <div
          ref={popupRef}
          onWheel={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: popupAnchor.top,
            left: popupAnchor.left,
            width: POPUP_W,
            zIndex: 200,
            borderRadius: 12,
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            background: activeMeta.bg,
            padding: "14px 16px 12px",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 18 }}>{activeMeta.emoji}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: activeMeta.color }}>
                  {activeMeta.label}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#78716C", paddingLeft: 2 }}>
                {activeDay?.label} · Cambiar plato
              </div>
            </div>
            <button
              onClick={() => { setEditingCell(null); setPopupAnchor(null); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, color: "#A8A29E", lineHeight: 1, padding: "0 2px",
              }}
            >×</button>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 280, overflowY: "auto", overscrollBehavior: "contain" }}>
            {filteredMeals.length === 0
              ? <div style={{ padding: "20px 16px", textAlign: "center", color: "#A8A29E", fontSize: 12, fontStyle: "italic" }}>
                  Sin platos para este tipo
                </div>
              : filteredMeals.map(m => (
                  <div
                    key={m.id}
                    onMouseEnter={() => setHoveredMeal(m.id)}
                    onMouseLeave={() => setHoveredMeal(null)}
                    onClick={() => handleSelect(m.name)}
                    style={{
                      padding: "9px 14px",
                      cursor: "pointer",
                      background: hoveredMeal === m.id ? activeMeta.bg : "#fff",
                      borderBottom: "1px solid #F3F4F6",
                      transition: "background 0.1s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1C1917", marginBottom: m.tags?.length ? 5 : 0 }}>
                      {m.name}
                    </div>
                    {m.tags?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {m.tags.map(tag => {
                          const tm = TAG_META_POPUP[tag];
                          if (!tm) return null;
                          return (
                            <span key={tag} style={{
                              fontSize: 9, fontWeight: 600, padding: "2px 6px",
                              borderRadius: 999, background: tm.bg, color: tm.color,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>{tm.label}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </>
  );
}

// ── Shopping list ────────────────────────────────────────────────────────────

function ShoppingList({ shoppingList, supermarket, budgetSummary }: {
  shoppingList: ShoppingList;
  supermarket?: { recommended: string; reasoning: string };
  budgetSummary?: { budget: number; estimated: number; remaining: number };
}) {
  const [copied, setCopied] = useState(false);

  const allItems: string[] = Object.values(shoppingList)
    .flat()
    .map((item: ShoppingItem) => {
      if (item.quantity && item.unit) return `${item.name} (${item.quantity}${item.unit})`;
      return item.name;
    })
    .sort((a, b) => a.localeCompare(b, "es"));

  function copy() {
    const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const lines = [
      "LISTA DE LA COMPRA",
      `Semana del ${today}`,
      "",
      ...allItems.map(i => `□  ${i}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#1C1917" }}>
          Lista de la compra
        </h3>
        <button onClick={copy} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 14px", borderRadius: 6,
          border: "1px solid var(--border)",
          background: copied ? "#F0FDF4" : "#FAFAF7",
          color: copied ? "#15803D" : "#78716C",
          fontSize: 12, cursor: "pointer", fontWeight: copied ? 600 : 400,
          transition: "all 0.2s",
        }}>
          {copied ? "✓ Copiado" : "Copiar texto"}
        </button>
      </div>

      {supermarket && (
        <div style={{
          background: "var(--accent-light)", borderRadius: 8,
          padding: "12px 14px", marginBottom: 14,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🛒</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>
              Esta semana ve a {supermarket.recommended}
            </div>
            <div style={{ fontSize: 12, color: "#78716C" }}>{supermarket.reasoning}</div>
          </div>
        </div>
      )}

      {budgetSummary && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {([
            { label: "Presupuesto", value: `€${budgetSummary.budget}`,   green: false },
            { label: "Estimado",    value: `€${budgetSummary.estimated}`, green: false },
            { label: "Ahorro",      value: `€${budgetSummary.remaining}`, green: true  },
          ] as const).map(item => (
            <div key={item.label} style={{
              flex: 1, background: "#FAFAF7", borderRadius: 7, padding: 10, textAlign: "center",
            }}>
              <div style={{ fontSize: 11, color: "#A8A29E", marginBottom: 3 }}>{item.label}</div>
              <div style={{
                fontSize: 17, fontWeight: 700,
                fontFamily: "'DM Serif Display', serif",
                color: item.green ? "#15803D" : "#1C1917",
              }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "5px 24px" }}>
        {allItems.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 13, color: "#1C1917", padding: "3px 0",
          }}>
            <span style={{
              width: 14, height: 14, border: "1.5px solid #D1D5DB",
              borderRadius: 3, flexShrink: 0, display: "inline-block",
            }}></span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty / Loading panels ───────────────────────────────────────────────────

function EmptyPanel() {
  return (
    <div style={{
      background: "#fff", border: "1.5px dashed var(--border)",
      borderRadius: 12, padding: "70px 40px", textAlign: "center", color: "#A8A29E",
    }}>
      <div style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 48, color: "#E8E5E1", marginBottom: 18, lineHeight: 1,
      }}>✦</div>
      <p style={{ fontSize: 14, marginBottom: 5, color: "#78716C" }}>Tu menú aparecerá aquí</p>
      <p style={{ fontSize: 12 }}>Configura la semana y pulsa "Generar menú"</p>
    </div>
  );
}

function LoadingPanel({ step }: { step: string }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid var(--border)",
      borderRadius: 12, padding: "70px 40px", textAlign: "center",
    }}>
      <div style={{
        width: 36, height: 36, margin: "0 auto 22px",
        border: "3px solid var(--accent-light)",
        borderTopColor: "var(--accent)", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}></div>
      <p style={{ fontSize: 14, color: "#78716C", fontStyle: "italic" }}>{step}</p>
    </div>
  );
}

// ── Per-week config ──────────────────────────────────────────────────────────

interface WeekConfig {
  budget: number;
  calisteniaDays: string[];
  runningDays: string[];
  footballDays: string[];
  travelDays: string[];
  notes: string;
}

const defaultConfig = (): WeekConfig => ({
  budget: 50,
  calisteniaDays: [],
  runningDays: [],
  footballDays: [],
  travelDays: [],
  notes: "",
});

// ── Main Agente component ────────────────────────────────────────────────────

export default function Agente() {
  const [configs, setConfigs] = useState<Record<"current" | "next", WeekConfig>>({
    current: defaultConfig(),
    next:    defaultConfig(),
  });
  const [pantry, setPantry]                   = useState("");
  const [loading, setLoading]                 = useState(false);
  const [loadingStep, setLoadingStep]         = useState("");
  const [result, setResult]                   = useState<Result | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [weekTarget, setWeekTarget]           = useState<"current" | "next">("current");
  const [resultWeek, setResultWeek]           = useState<"current" | "next" | null>(null);
  const [nextWeekResult, setNextWeekResult]   = useState<Result | null>(null);
  const [activeView, setActiveView]           = useState<"current" | "next">("current");
  const [adjustText, setAdjustText]           = useState("");
  const [adjustLoading, setAdjustLoading]     = useState(false);
  const [allMeals, setAllMeals]               = useState<Meal[]>([]);

  // Config activa según la pestaña seleccionada
  const cfg = configs[activeView];
  const setCfg = (updates: Partial<WeekConfig>) =>
    setConfigs(prev => ({ ...prev, [activeView]: { ...prev[activeView], ...updates } }));

  const sportDays = Array.from(new Set([...cfg.calisteniaDays, ...cfg.runningDays, ...cfg.footballDays]));

  // Etiquetas de actividad por día: reactivas a la config de la semana activa
  const activityByDay = useMemo(() => {
    const map: Record<string, string[]> = {};
    const push = (day: string, act: string) => { map[day] = map[day] ? [...map[day], act] : [act]; };
    cfg.calisteniaDays.forEach(d => push(d, "calistenia"));
    cfg.runningDays.forEach(d =>    push(d, "running"));
    cfg.footballDays.forEach(d =>   push(d, "fútbol"));
    cfg.travelDays.forEach(d =>     push(d, "viaje"));
    return map;
  }, [cfg.calisteniaDays, cfg.runningDays, cfg.footballDays, cfg.travelDays]);

  // Carga menús de esta semana y la siguiente al montar, y catálogo de platos
  useEffect(() => {
    fetchMeals().then(setAllMeals).catch(console.error);
    Promise.all([
      fetch(`${BASE}/api/menus/current`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${BASE}/api/menus/next`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([cur, nxt]) => {
      if (cur?.menu) {
        setResult(normalizeMenu(cur));
        setLoadedFromCache(true);
        setResultWeek("current");
        // Restaurar configuración guardada al formulario de esta semana
        const ctx = cur.context || {};
        setConfigs(prev => ({
          ...prev,
          current: {
            budget:         cur.budget           ?? prev.current.budget,
            calisteniaDays: ctx.calistenia_days  ?? prev.current.calisteniaDays,
            runningDays:    ctx.running_days     ?? prev.current.runningDays,
            footballDays:   ctx.football_days    ?? prev.current.footballDays,
            travelDays:     ctx.travel_days      ?? prev.current.travelDays,
            notes:          ctx.notes            ?? prev.current.notes,
          },
        }));
      }
      if (nxt?.menu) {
        setNextWeekResult(normalizeMenu(nxt));
        setActiveView("next");
        // Restaurar configuración guardada al formulario de la semana siguiente
        const nctx = nxt.context || {};
        setConfigs(prev => ({
          ...prev,
          next: {
            budget:         nxt.budget           ?? prev.next.budget,
            calisteniaDays: nctx.calistenia_days ?? prev.next.calisteniaDays,
            runningDays:    nctx.running_days    ?? prev.next.runningDays,
            footballDays:   nctx.football_days   ?? prev.next.footballDays,
            travelDays:     nctx.travel_days     ?? prev.next.travelDays,
            notes:          nctx.notes           ?? prev.next.notes,
          },
        }));
      }
    });
  }, []);

  async function generate(e: React.FormEvent, target: "current" | "next" = weekTarget) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setLoadedFromCache(false);
    setError(null);

    // Animate loading steps while awaiting
    let stepIdx = 0;
    setLoadingStep(LOADING_STEPS[0]);
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, LOADING_STEPS.length - 1);
      setLoadingStep(LOADING_STEPS[stepIdx]);
    }, 2500);

    try {
      // Step 1: start
      const startRes = await fetch(`${BASE}/api/generate/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget:          cfg.budget,
          calistenia_days: cfg.calisteniaDays,
          running_days:    cfg.runningDays,
          football_days:   cfg.footballDays,
          travel_days:     cfg.travelDays,
          notes:           cfg.notes.trim() || null,
          week_target: target,
        }),
      });
      if (!startRes.ok) throw new Error(await startRes.text());
      const { thread_id } = await startRes.json();

      // Step 2: resume with pantry
      const resumeRes = await fetch(`${BASE}/api/generate/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id, pantry_raw: pantry.trim() || "" }),
      });
      if (!resumeRes.ok) throw new Error(await resumeRes.text());
      const data = await resumeRes.json();

      const normalized = normalizeMenu(data);
      if (target === "next") {
        setNextWeekResult(normalized);
        setActiveView("next");
      } else {
        setResult(normalized);
      }
      setResultWeek(target);
    } catch (e) {
      setError(String(e));
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
    }
  }

  async function adjust() {
    if (!adjustText.trim() || !nextWeekResult) return;
    setAdjustLoading(true);
    try {
      const res = await fetch(`${BASE}/api/generate/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: nextWeekResult.menu, shopping_list: nextWeekResult.shopping_list, change_request: adjustText, week_target: "next" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNextWeekResult(prev => prev ? {
        ...prev,
        menu: normalizeMenu({ menu: data.menu } as Record<string, unknown>).menu,
        shopping_list: data.shopping_list ?? prev.shopping_list,
      } : prev);
      setAdjustText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setAdjustLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 6,
    padding: "8px 10px", fontSize: 13, outline: "none",
    fontFamily: "'DM Sans', sans-serif", background: "#FAFAF7",
    color: "#1C1917", resize: "vertical",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: "#78716C",
    marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "296px 1fr", gap: 24, alignItems: "start" }}>

      {/* Left: config form */}
      <form onSubmit={generate} style={{
        background: "#fff", border: "1px solid var(--border)",
        borderRadius: 12, padding: 22,
        display: "flex", flexDirection: "column", gap: 18,
        position: "sticky", top: 74,
      }}>
        <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#1C1917" }}>
          {activeView === "next" ? "Semana siguiente" : "Esta semana"}
        </h3>

        {/* Budget */}
        <div>
          <label style={lbl}>
            Presupuesto —{" "}
            <span style={{
              color: "var(--accent)",
              fontFamily: "'DM Serif Display', serif",
              fontSize: 17, textTransform: "none", letterSpacing: 0,
            }}>€{cfg.budget}</span>
          </label>
          <input
            type="range" min={10} max={150} step={5} value={cfg.budget}
            onChange={e => setCfg({ budget: +e.target.value })}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#A8A29E", marginTop: 2 }}>
            <span>€10</span><span>€150</span>
          </div>
        </div>

        {/* Activity grid */}
        <div>
          <label style={lbl}>Actividad</label>
          <div style={{
            display: "grid",
            gridTemplateColumns: "66px repeat(7, 1fr)",
            gap: 3, alignItems: "center",
          }}>
            {/* Header row */}
            <div></div>
            {WEEK_DAYS.map(d => (
              <div key={d.value} style={{
                textAlign: "center", fontSize: 9,
                color: "#A8A29E", fontWeight: 600, paddingBottom: 2,
              }}>{d.label}</div>
            ))}

            {/* Calistenia */}
            <span style={{ fontSize: 11, color: "#78716C" }}>Calistenia</span>
            {WEEK_DAYS.map(d => (
              <DayToggle key={d.value} dayVal={d.value}
                selected={cfg.calisteniaDays} onChange={val => setCfg({ calisteniaDays: val })}
                disabled={cfg.travelDays} />
            ))}

            {/* Running */}
            <span style={{ fontSize: 11, color: "#78716C" }}>Running</span>
            {WEEK_DAYS.map(d => (
              <DayToggle key={d.value} dayVal={d.value}
                selected={cfg.runningDays} onChange={val => setCfg({ runningDays: val })}
                disabled={cfg.travelDays} />
            ))}

            {/* Fútbol */}
            <span style={{ fontSize: 11, color: "#78716C" }}>Fútbol</span>
            {WEEK_DAYS.map(d => (
              <DayToggle key={d.value} dayVal={d.value}
                selected={cfg.footballDays} onChange={val => setCfg({ footballDays: val })}
                disabled={cfg.travelDays} />
            ))}

            {/* Divider */}
            <div style={{ gridColumn: "1 / -1", height: 1, background: "var(--border)", margin: "2px 0" }}></div>

            {/* Viaje */}
            <span style={{ fontSize: 11, color: "#78716C" }}>Viaje</span>
            {WEEK_DAYS.map(d => {
              const dis = sportDays.includes(d.value);
              const sel = cfg.travelDays.includes(d.value);
              return (
                <button key={d.value} type="button" disabled={dis}
                  onClick={() => {
                    const adding = !sel;
                    const nextTravel = adding ? [...cfg.travelDays, d.value] : cfg.travelDays.filter(x => x !== d.value);
                    setCfg({
                      travelDays:     nextTravel,
                      calisteniaDays: adding ? cfg.calisteniaDays.filter(x => x !== d.value) : cfg.calisteniaDays,
                      runningDays:    adding ? cfg.runningDays.filter(x => x !== d.value)    : cfg.runningDays,
                      footballDays:   adding ? cfg.footballDays.filter(x => x !== d.value)   : cfg.footballDays,
                    });
                  }}
                  style={{
                    height: 26, borderRadius: 4, padding: 0,
                    border: sel ? "2px solid #B45309" : "1px solid var(--border)",
                    background: sel ? "#FFFBEB" : "#FAFAF7",
                    cursor: dis ? "not-allowed" : "pointer",
                    opacity: dis ? 0.3 : 1, transition: "all 0.1s",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Pantry */}
        <div>
          <label style={lbl}>Tengo en casa</label>
          <textarea
            value={pantry}
            onChange={e => setPantry(e.target.value)}
            placeholder="sal, aceite, arroz a medias, un bote de tomate..."
            style={{ ...inp, height: 68 } as React.CSSProperties}
          />
        </div>

        {/* Notes */}
        <div>
          <label style={lbl}>
            Notas{" "}
            <span style={{ textTransform: "none", fontWeight: 400, color: "#A8A29E" }}>(opcional)</span>
          </label>
          <textarea
            value={cfg.notes}
            onChange={e => setCfg({ notes: e.target.value })}
            placeholder="sin pescado esta semana..."
            style={{ ...inp, height: 50 } as React.CSSProperties}
          />
        </div>

        {/* Botones según vista activa */}
        {loading ? (
          <button disabled style={{
            padding: 11, borderRadius: 8, border: "none",
            background: "#F3F4F6", color: "#A8A29E",
            fontSize: 14, fontWeight: 600, cursor: "default",
          }}>{loadingStep}</button>
        ) : activeView === "current" && result ? (
          <button
            type="button"
            onClick={() => setActiveView("next")}
            style={{
              padding: 11, borderRadius: 8, border: "none",
              background: "#1C1917", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >→  Planificar semana siguiente</button>
        ) : activeView === "next" && nextWeekResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={lbl}>Cambiar algo del menú</label>
            <textarea
              value={adjustText}
              onChange={e => setAdjustText(e.target.value)}
              placeholder="Ej: el lunes a cenar quiero pollo con patatas"
              style={{ ...inp, height: 60 } as React.CSSProperties}
            />
            <button
              type="button"
              disabled={adjustLoading || !adjustText.trim()}
              onClick={adjust}
              style={{
                padding: 10, borderRadius: 8, border: "none",
                background: adjustLoading || !adjustText.trim() ? "#F3F4F6" : "var(--accent)",
                color: adjustLoading || !adjustText.trim() ? "#A8A29E" : "#fff",
                fontSize: 13, fontWeight: 600,
                cursor: adjustLoading || !adjustText.trim() ? "default" : "pointer",
              }}
            >{adjustLoading ? "Aplicando..." : "Aplicar cambio"}</button>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              type="button"
              onClick={e => generate(e as unknown as React.FormEvent, "next")}
              style={{
                padding: 10, borderRadius: 8,
                border: "1.5px solid var(--border)",
                background: "#FAFAF7", color: "#78716C",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >↺  Regenerar desde 0</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={e => generate(e as unknown as React.FormEvent, activeView)}
            style={{
              padding: 11, borderRadius: 8, border: "none",
              background: "#1C1917", color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >✦  {activeView === "next" ? "Generar semana siguiente" : "Generar menú"}</button>
        )}

        {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
      </form>

      {/* Right: result */}
      <div>
        {/* Selector de semana */}
        {(result || nextWeekResult) && !loading && (
          <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
            {(["current", "next"] as const).map(view => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                style={{
                  padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: activeView === view ? 600 : 400,
                  background: activeView === view ? "#1C1917" : "#F3F4F6",
                  color: activeView === view ? "#fff" : "#78716C",
                  transition: "all 0.15s",
                }}
              >{view === "current" ? "Esta semana" : "Semana siguiente"}</button>
            ))}
          </div>
        )}

        {loading && <LoadingPanel step={loadingStep} />}

        {!loading && activeView === "current" && (
          result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {loadedFromCache && (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "var(--accent-light)", borderRadius: 8, padding: "10px 14px",
                  fontSize: 12, color: "var(--accent)",
                }}>
                  <span>Menú guardado · {result.created_at ? new Date(result.created_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "esta semana"}</span>
                  <button onClick={() => { setResult(null); setLoadedFromCache(false); setResultWeek(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--accent)" }}>×</button>
                </div>
              )}
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#1C1917", marginBottom: 16 }}>Menú semanal</h3>
                <WeekCalendar
                  menu={result.menu}
                  activityByDay={activityByDay}
                  allMeals={allMeals}
                  week="current"
                  onMealChange={(day, mealType, mealName) =>
                    setResult(prev => prev ? {
                      ...prev,
                      menu: { ...prev.menu, [day]: { ...prev.menu[day], [mealType]: mealName } }
                    } : prev)
                  }
                />
              </div>
              <ShoppingList shoppingList={result.shopping_list} supermarket={result.supermarket} budgetSummary={result.budget_summary} />
            </div>
          ) : <EmptyPanel />
        )}

        {!loading && activeView === "next" && (
          nextWeekResult ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{
                background: "var(--accent-light)", borderRadius: 8, padding: "10px 14px",
                fontSize: 12, color: "var(--accent)",
              }}>
                Semana siguiente · {nextWeekResult.created_at ? new Date(nextWeekResult.created_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "próxima semana"}
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#1C1917", marginBottom: 16 }}>Menú semana siguiente</h3>
                <WeekCalendar
                  menu={nextWeekResult.menu}
                  activityByDay={activityByDay}
                  allMeals={allMeals}
                  week="next"
                  onMealChange={(day, mealType, mealName) =>
                    setNextWeekResult(prev => prev ? {
                      ...prev,
                      menu: { ...prev.menu, [day]: { ...prev.menu[day], [mealType]: mealName } }
                    } : prev)
                  }
                />
              </div>
              <ShoppingList shoppingList={nextWeekResult.shopping_list} supermarket={nextWeekResult.supermarket} budgetSummary={nextWeekResult.budget_summary} />
            </div>
          ) : (
            <div style={{
              background: "#fff", border: "1.5px dashed var(--border)",
              borderRadius: 12, padding: "70px 40px", textAlign: "center", color: "#A8A29E",
            }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, color: "#E8E5E1", marginBottom: 18 }}>✦</div>
              <p style={{ fontSize: 14, marginBottom: 5, color: "#78716C" }}>No hay menú para la semana siguiente</p>
              <p style={{ fontSize: 12 }}>Configura la semana y pulsa "Generar semana siguiente"</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
