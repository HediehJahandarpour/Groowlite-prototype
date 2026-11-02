import { ChevronsUpDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./Header.css";

export function Header() {
  const [name, setName] = useState("Project name");
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function beginEdit() {
    cancelRef.current = false;
    setDraft(name);
    setEditing(true);
  }

  function commit() {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }

    const next = draft.trim();
    if (next) {
      setName(next);
    } else {
      setDraft(name);
    }
    setEditing(false);
  }

  function cancel() {
    cancelRef.current = true;
    setDraft(name);
    setEditing(false);
  }

  return (
    <header className="header">
      <div className="header__identity">
        {editing ? (
          <input
            ref={inputRef}
            className="header__name-input"
            value={draft}
            aria-label="Project name"
            maxLength={80}
            size={Math.max(draft.length, 8)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
        ) : (
          <button type="button" className="header__name" onClick={beginEdit}>
            {name}
          </button>
        )}
        <button
          type="button"
          className="header__edit"
          aria-label="Edit project name"
          onMouseDown={(event) => event.preventDefault()}
          onClick={beginEdit}
        >
          <ChevronsUpDown size={16} strokeWidth={2.25} />
        </button>
      </div>
      <button type="button" className="header__export" disabled>
        <Download size={15} strokeWidth={2} />
        Export
      </button>
    </header>
  );
}
