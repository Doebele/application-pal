import { Search, Plus, Settings } from "iconoir-react";

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
        <Search width={13} height={13} className="search-icon" />
        <input placeholder="Search applications, companies, roles…" />
      </div>

      <div className="topbar-spacer" />

      {actions ?? (
        <>
          {showImport && (
            <>
              <button className="btn btn-secondary">
                <Settings width={13} height={13} /> Filter
              </button>
              <button className="btn btn-primary" onClick={onImport}>
                <Plus width={13} height={13} /> Import Job
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
