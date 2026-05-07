import { Search, Plus, SlidersHorizontal } from "lucide-react";

type Props = {
  title: string;
  sub?: string;
  onImport?: () => void;
  showImport?: boolean;
  actions?: React.ReactNode;
};

export function Topbar({ title, sub, onImport, showImport = false, actions }: Props) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>

      <div className="topbar-search">
        <Search size={13} className="search-icon" />
        <input placeholder="Search applications, companies, roles…" />
      </div>

      <div className="topbar-spacer" />

      {actions ?? (
        <>
          {showImport && (
            <>
              <button className="btn btn-secondary">
                <SlidersHorizontal size={13} /> Filter
              </button>
              <button className="btn btn-primary" onClick={onImport}>
                <Plus size={13} /> Import Job
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
