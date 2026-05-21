"use client";

import { useState } from "react";
import { resumeGeneration } from "@/lib/api";

interface Props {
  threadId: string;
  question: string;
  onResult: (result: unknown) => void;
}

export default function PantryStep({ threadId, question, onResult }: Props) {
  const [pantry, setPantry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await resumeGeneration(threadId, pantry);
      onResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-medium">{question}</p>
      <textarea
        value={pantry}
        onChange={(e) => setPantry(e.target.value)}
        placeholder='Ej: "tengo sal, aceite, unos huevos y arroz"'
        className="w-full border rounded p-3 text-sm h-24 resize-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
      >
        {loading ? "Procesando... (puede tardar unos minutos)" : "Continuar"}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
