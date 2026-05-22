import { Search, Xmark } from "iconoir-react";

type Props = {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
};

export function Topbar({ title, sub, actions, searchValue, onSearchChange, searchPlaceholder }: Props) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>

      <div className="topbar-search">
        <Search width={13} height={13} className="search-icon" />
        <input
          placeholder={searchPlaceholder ?? "Suchen…"}
          value={searchValue ?? ""}
          onChange={e => onSearchChange?.(e.target.value)}
          style={{ paddingRight: searchValue ? 28 : undefined }}
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange?.("")}
            style={{
              position: "absolute", right: 8, background: "none", border: "none",
              cursor: "pointer", color: "var(--fg-4)", padding: 0, display: "flex",
            }}
          >
            <Xmark width={11} height={11} />
          </button>
        )}
      </div>

      <div className="topbar-spacer" />

      {actions}
    </div>
  );
}
