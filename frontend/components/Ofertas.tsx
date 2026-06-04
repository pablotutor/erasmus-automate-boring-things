"use client";

import { useState, useRef } from "react";

const BASE = "http://localhost:8000";

const SUPERS = [
  { id: "billa", name: "Billa", type: "scrape" as const },
  { id: "hofer", name: "Hofer", type: "scrape" as const },
  { id: "penny", name: "Penny", type: "pdf"    as const },
  { id: "spar",  name: "Spar",  type: "pdf"    as const },
];

type Status = { type: "ok" | "error" | "loading"; msg: string };

function SuperCard({ s }: { s: typeof SUPERS[number] }) {
  const [status, setStatus]       = useState<Status | null>(null);
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleScrape() {
    setLoading(true);
    setStatus({ type: "loading", msg: "Scrapeando..." });
    try {
      const res = await fetch(`${BASE}/api/deals/scrape/${s.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus({ type: "ok", msg: `${data.products_found} productos encontrados` });
      setUpdatedAt(new Date());
    } catch (e) {
      setStatus({ type: "error", msg: `Error: ${e}` });
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload() {
    if (!pdfFile) return;
    setLoading(true);
    setStatus({ type: "loading", msg: "Leyendo PDF..." });
    const body = new FormData();
    body.append("file", pdfFile);
    try {
      const res = await fetch(`${BASE}/api/deals/upload-pdf/${s.id}`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus({ type: "ok", msg: `${data.chars_extracted} caracteres extraídos` });
      setUpdatedAt(new Date());
      setPdfFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setStatus({ type: "error", msg: `Error: ${e}` });
    } finally {
      setLoading(false);
    }
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div style={{
      background: "#fff", border: "1px solid var(--border)",
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Image placeholder */}
      <div style={{
        width: "100%", height: 140, background: "#F3F4F6",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 36, opacity: 0.25 }}>🏪</span>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h3 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 22, color: "#1C1917",
          }}>{s.name}</h3>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {updatedAt
              ? <span style={{ fontSize: 11, color: "#A8A29E" }}>{fmtDate(updatedAt)}</span>
              : <span style={{ fontSize: 11, color: "#D1D5DB" }}>Sin datos</span>
            }
            <span style={{ fontSize: 10, color: "#A8A29E", background: "#F3F4F6", padding: "1px 7px", borderRadius: 999 }}>
              {s.type === "scrape" ? "Scraping automático" : "Subida de PDF"}
            </span>
          </div>
        </div>

        {status && (
          <p style={{
            fontSize: 12, marginBottom: 10,
            color: status.type === "ok" ? "#15803D" : status.type === "error" ? "#DC2626" : "#78716C",
          }}>
            {status.type === "ok" && "✓ "}{status.msg}
          </p>
        )}

        {s.type === "scrape" ? (
          <button
            onClick={handleScrape}
            disabled={loading}
            style={{
              width: "100%", padding: 9, borderRadius: 7, border: "none",
              background: loading ? "#F3F4F6" : "#1C1917",
              color: loading ? "#A8A29E" : "#fff",
              fontSize: 13, fontWeight: 500,
              cursor: loading ? "default" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Actualizando..." : "↻  Actualizar ofertas"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: 9, borderRadius: 7, cursor: "pointer",
              border: `1.5px dashed ${pdfFile ? "#15803D" : "var(--border)"}`,
              background: pdfFile ? "#F0FDF4" : "#FAFAF7",
              color: pdfFile ? "#15803D" : "#78716C",
              fontSize: 13, transition: "all 0.15s",
            }}>
              {pdfFile ? `📄 ${pdfFile.name}` : "+ Seleccionar folleto PDF"}
              <input
                ref={fileRef}
                type="file" accept=".pdf"
                style={{ display: "none" }}
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {pdfFile && (
              <button
                onClick={handlePdfUpload}
                disabled={loading}
                style={{
                  width: "100%", padding: 9, borderRadius: 7, border: "none",
                  background: loading ? "#F3F4F6" : "var(--accent)",
                  color: loading ? "#A8A29E" : "#fff",
                  fontSize: 13, fontWeight: 500,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading ? "Procesando..." : "Subir PDF"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Ofertas() {
  async function handleClearAll() {
    if (!window.confirm("¿Limpiar todas las ofertas de esta semana?")) return;
    await fetch(`${BASE}/api/deals`, { method: "DELETE" });
  }

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 24, gap: 16,
      }}>
        <p style={{ fontSize: 14, color: "#78716C", lineHeight: 1.6, maxWidth: 520 }}>
          Actualiza los folletos de la semana antes de generar el menú. El agente analizará las
          ofertas y recomendará en qué supermercado hacer la compra.
        </p>
        <button
          onClick={handleClearAll}
          style={{
            flexShrink: 0, fontSize: 12, color: "#A8A29E",
            background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
          }}
        >Limpiar semana</button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16, maxWidth: 680,
      }}>
        {SUPERS.map(s => <SuperCard key={s.id} s={s} />)}
      </div>
    </div>
  );
}
