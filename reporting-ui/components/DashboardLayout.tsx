export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 32,
        background: "linear-gradient(180deg,#EEF5FA 0%,#F4F8FB 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#0B2E4F",
      }}
    >
      {children}
    </div>
  );
}