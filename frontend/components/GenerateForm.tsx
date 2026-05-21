"use client";

import { useState } from "react";
import { startGeneration } from "@/lib/api";

const DAYS = [
  { label: "Lu", value: "mon" },
  { label: "Ma", value: "tue" },
  { label: "Mi", value: "wed" },
  { label: "Ju", value: "thu" },
  { label: "Vi", value: "fri" },
  { label: "Sa", value: "sat" },
  { label: "Do", value: "sun" },
];

interface Props {
  onStarted: (threadId: string, question: string) => void;
}

function DayCheckboxes({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (days: string[]) => void;
  disabled?: string[];
}) {
  function toggle(day: string) {
    if (selected.includes(day)) {
      onChange(selected.filter((d) => d !== day));
    } else {
      onChange([...selected, day]);
    }
  }

  return (
    <div className="flex gap-1">
      {DAYS.map(({ label, value }) => {
        const isDisabled = disabled?.includes(value);
        const isSelected = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && toggle(value)}
            className={`w-9 h-9 rounded text-xs font-medium transition-colors
              ${isDisabled ? "opacity-30 cursor-not-allowed bg-gray-100 text-gray-400" : ""}
              ${isSelected && !isDisabled ? "bg-blue-600 text-white" : ""}
              ${!isSelected && !isDisabled ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : ""}
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function GenerateForm({ onStarted }: Props) {
  const [budget, setBudget] = useState(50);
  const [calisteniaDay, setCalisteniaDay] = useState<string[]>([]);
  const [runningDays, setRunningDays] = useState<string[]>([]);
  const [footballDays, setFootballDays] = useState<string[]>([]);
  const [travelDays, setTravelDays] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un día no puede ser deporte y viaje a la vez
  const sportDays = [...new Set([...calisteniaDay, ...runningDays, ...footballDays])];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await startGeneration({
        budget,
        calistenia_days: calisteniaDay,
        running_days: runningDays,
        football_days: footballDays,
        travel_days: travelDays,
        notes: notes.trim() || null,
      });
      onStarted(data.thread_id, data.question);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Presupuesto */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Presupuesto semanal — <span className="text-blue-600 font-bold">€{budget}</span>
        </label>
        <input
          type="range"
          min={10}
          max={200}
          step={5}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>€10</span><span>€200</span>
        </div>
      </div>

      {/* Deporte */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Deporte esta semana</p>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Calistenia</label>
          <DayCheckboxes
            selected={calisteniaDay}
            onChange={setCalisteniaDay}
            disabled={travelDays}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Running</label>
          <DayCheckboxes
            selected={runningDays}
            onChange={setRunningDays}
            disabled={travelDays}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Fútbol</label>
          <DayCheckboxes
            selected={footballDays}
            onChange={setFootballDays}
            disabled={travelDays}
          />
        </div>
      </div>

      {/* Viaje */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Días de viaje</p>
        <p className="text-xs text-gray-400">Estos días no hay comida en casa</p>
        <DayCheckboxes
          selected={travelDays}
          onChange={(days) => {
            setTravelDays(days);
            // Quitar días de viaje de los días de deporte
            setCalisteniaDay((prev) => prev.filter((d) => !days.includes(d)));
            setRunningDays((prev) => prev.filter((d) => !days.includes(d)));
            setFootballDays((prev) => prev.filter((d) => !days.includes(d)));
          }}
          disabled={sportDays}
        />
      </div>

      {/* Notas */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Notas adicionales <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={300}
          placeholder="Ej: esta semana quiero algo fácil de cocinar, sin pescado..."
          className="w-full border rounded p-2 text-sm h-16 resize-none"
        />
        <p className="text-right text-xs text-gray-400">{notes.length}/300</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? "Generando..." : "Generar menú"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
