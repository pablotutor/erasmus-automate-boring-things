"use client";

import { useState } from "react";

const BASE = "http://localhost:8000";

const SCRAPEABLE = ["billa", "hofer"] as const;
const PDF_SUPERS = ["penny", "spar"] as const;
type PdfSuper = typeof PDF_SUPERS[number];

type Status = { type: "ok" | "error" | "loading"; msg: string };

function StatusBadge({ status }: { status: Status | null }) {
  if (!status) return null;
  const colors = { ok: "text-green-600", error: "text-red-600", loading: "text-gray-500" };
  return <p className={`text-xs mt-1 ${colors[status.type]}`}>{status.msg}</p>;
}

export default function DealsUpload() {
  const [statuses, setStatuses] = useState<Partial<Record<string, Status>>>({});
  const [pdfFiles, setPdfFiles] = useState<Partial<Record<PdfSuper, File>>>({});

  function setStatus(key: string, s: Status) {
    setStatuses((prev) => ({ ...prev, [key]: s }));
  }

  async function handleScrape(supermarket: string) {
    setStatus(supermarket, { type: "loading", msg: "Scrapeando..." });
    try {
      const res = await fetch(`${BASE}/api/deals/scrape/${supermarket}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus(supermarket, { type: "ok", msg: `✓ ${data.products_found} productos` });
    } catch (e) {
      setStatus(supermarket, { type: "error", msg: `Error: ${e}` });
    }
  }

  async function handlePdfUpload(supermarket: PdfSuper) {
    const file = pdfFiles[supermarket];
    if (!file) return;
    setStatus(supermarket, { type: "loading", msg: "Leyendo PDF..." });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`${BASE}/api/deals/upload-pdf/${supermarket}`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStatus(supermarket, { type: "ok", msg: `✓ ${data.chars_extracted} caracteres extraídos` });
      setPdfFiles((prev) => ({ ...prev, [supermarket]: undefined }));
    } catch (e) {
      setStatus(supermarket, { type: "error", msg: `Error: ${e}` });
    }
  }

  async function handleClearAll() {
    await fetch(`${BASE}/api/deals`, { method: "DELETE" });
    setStatuses({});
    setPdfFiles({});
  }

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-500">
          Ofertas esta semana
        </h2>
        <button
          onClick={handleClearAll}
          className="text-xs text-gray-400 hover:text-red-500 underline"
        >
          Limpiar todo
        </button>
      </div>

      {/* Scraping automático: Billa y Hofer */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Automático</p>
        {SCRAPEABLE.map((s) => (
          <div key={s}>
            <button
              onClick={() => handleScrape(s)}
              disabled={statuses[s]?.type === "loading"}
              className="w-full flex justify-between items-center border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="capitalize font-medium">{s}</span>
              <span className="text-gray-400 text-xs">
                {statuses[s]?.type === "loading" ? "..." : "Actualizar →"}
              </span>
            </button>
            <StatusBadge status={statuses[s] ?? null} />
          </div>
        ))}
      </div>

      {/* PDF: Penny y Spar */}
      <div className="space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Subir folleto PDF</p>
        {PDF_SUPERS.map((s) => (
          <div key={s} className="space-y-1">
            <label className="flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
              <span className="font-medium capitalize w-10">{s}</span>
              <span className="text-gray-500 text-xs truncate">
                {pdfFiles[s] ? pdfFiles[s]!.name : "Seleccionar PDF..."}
              </span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPdfFiles((prev) => ({ ...prev, [s]: file }));
                }}
              />
            </label>
            {pdfFiles[s] && (
              <button
                onClick={() => handlePdfUpload(s)}
                disabled={statuses[s]?.type === "loading"}
                className="w-full bg-gray-800 text-white py-1.5 rounded text-xs hover:bg-gray-900 disabled:opacity-50"
              >
                {statuses[s]?.type === "loading" ? "Procesando..." : `Subir PDF de ${s}`}
              </button>
            )}
            <StatusBadge status={statuses[s] ?? null} />
          </div>
        ))}
      </div>
    </div>
  );
}
