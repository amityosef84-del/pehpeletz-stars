import { nf, pct, STEP_LABELS } from '../lib/format';

/** משפך: פסים אופקיים לפי שלב, עם אחוז מהשלב הקודם ואחוז נשירה. */
export function Funnel({ steps }: { steps: { step: string; count: number }[] }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <figure className="funnel">
      <figcaption className="chart__title">משפך המרה</figcaption>
      <ol>
        {steps.map((s, i) => {
          const prev = i === 0 ? s.count : (steps[i - 1]?.count ?? 0);
          const conv = prev > 0 ? (100 * s.count) / prev : 0;
          return (
            <li key={s.step}>
              <div className="funnel__row">
                <span className="funnel__label">{STEP_LABELS[s.step] ?? s.step}</span>
                <span className="funnel__value">{nf.format(s.count)}</span>
              </div>
              <div className="funnel__track">
                <div
                  className="funnel__bar"
                  style={{ width: `${Math.max(0.5, (100 * s.count) / top)}%` }}
                />
              </div>
              {i > 0 && (
                <p className="funnel__meta">
                  {pct(conv)} מהשלב הקודם · נשירה {pct(Math.max(0, 100 - conv))}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
