import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../services/i18n";
import { PROMPT_FIELDS, PromptField, fieldLabel } from "../services/promptFields";
import { formatValue } from "../services/promptPreview";

// The prompt, written as text, with every `field` it points at drawn as a pill.
// The text is still the source of truth — a pill is just `name` in backticks —
// so what is saved and sent is exactly what it was before. Typing a backtick
// offers the fields; a closed pair of backticks becomes a pill on its own.

export type VarState = "known" | "absent" | "unknown"; // in state here · in state, not on this street · not in state at all

export interface PromptEditorHandle {
  insert: (path: string) => void; // at the caret, or at the end until the caret has been placed
}

interface PromptEditorProps {
  value: string;
  onChange: (text: string) => void;
  limit: number;
  stateOf: (name: string) => VarState;
  valueOf: (name: string) => unknown; // what the name holds in the previewed spot
  showValues: boolean; // print each pill's value beside its name
  selected: string | null; // the pill picked out in the preview
  onSelect: (name: string | null) => void;
  edited: boolean;
  label?: string;
  className?: string;
}

const REF = /`([^`\n]{1,80})`/g;

type Segment = { text: string } | { name: string };

export const segmentsOf = (value: string): Segment[] => {
  const out: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(REF)) {
    if (m.index! > last) out.push({ text: value.slice(last, m.index) });
    out.push({ name: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < value.length) out.push({ text: value.slice(last) });
  return out;
};

const isPill = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.dataset.var !== undefined;
const isSentinel = (n: Node) => n instanceof HTMLElement && n.dataset.sentinel !== undefined;

// The DOM, back to text. Browsers add <br> and <div> for new lines; both read as "\n".
const serialize = (root: Node): string => {
  let out = "";
  root.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
    else if (isPill(n)) out += `\`${n.dataset.var}\``;
    else if (isSentinel(n)) return;
    else if (n.nodeName === "BR") out += "\n";
    else if (n.nodeName === "DIV" || n.nodeName === "P") out += (out && !out.endsWith("\n") ? "\n" : "") + serialize(n);
    else out += serialize(n);
  });
  return out;
};

// Where the selection starts and ends, counted in characters of the text
const selectionIn = (root: HTMLElement): { start: number; end: number } | null => {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode))) return null;
  const range = sel.getRangeAt(0);
  const upTo = (node: Node, offset: number) => {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return serialize(r.cloneContents()).length;
  };
  return { start: upTo(range.startContainer, range.startOffset), end: upTo(range.endContainer, range.endOffset) };
};

const caretOffset = (root: HTMLElement): number | null => selectionIn(root)?.end ?? null;

const placeCaret = (root: HTMLElement, offset: number) => {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let left = offset;
  for (const n of Array.from(root.childNodes)) {
    const len = n.nodeType === Node.TEXT_NODE ? (n.textContent ?? "").length : isPill(n) ? n.dataset.var!.length + 2 : 0;
    if (n.nodeType === Node.TEXT_NODE && left <= len) {
      range.setStart(n, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    if (isPill(n) && left < len) {
      range.setStartAfter(n);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= len;
  }
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
};

const pillNode = (name: string) => {
  const el = document.createElement("span");
  el.dataset.var = name;
  el.contentEditable = "false";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.className = "prompt-pill";
  const label = document.createElement("span");
  label.className = "prompt-pill-name";
  label.textContent = name.replace(/^state\./, "");
  const val = document.createElement("span");
  val.className = "prompt-pill-value";
  el.append(label, val);
  return el;
};

const render = (root: HTMLElement, value: string) => {
  root.replaceChildren(
    ...segmentsOf(value).map((s) => ("name" in s ? pillNode(s.name) : document.createTextNode(s.text)))
  );
  // A trailing new line needs something after it, or the empty last line has no height
  if (value.endsWith("\n")) {
    const br = document.createElement("br");
    br.dataset.sentinel = "";
    root.append(br);
  }
};

// The DOM holds text an edit should turn into pills (a closed pair of backticks)
// or markup a browser added (a <div> for Enter, a <b> from a paste)
const CLOSED = /`[^`\n]{1,80}`/;
const needsRender = (root: HTMLElement) =>
  Array.from(root.childNodes).some((n) =>
    n.nodeType === Node.TEXT_NODE ? CLOSED.test(n.textContent ?? "") : !isPill(n) && !isSentinel(n)
  );

const searchFields = (query: string): PromptField[] => {
  const q = query.toLowerCase().replace(/^state\./, "");
  if (!q) return PROMPT_FIELDS;
  const scored = PROMPT_FIELDS.map((f) => {
    const p = f.path.toLowerCase();
    const leaf = p.split(".").pop()!;
    const score = p.startsWith(q) ? 0 : leaf.startsWith(q) ? 1 : p.includes(q) ? 2 : -1;
    return { f, score };
  }).filter((x) => x.score >= 0);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.f);
};

interface Suggest {
  from: number; // where the backtick is
  query: string;
  x: number;
  y: number;
  index: number;
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  ({ value, onChange, limit, stateOf, valueOf, showValues, selected, onSelect, edited, label, className = "" }, ref) => {
    const { t, lang } = useLanguage();
    const root = useRef<HTMLDivElement>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const composing = useRef(false);
    const lastCaret = useRef<number | null>(null);
    const [suggest, setSuggest] = useState<Suggest | null>(null);

    // Draw the value whenever it changes from outside (restore, insert, another seat)
    useLayoutEffect(() => {
      const el = root.current;
      if (el && serialize(el) !== value) render(el, value);
    }, [value]);

    // Each pill says whether this spot has its field, and what it holds
    useLayoutEffect(() => {
      root.current?.querySelectorAll<HTMLElement>("[data-var]").forEach((el: HTMLElement) => {
        const name = el.dataset.var!;
        el.querySelector(".prompt-pill-name")!.textContent = fieldLabel(name, lang);
        el.setAttribute("aria-label", fieldLabel(name, lang));
        el.setAttribute("aria-pressed", String(name === selected));
        el.dataset.state = stateOf(name);
        el.dataset.selected = name === selected ? "true" : "false";
        const val = el.querySelector(".prompt-pill-value") as HTMLElement;
        const v = valueOf(name);
        val.textContent = showValues ? (v !== undefined ? formatValue(v, 60) : stateOf(name) === "unknown" ? t.seat.unknownVariable : t.seat.notThisStreet) : "";
      });
    });

    const commit = useCallback(
      (next: string, caret: number) => {
        const el = root.current!;
        render(el, next);
        placeCaret(el, caret);
        lastCaret.current = caret;
        onChange(next);
      },
      [onChange]
    );

    const readSuggest = () => {
      const el = root.current;
      const at = el ? caretOffset(el) : null;
      if (!el || at === null) return setSuggest(null);
      const text = serialize(el);
      const m = /`([^`\n\s]{0,40})$/.exec(text.slice(0, at));
      if (!m) return setSuggest(null);
      const sel = window.getSelection()!;
      const rect = sel.getRangeAt(0).getClientRects()[0] ?? el.getBoundingClientRect();
      const box = wrap.current!.getBoundingClientRect();
      setSuggest((s) => ({
        from: at - m[0].length,
        query: m[1],
        x: Math.min(rect.left - box.left, box.width - 300),
        y: rect.bottom - box.top + 6,
        index: s && s.query === m[1] ? s.index : 0,
      }));
    };

    const onInput = () => {
      const el = root.current!;
      if (composing.current) return;
      const next = serialize(el);
      const caret = caretOffset(el) ?? next.length;
      if (next.length > limit) {
        // Over the limit: put back what was there, caret and all
        render(el, value);
        placeCaret(el, Math.min(caret, value.length));
        return;
      }
      if (needsRender(el)) commit(next, caret);
      else {
        lastCaret.current = caret;
        onChange(next);
      }
      readSuggest();
    };

    const choose = (path: string) => {
      const el = root.current!;
      const text = serialize(el);
      const s = suggest!;
      const at = caretOffset(el) ?? s.from + 1 + s.query.length;
      const after = text.slice(at);
      const token = `\`${path}\`${after && /^[\s.,;:!?)]/.test(after) ? "" : " "}`;
      const next = text.slice(0, s.from) + token + after;
      if (next.length > limit) return;
      setSuggest(null);
      commit(next, s.from + token.length);
    };

    const matches = suggest ? searchFields(suggest.query).slice(0, 8) : [];

    const onKeyDown = (e: React.KeyboardEvent) => {
      const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-var]");
      if (pill && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        const name = pill.dataset.var!;
        onSelect(name === selected ? null : name);
        return;
      }
      if (suggest && matches.length) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const d = e.key === "ArrowDown" ? 1 : -1;
          setSuggest({ ...suggest, index: (suggest.index + d + matches.length) % matches.length });
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          choose(matches[Math.min(suggest.index, matches.length - 1)].path);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setSuggest(null);
          return;
        }
      }
      // Our own new line, so browsers don't wrap lines in <div>s
      if (e.key === "Enter" && !composing.current) {
        e.preventDefault();
        const el = root.current!;
        const text = serialize(el);
        const { start, end } = selectionIn(el) ?? { start: text.length, end: text.length };
        if (text.length - (end - start) + 1 > limit) return;
        commit(text.slice(0, start) + "\n" + text.slice(end), start + 1);
      }
    };

    const onPaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const el = root.current!;
      const text = serialize(el);
      const { start: at, end } = selectionIn(el) ?? { start: text.length, end: text.length };
      const pasted = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
      const available = Math.max(0, limit - (text.length - (end - at)));
      const inserted = pasted.slice(0, available);
      const next = text.slice(0, at) + inserted + text.slice(end);
      commit(next, at + inserted.length);
    };

    useImperativeHandle(ref, () => ({
      insert: (path: string) => {
        const el = root.current!;
        const text = serialize(el);
        const at = lastCaret.current !== null ? Math.min(lastCaret.current, text.length) : text.length;
        const before = text.slice(0, at);
        const after = text.slice(at);
        const token = `${before && !/\s$/.test(before) ? " " : ""}\`${path}\`${after && /^[\s.,;:!?)]/.test(after) ? "" : " "}`;
        const next = before + token + after;
        if (next.length > limit) return;
        el.focus();
        commit(next, Math.min(before.length + token.length, next.length));
      },
    }));

    const onClick = (e: React.MouseEvent) => {
      const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-var]");
      if (pill) {
        const name = pill.dataset.var!;
        onSelect(name === selected ? null : name);
      }
    };

    useEffect(() => {
      if (!suggest) return;
      const close = (e: PointerEvent) => {
        if (!wrap.current?.contains(e.target as Node)) setSuggest(null);
      };
      document.addEventListener("pointerdown", close);
      return () => document.removeEventListener("pointerdown", close);
    }, [suggest]);

    return (
      <div ref={wrap} className="relative">
        <div
          ref={root}
          role="textbox"
          aria-multiline="true"
          aria-label={label ?? t.seat.prompt}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          data-placeholder={t.seat.promptPlaceholder}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) readSuggest();
            lastCaret.current = caretOffset(root.current!);
          }}
          onMouseUp={() => (lastCaret.current = caretOffset(root.current!))}
          onPaste={onPaste}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => {
            composing.current = false;
            onInput();
          }}
          onClick={onClick}
          onBlur={() => setTimeout(() => setSuggest(null), 120)}
          className={`prompt-editor w-full whitespace-pre-wrap break-words rounded-[20px] bg-black/35 border outline-none px-4 py-3 text-[15px] leading-[1.9] transition-colors ${
            edited ? "border-[#f5e35b]/40 text-white focus:border-[#f5e35b]/70" : "border-white/10 text-white/75 focus:border-white/30 focus:text-white"
          } ${className}`}
        />

        {/* Fields, as you type after a backtick */}
        {suggest && matches.length > 0 && (
          <div
            className="absolute z-20 w-[300px] max-w-full rounded-[16px] bg-[#2c2c2e] border border-white/10 shadow-2xl shadow-black/60 py-1.5 animate-[fade-in_120ms_ease-out]"
            style={{ left: Math.max(0, suggest.x), top: suggest.y }}
            role="listbox"
          >
            {matches.map((f, i) => {
              const v = valueOf(f.path);
              return (
                <button
                  key={f.path}
                  type="button"
                  role="option"
                  aria-selected={i === suggest.index}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(f.path);
                  }}
                  onPointerEnter={() => setSuggest({ ...suggest, index: i })}
                  className={`w-full text-left px-3 py-1.5 cursor-pointer ${i === suggest.index ? "bg-white/[0.09]" : ""}`}
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <code className="font-mono text-[13px] text-white shrink-0">{f.path}</code>
                    <span className="font-mono text-[11px] text-white/35 truncate">{v === undefined ? t.seat.notThisStreet : formatValue(v, 40)}</span>
                  </span>
                  <span className="block text-[12px] leading-snug text-white/45 truncate">{f.desc[lang]}</span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    );
  }
);
PromptEditor.displayName = "PromptEditor";
