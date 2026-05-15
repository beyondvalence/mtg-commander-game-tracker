export default function DashboardPage() {
  return (
    <section className="wireframe-shell">
      <div className="space-y-6">
        <h1 className="wireframe-title">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-400 p-4 bg-white">
            <p className="text-lg font-semibold text-zinc-800">Total Games</p>
            <p className="text-4xl font-bold text-zinc-900">0</p>
          </div>
          <div className="rounded-lg border border-zinc-400 p-4 bg-white">
            <p className="text-lg font-semibold text-zinc-800">Commanders</p>
            <p className="text-4xl font-bold text-zinc-900">0</p>
          </div>
        </div>
        <p className="wireframe-copy text-zinc-700">Welcome! Start by adding a game to track your MTG Commander sessions.</p>
      </div>
    </section>
  );
}
