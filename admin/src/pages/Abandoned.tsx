import { useMemo, useState } from 'react';
import { Loading, Notice, Seg, useAction } from '../components/ui';
import { ago, firstName, waLink } from '../lib/format';
import { api, useLoad, type Abandoned as Row } from '../lib/store';

const SITE = location.origin;
const KIT_NAMES: Record<string, string> = {
  'kit-1': 'ערכה אחת',
  'kit-2': '2 ערכות',
  'kit-3': '3 ערכות',
  'kit-4': '4 ערכות',
};
const cartText = (r: Row) =>
  r.cart.map((l) => KIT_NAMES[l.productId] ?? l.productId).join(', ') || 'לא נבחרה חבילה';

type Filter = 'open' | 'contacted' | 'recovered' | 'all';
const match: Record<Filter, (r: Row) => boolean> = {
  open: (r) => !r.recovered && !r.contacted_at,
  contacted: (r) => !r.recovered && Boolean(r.contacted_at),
  recovered: (r) => r.recovered,
  all: () => true,
};

export function message(r: Row): string {
  const pkg = r.cart[0]?.productId;
  const link = `${SITE}/checkout${pkg ? `?pkg=${pkg}` : ''}`;
  const hi = firstName(r.name) ? `היי ${firstName(r.name)}` : 'היי';
  return `${hi}, כאן הכוכבים של פהפלצת 🦸 ראינו שהתחלתם הזמנה של ערכת הצחצוח ולא סיימתם. אפשר לעזור במשהו? הנה קישור להשלמה: ${link}`;
}

export function Abandoned({ demo }: { demo: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api.abandoned(demo), [demo]);
  const [filter, setFilter] = useState<Filter>('open');
  const act = useAction();
  const counts = useMemo(() => {
    const c = { open: 0, contacted: 0, recovered: 0, all: 0 };
    for (const r of data ?? []) for (const k of Object.keys(c) as Filter[]) if (match[k](r)) c[k]++;
    return c;
  }, [data]);
  const rows = (data ?? []).filter(match[filter]);

  async function mark(r: Row, contacted: boolean) {
    const ok = await act.run(() =>
      api.act(demo, { action: 'abandoned.contacted', id: r.id, contacted }),
    );
    if (ok) reload();
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>עגלות נטושות</h1>
      </header>
      <p className="muted">
        אנשים שמילאו טלפון בטופס ההזמנה ולא שילמו. הודעה אישית בוואטסאפ תוך שעה-שעתיים מחזירה הרבה
        מהם. כשמישהו חוזר ומשלם, הוא עובר אוטומטית ל"חזרו וקנו".
      </p>
      <Notice msg={act.msg} />
      <Seg
        label="סינון"
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'open', label: `לטיפול (${counts.open})` },
          { key: 'contacted', label: `פנינו (${counts.contacted})` },
          { key: 'recovered', label: `חזרו וקנו (${counts.recovered})` },
          { key: 'all', label: 'הכל' },
        ]}
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Loading error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <section className="panel empty">
          <p>{filter === 'open' ? 'אין עגלות שמחכות לטיפול' : 'אין רשומות'}</p>
        </section>
      ) : (
        <ul className="cards" aria-label="עגלות נטושות">
          {rows.map((r) => {
            const wa = waLink(r.phone, message(r));
            return (
              <li key={r.id} className="ocard ocard--static">
                <span className="ocard__num">{r.name || 'ללא שם'}</span>
                <span className="ocard__total muted small">{ago(r.updated_at)}</span>
                <span className="ocard__meta muted small">
                  {r.phone && <span dir="ltr">{r.phone}</span>}
                  {r.email && (
                    <>
                      {' · '}
                      <span dir="ltr">{r.email}</span>
                    </>
                  )}
                  {' · '}
                  {cartText(r)}
                </span>
                <span className="ocard__badges">
                  {r.recovered ? (
                    <span className="st st--delivered">חזר/ה וקנה/תה</span>
                  ) : (
                    <>
                      {wa && (
                        <a
                          className="btn btn--small btn--wa"
                          href={wa}
                          target="_blank"
                          rel="noopener"
                          onClick={() => !r.contacted_at && mark(r, true)}
                        >
                          וואטסאפ
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn--small"
                        disabled={act.busy}
                        onClick={() => mark(r, !r.contacted_at)}
                      >
                        {r.contacted_at ? 'החזרה לטיפול' : 'סימון שפנינו'}
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
