import { ChevronsUpDown, Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import "./Header.css";

export type ProjectDetails = {
  name: string;
  designQuestion: string;
  description: string;
  target: string;
};

export const INITIAL_PROJECT: ProjectDetails = {
  name: "Project name",
  designQuestion: "",
  description: "",
  target: "",
};

type HeaderProps = {
  details: ProjectDetails;
  onChange: (details: ProjectDetails) => void;
};

export function Header({ details, onChange }: HeaderProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (root.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function update<K extends keyof ProjectDetails>(key: K, value: ProjectDetails[K]) {
    onChange({ ...details, [key]: value });
  }

  return (
    <header
      ref={rootRef}
      className={open ? "header header--open" : "header"}
    >
      <div className="header__bar">
        <div className="header__identity">
          <button
            type="button"
            className="header__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="header__name">{details.name || "Project name"}</span>
            <span className="header__chevron" aria-hidden="true">
              <ChevronsUpDown size={16} strokeWidth={2.25} />
            </span>
          </button>
        </div>
        <button type="button" className="header__export" disabled>
          <Download size={15} strokeWidth={2} />
          Export
        </button>
      </div>

      <div
        id={panelId}
        className="header__panel"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="header__fields">
          <label className="header__field">
            <span className="header__label">Project name</span>
            <input
              className="header__input"
              type="text"
              value={details.name}
              maxLength={80}
              placeholder="Give this project a name"
              onChange={(event) => update("name", event.target.value)}
            />
          </label>

          <label className="header__field">
            <span className="header__label">Design question?</span>
            <textarea
              className="header__input header__input--question"
              value={details.designQuestion}
              rows={2}
              placeholder="What design question are you trying to answer?"
              onChange={(event) => update("designQuestion", event.target.value)}
            />
          </label>

          <label className="header__field">
            <span className="header__label">Description</span>
            <textarea
              className="header__input header__input--description"
              value={details.description}
              rows={4}
              placeholder="Describe the context, constraints, and background for this process."
              onChange={(event) => update("description", event.target.value)}
            />
          </label>

          <label className="header__field">
            <span className="header__label">Target to achieve</span>
            <textarea
              className="header__input header__input--target"
              value={details.target}
              rows={2}
              placeholder="What outcome should this process lead to?"
              onChange={(event) => update("target", event.target.value)}
            />
          </label>
        </div>
      </div>
    </header>
  );
}
