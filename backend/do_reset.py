"""
Quick clear — uses sqlite3 directly to DELETE all rows from every table.
Works even while FastAPI is running (SQLite WAL mode allows concurrent reads).
"""
import sqlite3, shutil, os

db_path = "sql_app.db"

with sqlite3.connect(db_path, timeout=5) as conn:
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()
    # Get all table names except sqlite internal ones
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cur.fetchall()]
    print(f"Tables found: {tables}")
    cur.execute("PRAGMA foreign_keys=OFF")
    for t in tables:
        cur.execute(f"DELETE FROM {t}")
        print(f"  Cleared table: {t} ({cur.rowcount} rows deleted)")
    cur.execute("PRAGMA foreign_keys=ON")
    conn.commit()

# Clear uploaded files too
for d in ['uploads', 'temp_uploads']:
    if os.path.exists(d):
        for fn in os.listdir(d):
            if fn == '.gitkeep': continue
            fp = os.path.join(d, fn)
            try:
                if os.path.isfile(fp): os.unlink(fp)
                elif os.path.isdir(fp): shutil.rmtree(fp)
            except Exception as e:
                print(f'Could not delete {fp}: {e}')
        print(f'Cleared {d}/')

for f in ['debug_last_scan.jpg', 'face_distance.log']:
    if os.path.exists(f):
        os.remove(f)
        print(f'Deleted {f}')

print('\nAll users and data cleared. App is fresh!')
