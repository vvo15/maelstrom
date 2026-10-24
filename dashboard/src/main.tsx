// Dashboard placeholder — Stage will build the full implementation.
import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Siren Dashboard</h1>
      <p>Placeholder — connecting to gateway on ws://localhost:8090…</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
