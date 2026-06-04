"use client";

import { useState } from "react";
import MisPlatos from "@/components/MisPlatos";
import Ofertas from "@/components/Ofertas";
import Agente from "@/components/Agente";

const TABS = [
  { id: "platos",  label: "Mis platos" },
  { id: "ofertas", label: "Ofertas"    },
  { id: "agente",  label: "Agente"     },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("platos");

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header style={{
        background: "#fff",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          padding: "0 28px", height: 54,
          display: "flex", alignItems: "center", gap: 36,
        }}>
          <div style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 20, color: "var(--text)",
            letterSpacing: "-0.01em", flexShrink: 0,
          }}>
            Erasmus{" "}
            <span style={{ color: "var(--accent)" }}>✦</span>
          </div>

          <nav style={{ display: "flex", height: "100%" }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  height: "100%", padding: "0 18px",
                  border: "none", background: "none", cursor: "pointer",
                  fontSize: 14,
                  fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? "var(--text)" : "var(--text-muted)",
                  borderBottom: tab === t.id
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >{t.label}</button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 28px" }}>
        {tab === "platos"  && <MisPlatos />}
        {tab === "ofertas" && <Ofertas   />}
        {tab === "agente"  && <Agente    />}
      </main>
    </div>
  );
}
