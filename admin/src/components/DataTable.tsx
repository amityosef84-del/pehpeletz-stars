import type { ReactNode } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  empty?: string;
}) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{empty ?? 'אין נתונים בטווח הזה'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
