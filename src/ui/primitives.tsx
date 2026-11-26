import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconChevron, IconClose, IconDown, IconPlus, IconTrash, IconUp } from './icons';

export function Btn({
  children,
  onClick,
  kind = 'glass',
  icon,
  full,
  small,
  type = 'button',
  disabled,
  title,
}: {
  children?: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'tint' | 'glass' | 'danger' | 'ghost';
  icon?: ReactNode;
  full?: boolean;
  small?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type={type} className={`btn ${kind}${full ? ' full' : ''}${small ? ' small' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      {icon}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function Modal({ title, onClose, children, foot, tall }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', h);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal glass${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <IconClose size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-l">{label}</span>
      {children}
      {hint && <span className="field-h">{hint}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.v} type="button" role="tab" aria-selected={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Bar({ f, tone = 'blue' }: { f: number; tone?: 'blue' | 'green' }) {
  return (
    <div className={`bar ${tone}`} role="progressbar" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, f)) * 100}%` }} />
    </div>
  );
}

export function Sec({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-h">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ children, onClick, chevron, tone }: { children: ReactNode; onClick?: () => void; chevron?: boolean; tone?: string }) {
  const cls = `row${onClick ? ' tap' : ''}${tone ? ` ${tone}` : ''}`;
  if (!onClick) return <div className={cls}>{children}</div>;
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
      {chevron && <IconChevron size={16} />}
    </button>
  );
}

/** list of single-line texts with add / remove / reorder */
export function TextList({ items, onChange, add, rows = 2 }: { items: string[]; onChange: (v: string[]) => void; add: string; rows?: number }) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const c = [...items];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  };
  return (
    <div className="tl">
      {items.map((t, i) => (
        <div className="tl-row" key={i}>
          <textarea value={t} rows={rows} onChange={(e) => set(i, e.target.value)} aria-label={`${add} ${i + 1}`} />
          <div className="tl-btns">
            <button type="button" onClick={() => move(i, -1)} aria-label="Su" disabled={i === 0}>
              <IconUp size={14} />
            </button>
            <button type="button" onClick={() => move(i, 1)} aria-label="Giù" disabled={i === items.length - 1}>
              <IconDown size={14} />
            </button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Elimina">
              <IconTrash size={14} />
            </button>
          </div>
        </div>
      ))}
      <Btn small kind="tint" icon={<IconPlus size={15} />} onClick={() => onChange([...items, ''])}>
        {add}
      </Btn>
    </div>
  );
}

export function Collapsible({ title, count, children, open: init = false }: { title: string; count?: number | string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(init);
  return (
    <div className={`coll${open ? ' open' : ''}`}>
      <button type="button" className="coll-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        {count != null && <em>{count}</em>}
        <IconChevron size={15} />
      </button>
      {open && <div className="coll-b">{children}</div>}
    </div>
  );
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#5aa8ff" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
