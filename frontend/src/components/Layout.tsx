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
            ? "bg-[#F97316]/15 text-[#F97316]"
            : "text-[#8a8a8a] hover:bg-white/5 hover:text-[#e0e0e0]"
        }`
      }
    >
      <span className="h-4 w-4">{icon}</span>
      {children}
    </NavLink>
  );
}

const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const ListIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
  </svg>
);

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#212121] bg-[#0d0d0d] p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2 pt-1">
          <span className="rufen-dot h-2.5 w-2.5 rounded-full bg-[#F97316]" />
          <span className="text-lg font-semibold tracking-tight text-white">
            Rufen
          </span>
          <span className="text-lg font-light text-[#8a8a8a]">Campaign</span>
        </Link>

        <nav className="flex flex-col gap-1">
          <SidebarLink to="/new" icon={PlusIcon}>
            New Campaign
          </SidebarLink>
          <SidebarLink to="/" icon={ListIcon} end>
            Campaigns
          </SidebarLink>
        </nav>

        <div className="mt-auto px-2 text-xs text-[#8a8a8a]">
          AI BEAVERS × Mollie
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#212121] bg-[#0d0d0d] px-6">
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <span className="rufen-dot h-2.5 w-2.5 rounded-full bg-[#F97316]" />
            <span className="text-base font-semibold text-white">Rufen</span>
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rufen-dot h-2 w-2 rounded-full bg-[#F97316]" />
            <span className="text-sm text-[#8a8a8a]">Outbound calling campaigns</span>
          </div>
          <Link to="/new">
            <span className="rounded-full bg-[#F97316] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#fb8634]">
              + New Campaign
            </span>
          </Link>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
