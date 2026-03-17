import os
import shutil

# Paths are relative to backend/
FILES_TO_DELETE = ["sql_app.db", "sql_app.db-shm", "sql_app.db-wal", "debug_last_scan.jpg", "face_distance.log"]
DIRS_TO_CLEAR = ["uploads", "temp_uploads"]

print("Starting Factory Reset...")

for f in FILES_TO_DELETE:
    if os.path.exists(f):
        try:
            os.remove(f)
            print(f"Deleted {f}")
        except Exception as e:
            print(f"Error deleting {f}: {e}")
    else:
        print(f"Skipped {f} (not found)")

for d in DIRS_TO_CLEAR:
    if os.path.exists(d):
        print(f"Clearing directory: {d}")
        for filename in os.listdir(d):
            if filename == ".gitkeep": continue
            file_path = os.path.join(d, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Failed to delete {file_path}. Reason: {e}")
    else:
        # Create it if missing (so app doesn't crash)
        try:
            os.makedirs(d)
            print(f"Created directory: {d}")
        except:
            pass

print("Reset Complete.")
