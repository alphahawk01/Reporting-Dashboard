export default function TopBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#101826] px-8">

      <div>

        <h2 className="text-xl font-semibold text-white">
          Premier Data Platform
        </h2>

      </div>

      <div className="flex items-center gap-3">

        <div className="text-right">

          <div className="text-sm font-medium text-white">
            Andy
          </div>

          <div className="text-xs text-slate-400">
            Administrator
          </div>

        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 font-semibold text-white">
          A
        </div>

      </div>

    </header>
  );
}