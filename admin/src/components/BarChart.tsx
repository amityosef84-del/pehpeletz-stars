import { useId, useState } from 'react';

interface Datum {
  label: string;
  value: number;
}
interface Props {
  title: string;
  data: Datum[];
  format: (n: number) => string;
  height?: number;
}

/**
 * עמודות לסדרה אחת (גודל לאורך זמן). צבע אחד, עמודות דקות עם קצה מעוגל,
 * רשת שקטה, tooltip בריחוף ובפוקוס מקלדת, וטבלה נגישה מוסתרת.
 */
export function BarChart({ title, data, format, height = 200 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 640;
  const H = height;
  const pad = { top: 12, bottom: 26, side: 8 };
  const innerH = H - pad.top - pad.bottom;
  const slot = (W - pad.side * 2) / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, slot - 6));
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="chart__title">
        {title}
      </figcaption>
      <div className="chart__plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={title}
          preserveAspectRatio="none"
          style={{ direction: 'ltr' }}
        >
          {ticks.map((t) => {
            const y = pad.top + innerH - (t / max) * innerH;
            return (
              <line key={t} x1={pad.side} x2={W - pad.side} y1={y} y2={y} className="chart__grid" />
            );
          })}
          {data.map((d, i) => {
            // RTL: היום הראשון מימין
            const x = W - pad.side - slot * (i + 1) + (slot - barW) / 2;
            const h = (d.value / max) * innerH;
            const y = pad.top + innerH - h;
            return (
              <g key={d.label}>
                <rect
                  x={x - (slot - barW) / 2}
                  y={pad.top}
                  width={slot}
                  height={innerH}
                  className="chart__hit"
                  role="img"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}`}
                />
                <path
                  d={roundedTop(
                    x,
                    y,
                    barW,
                    Math.max(h, d.value > 0 ? 2 : 0),
                    Math.min(4, barW / 2),
                  )}
                  className={hover === i ? 'chart__bar is-hover' : 'chart__bar'}
                  pointerEvents="none"
                />
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 8} className="chart__axis" textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div
            className="chart__tip"
            style={{ insetInlineStart: `${((hover + 0.5) / data.length) * 100}%` }}
            role="status"
          >
            <strong>{format(data[hover].value)}</strong>
            <span>{data[hover].label}</span>
          </div>
        )}
      </div>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
