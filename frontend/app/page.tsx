"use client";

import { useState } from "react";
import GenerateForm from "@/components/GenerateForm";
import PantryStep from "@/components/PantryStep";
import ResultDisplay from "@/components/ResultDisplay";
import DealsUpload from "@/components/DealsUpload";

type Step = "form" | "pantry" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("form");
  const [threadId, setThreadId] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<unknown>(null);

  function handleStarted(tid: string, q: string) {
    setThreadId(tid);
    setQuestion(q);
    setStep("pantry");
  }

  function handleResult(r: unknown) {
    setResult(r);
    setStep("result");
  }

  function reset() {
    setStep("form");
    setThreadId("");
    setResult(null);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Meal Planner</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="md:col-span-2 bg-white border rounded-lg p-6 space-y-4">
          {step === "form" && (
            <GenerateForm onStarted={handleStarted} />
          )}

          {step === "pantry" && (
            <PantryStep
              threadId={threadId}
              question={question}
              onResult={handleResult}
            />
          )}

          {step === "result" && (
            <>
              <ResultDisplay result={result} />
              <button
                onClick={reset}
                className="text-sm text-blue-600 underline"
              >
                Generar otro menú
              </button>
            </>
          )}
        </div>

        {/* Sidebar: ofertas */}
        <div className="space-y-4">
          <DealsUpload />
          <div className="border rounded-lg p-4 bg-white text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-700">Instrucciones</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Sube los textos de los folletos (opcional)</li>
              <li>Escribe el contexto de la semana</li>
              <li>Responde qué tienes en casa</li>
              <li>Espera el resultado (~1-2 min con Ollama)</li>
            </ol>
          </div>
        </div>
      </div>
    </main>
  );
}
