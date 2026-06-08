import { useRef, useState, useEffect } from "react";
import { Search, Xmark } from "iconoir-react";
import { useRotatingPlaceholder } from "../lib/search";

type Props = {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  /** Rotating placeholder suggestions (language-aware). Falls back to "Suchen…". */
  searchSuggestions?: string[];
};

export function Topbar({ title, sub, actions, searchValue, onSearchChange, searchSuggestions }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  // Rotating placeholder — pauses while the input is focused or has a value
  const rotatingPlaceholder = useRotatingPlaceholder(
    searchSuggestions ?? [],
    focused || !!searchValue,
  );
  const placeholder = focused || !searchSuggestions?.length
    ? (searchSuggestions?.[0] ?? "Suchen…")
    : rotatingPlaceholder;

  // ⌘K / Ctrl+K — focus search from anywhere
  useEffect(() => {
    if (!onSearchChange) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSearchChange]);

  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>

      {/* Only render search when wired up */}
      {onSearchChange && (
        <div className="topbar-search">
          <Search width={13} height={13} className="search-icon" />
          <input
            ref={inputRef}
            placeholder={placeholder}
            value={searchValue ?? ""}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ paddingRight: searchValue ? 28 : undefined }}
          />
          {searchValue && (
            <button
              onClick={() => { onSearchChange(""); inputRef.current?.focus(); }}
              style={{
                position: "absolute", right: 8, background: "none", border: "none",
                cursor: "pointer", color: "var(--fg-4)", padding: 0, display: "flex",
              }}
            >
              <Xmark width={11} height={11} />
            </button>
          )}
        </div>
      )}

      <div className="topbar-spacer" />

      {actions}
    </div>
  );
}
