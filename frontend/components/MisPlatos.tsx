"use client";

import { useState, useEffect, useRef } from "react";

const BASE = "http://localhost:8000";

interface Meal {
  id: number;
  name: string;
  meal_types: string[];
  ingredients: string[];
  tags: string[];
  prep_time: number | null;
  description: string | null;
  image_url: string | null;
}

const TAG_META: Record<string, { label: string; bg: string; color: string }> = {
  gym:           { label: "gym",      bg: "#FEF3EB", color: "#C2500E" },
  quick:         { label: "rápido",   bg: "#EFF6FF", color: "#1D4ED8" },
  cheap:         { label: "barato",   bg: "#F0FDF4", color: "#15803D" },
  "batch-cook":  { label: "batch",    bg: "#F5F3FF", color: "#6D28D9" },
  travel:        { label: "viaje",    bg: "#FFFBEB", color: "#B45309" },
};

const TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
  breakfast: { label: "Desayuno", bg: "#FFFBEB",             color: "#92400E"       },
  lunch:     { label: "Comida",   bg: "var(--accent-light)", color: "var(--accent)" },
  dinner:    { label: "Cena",     bg: "#F5F3FF",             color: "#6D28D9"       },
};

const MEAL_EMOJI: Record<string, string> = {
  breakfast: "☀️",
  lunch:     "🍽️",
  dinner:    "🌙",
};

function TagPill({ tag }: { tag: string }) {
  const m = TAG_META[tag] || { label: tag, bg: "#F3F4F6", color: "#374151" };
  return (
    <span style={{
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999,
      display: "inline-block",
    }}>{m.label}</span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] || { label: type, bg: "#F3F4F6", color: "#374151" };
  return (
    <span style={{
      background: m.bg, color: m.color,
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{m.label}</span>
  );
}

// ── Meal Card ────────────────────────────────────────────────────────────────

function MealCard({ meal, onDelete, onEdit }: {
  meal: Meal;
  onDelete: (id: number) => void;
  onEdit: (meal: Meal) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: "#fff", border: "1px solid var(--border)",
        borderRadius: 10, overflow: "hidden",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.2s, transform 0.2s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div style={{ width: "100%", height: 152, position: "relative", background: "#F3F4F6" }}>
        {meal.image_url ? (
          <img
            src={`${BASE}${meal.image_url}`}
            alt={meal.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 36, opacity: 0.25 }}>{MEAL_EMOJI[meal.meal_types[0]] ?? "🍴"}</span>
          </div>
        )}
        <div style={{ position: "absolute", bottom: 8, left: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {meal.meal_types.map(t => <TypeBadge key={t} type={t} />)}
        </div>
      </div>

      <div style={{ padding: "14px 14px 12px" }}>
        <h3 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 16, lineHeight: 1.3, color: "#1C1917", marginBottom: 5,
        }}>{meal.name}</h3>

        {meal.description && (
          <p style={{ fontSize: 12, color: "#78716C", lineHeight: 1.55, marginBottom: 10 }}>
            {meal.description}
          </p>
        )}

        {meal.prep_time && (
          <div style={{ fontSize: 12, color: "#A8A29E", marginBottom: 10 }}>
            ⏱ {meal.prep_time} min
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {meal.tags.map(t => <TagPill key={t} tag={t} />)}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            fontSize: 12, color: "var(--accent)", background: "none",
            border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          <span style={{
            display: "inline-block", transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: 9,
          }}>▶</span>
          {meal.ingredients.length} ingredientes
        </button>

        {expanded && (
          <div style={{
            marginTop: 8, fontSize: 12, color: "#78716C", lineHeight: 1.7,
            paddingLeft: 10, borderLeft: "2px solid var(--accent-light)",
          }}>
            {meal.ingredients.join(" · ")}
          </div>
        )}

        {/* Action buttons — visible on hover */}
        <div style={{
          display: "flex", gap: 6, marginTop: 12,
          opacity: hovered ? 1 : 0, transition: "opacity 0.2s",
        }}>
          <button
            onClick={() => onEdit(meal)}
            style={{
              flex: 1, padding: "5px 0",
              border: "1px solid var(--border)", borderRadius: 5, background: "none",
              color: "#78716C", fontSize: 11, cursor: "pointer",
            }}
          >✏️ Editar</button>
          <button
            onClick={() => onDelete(meal.id)}
            style={{
              flex: 1, padding: "5px 0",
              border: "1px solid var(--border)", borderRadius: 5, background: "none",
              color: "#A8A29E", fontSize: 11, cursor: "pointer",
            }}
          >Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ── Meal Form Modal (shared for Add + Edit) ───────────────────────────────────

interface FormState {
  name: string;
  meal_types: string[];
  ingredients: string;
  tags: string[];
  prep_time: string;
  description: string;
}

function MealFormModal({ initial, onClose, onSave }: {
  initial?: Meal;
  onClose: () => void;
  onSave: (meal: Meal) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<FormState>({
    name:        initial?.name        ?? "",
    meal_types:  initial?.meal_types  ?? ["lunch"],
    ingredients: initial?.ingredients?.join(", ") ?? "",
    tags:        initial?.tags        ?? [],
    prep_time:   initial?.prep_time != null ? String(initial.prep_time) : "",
    description: initial?.description ?? "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    initial?.image_url ? `${BASE}${initial.image_url}` : null
  );
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(initial?.image_url ?? null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleTag = (t: string) => setForm(f => ({
    ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
  }));

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setGeneratedImageUrl(null);
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  async function handleGenerateImage() {
    if (!form.name.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/meals/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          ingredients: form.ingredients.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { image_url } = await res.json();
      setImagePreview(`${BASE}${image_url}`);
      setGeneratedImageUrl(image_url);
      setImageFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    setError(null);

    const payload = {
      name:        form.name.trim(),
      meal_types:  form.meal_types,
      ingredients: form.ingredients.split(",").map(s => s.trim()).filter(Boolean),
      tags:        form.tags,
      prep_time:   parseInt(form.prep_time) || null,
      description: form.description.trim() || null,
      image_url:   generatedImageUrl ?? initial?.image_url ?? null,
    };

    try {
      // Step 1: create or update the meal JSON
      const url    = isEdit ? `${BASE}/api/meals/${initial!.id}` : `${BASE}/api/meals`;
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      let meal: Meal = await res.json();

      // Step 2: upload image if selected
      if (imageFile) {
        const form = new FormData();
        form.append("file", imageFile);
        const imgRes = await fetch(`${BASE}/api/meals/${meal.id}/image`, {
          method: "POST",
          body: form,
        });
        if (imgRes.ok) {
          meal = await imgRes.json();
        }
      }

      onSave(meal);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 6,
    padding: "9px 12px", fontSize: 14, outline: "none",
    fontFamily: "'DM Sans', sans-serif", background: "#FAFAF7", color: "#1C1917",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: "#78716C",
    marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 460,
        padding: 28, boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#1C1917" }}>
            {isEdit ? "Editar plato" : "Nuevo plato"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#A8A29E", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Image upload */}
          <div>
            <label style={lbl}>Foto</label>
            <label style={{
              display: "block", cursor: "pointer",
              border: "1.5px dashed var(--border)", borderRadius: 8,
              overflow: "hidden", height: 120, position: "relative",
              background: "#FAFAF7",
            }}>
              {imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 24, opacity: 0.3 }}>📷</span>
                  <span style={{ fontSize: 12, color: "#A8A29E" }}>Clic para subir foto</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
            </label>
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={!form.name.trim() || generating}
              style={{
                marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 6,
                border: "1px solid var(--border)", background: "#FAFAF7",
                color: "#78716C", fontSize: 13, cursor: (!form.name.trim() || generating) ? "default" : "pointer",
                opacity: (!form.name.trim() || generating) ? 0.5 : 1,
              }}
            >
              {generating ? "Generando..." : "✨ Generar con IA"}
            </button>
          </div>

          <div>
            <label style={lbl}>Nombre *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Pollo con arroz" required />
          </div>

          <div>
            <label style={lbl}>Tipo <span style={{ textTransform: "none", fontWeight: 400 }}>(selecciona uno o varios)</span></label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["breakfast", "lunch", "dinner"] as const).map(t => {
                const sel = form.meal_types.includes(t);
                return (
                  <button key={t} type="button" onClick={() => setForm(f => ({
                    ...f,
                    meal_types: sel
                      ? f.meal_types.filter(x => x !== t)
                      : [...f.meal_types, t],
                  }))} style={{
                    flex: 1, padding: "8px 4px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                    border: sel ? "2px solid var(--accent)" : "1px solid var(--border)",
                    background: sel ? "var(--accent-light)" : "#FAFAF7",
                    color: sel ? "var(--accent)" : "#78716C",
                    fontWeight: sel ? 600 : 400,
                  }}>{TYPE_META[t].label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={lbl}>Descripción</label>
            <input style={inp} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Ej: Clásico post-gym" />
          </div>

          <div>
            <label style={lbl}>Ingredientes <span style={{ textTransform: "none", fontWeight: 400 }}>(separados por coma)</span></label>
            <input style={inp} value={form.ingredients} onChange={e => set("ingredients", e.target.value)} placeholder="pollo, arroz, aceite de oliva" />
          </div>

          <div>
            <label style={lbl}>Tiempo preparación (min)</label>
            <input
              style={{ ...inp, width: 100 }}
              type="number"
              value={form.prep_time}
              onChange={e => set("prep_time", e.target.value)}
              placeholder="20" min={1} max={180}
            />
          </div>

          <div>
            <label style={lbl}>Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(TAG_META).map(([tag, cfg]) => {
                const sel = form.tags.includes(tag);
                return (
                  <button key={tag} type="button" onClick={() => toggleTag(tag)} style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                    border: sel ? `2px solid ${cfg.color}` : "1px solid var(--border)",
                    background: sel ? cfg.bg : "#FAFAF7",
                    color: sel ? cfg.color : "#78716C",
                    fontWeight: sel ? 600 : 400,
                  }}>{cfg.label}</button>
                );
              })}
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", padding: "8px 12px", borderRadius: 6 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: 10, borderRadius: 7,
              border: "1px solid var(--border)", background: "#FAFAF7",
              color: "#78716C", fontSize: 13, cursor: "pointer",
            }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{
              flex: 2, padding: 10, borderRadius: 7, border: "none",
              background: "var(--accent)", color: "#fff", fontSize: 13,
              fontWeight: 600, cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}>{loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Añadir plato"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main MisPlatos ────────────────────────────────────────────────────────────

const FILTERS = [
  { value: "all",       label: "Todos"    },
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch",     label: "Comida"   },
  { value: "dinner",    label: "Cena"     },
] as const;

export default function MisPlatos() {
  const [meals, setMeals]   = useState<Meal[]>([]);
  const [filter, setFilter] = useState<"all" | "breakfast" | "lunch" | "dinner">("all");
  const [modal, setModal]   = useState<"add" | Meal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/meals`)
      .then(r => r.json())
      .then(data => setMeals(Array.isArray(data) ? data : []))
      .catch(() => setMeals([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? meals : meals.filter(m => m.meal_types.includes(filter));
  const counts = {
    all:       meals.length,
    breakfast: meals.filter(m => m.meal_types.includes("breakfast")).length,
    lunch:     meals.filter(m => m.meal_types.includes("lunch")).length,
    dinner:    meals.filter(m => m.meal_types.includes("dinner")).length,
  };

  async function handleDelete(id: number) {
    await fetch(`${BASE}/api/meals/${id}`, { method: "DELETE" });
    setMeals(ms => ms.filter(m => m.id !== id));
  }

  function handleSave(saved: Meal) {
    setMeals(ms => {
      const idx = ms.findIndex(m => m.id === saved.id);
      if (idx >= 0) {
        const updated = [...ms];
        updated[idx] = saved;
        return updated;
      }
      return [...ms, saved];
    });
  }

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 22, flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
              border: filter === f.value ? "1.5px solid var(--accent)" : "1px solid var(--border)",
              background: filter === f.value ? "var(--accent-light)" : "#fff",
              color: filter === f.value ? "var(--accent)" : "#78716C",
              fontWeight: filter === f.value ? 600 : 400,
            }}>
              {f.label}
              <span style={{
                fontSize: 11, minWidth: 18, textAlign: "center",
                background: filter === f.value ? "var(--accent)" : "#E8E5E1",
                color: filter === f.value ? "#fff" : "#78716C",
                borderRadius: 999, padding: "0 5px",
              }}>{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setModal("add")} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 8, border: "none",
          background: "var(--accent)", color: "#fff", fontSize: 13,
          fontWeight: 600, cursor: "pointer",
        }}>+ Añadir plato</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#A8A29E" }}>Cargando platos...</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}>
          {filtered.map(m => (
            <MealCard
              key={m.id}
              meal={m}
              onDelete={handleDelete}
              onEdit={meal => setModal(meal)}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#A8A29E" }}>
          <p style={{ marginBottom: 12, fontSize: 15 }}>No hay platos en esta categoría.</p>
          <button onClick={() => setModal("add")} style={{
            color: "var(--accent)", background: "none",
            border: "none", cursor: "pointer", fontSize: 14,
          }}>+ Añadir el primero</button>
        </div>
      )}

      {modal && (
        <MealFormModal
          initial={modal === "add" ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
