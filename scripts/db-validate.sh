#!/usr/bin/env bash
# מריץ את כל ה-migrations על Postgres נקי + בדיקות RLS.
# שימוש: DATABASE_URL=postgres://user:pass@host:port/db npm run db:validate
# זהירות: מיועד למסד בדיקה ריק בלבד (CI / מקומי). לא להריץ מול production.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required (a throwaway Postgres database)}"
cd "$(dirname "$0")/.."
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/10_rls_test.sql
