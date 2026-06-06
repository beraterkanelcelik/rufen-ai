import type { ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";

function SidebarLink({
  to,
  icon,
  children,
  end,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted hover:bg-white/5 hover:text-foreground"
        }`
      }
    >
      <span className="h-4 w-4">{icon}</span>
      {children}
    </NavLink>
  );
}

const ListIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
  </svg>
);

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2 pt-1">
          <img src="/brand/icon-dark.svg" alt="" className="h-7 w-auto" />
          <span className="text-lg font-semibold tracking-tight text-white">
            Rufen
          </span>
          <span className="text-lg font-light text-muted">× Cara8</span>
        </Link>

        <nav className="flex flex-col gap-1">
          <SidebarLink to="/" icon={ListIcon} end>
            Campaigns
          </SidebarLink>
        </nav>

        <div className="mt-auto px-2 text-xs text-muted">
          AI BEAVERS × Mollie
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-6">
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <img src="/brand/icon-dark.svg" alt="" className="h-6 w-auto" />
            <span className="text-base font-semibold text-white">Rufen × Cara8</span>
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rufen-dot h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm text-muted">Outbound calling campaigns</span>
          </div>
          <Link to="/new">
            <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#fb8634]">
              + New Campaign
            </span>
          </Link>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
