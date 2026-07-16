// components/ui/Card.tsx
import { ReactNode } from "react";
import { THEME } from "@/lib/theme";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
      }}
      className="rounded-xl p-4 shadow-lg backdrop-blur-md"
    >
      {children}
    </div>
  );
}