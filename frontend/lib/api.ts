const BASE = "http://localhost:8000";

export interface GeneratePayload {
  budget: number;
  calistenia_days: string[];
  running_days: string[];
  football_days: string[];
  travel_days: string[];
  notes: string | null;
}

export async function startGeneration(payload: GeneratePayload) {
  const res = await fetch(`${BASE}/api/generate/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ thread_id: string; question: string }>;
}

export async function resumeGeneration(threadId: string, pantryRaw: string) {
  const res = await fetch(`${BASE}/api/generate/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, pantry_raw: pantryRaw }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadDeals(supermarket: string, text: string) {
  const body = new FormData();
  body.append("supermarket", supermarket);
  body.append("text", text);
  const res = await fetch(`${BASE}/api/deals/upload`, { method: "POST", body });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDeals() {
  const res = await fetch(`${BASE}/api/deals`);
  return res.json() as Promise<Record<string, string>>;
}

export async function clearDeals() {
  await fetch(`${BASE}/api/deals`, { method: "DELETE" });
}

export async function checkHealth() {
  const res = await fetch(`${BASE}/api/health`);
  return res.json() as Promise<{ status: string }>;
}
