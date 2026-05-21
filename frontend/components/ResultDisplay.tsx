"use client";

interface Props {
  result: unknown;
}

export default function ResultDisplay({ result }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Resultado</h2>
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
          className="text-xs border px-2 py-1 rounded hover:bg-gray-100"
        >
          Copiar JSON
        </button>
      </div>
      <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-[60vh] whitespace-pre-wrap">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
