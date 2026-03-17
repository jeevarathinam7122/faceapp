"""
Diagnostic: computes the cosine distance between the DB-stored face embeddings
and a test image to see why the match is failing.

Usage:
  python test_distances.py path/to/photo.jpg
"""
import sys
import numpy as np
from database import SessionLocal
from models import User
import face_utils

def cosine_dist(a, b):
    a, b = np.array(a, dtype=np.float64), np.array(b, dtype=np.float64)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 1.0
    return float(1.0 - np.dot(a, b) / (na * nb))

if len(sys.argv) < 2:
    print("Usage: python test_distances.py path/to/photo.jpg")
    sys.exit(1)

img_path = sys.argv[1]
print(f"\n=== Loading test image: {img_path} ===")
import cv2
img = cv2.imread(img_path)
if img is None:
    print("ERROR: Could not load image")
    sys.exit(1)
img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

print("=== Running get_all_face_data ===")
faces = face_utils.get_all_face_data(img_rgb)
if not faces:
    print("NO FACES DETECTED in the image!")
    sys.exit(0)
print(f"Detected {len(faces)} face(s)")

db = SessionLocal()
users = db.query(User).filter(User.face_encodings != None).all()
print(f"\n=== Comparing against {len(users)} registered user(s) ===\n")

for face_idx, face in enumerate(faces):
    emb = face["full_embedding"]
    print(f"\n--- Face #{face_idx} ---")
    for user in users:
        stored = user.face_encodings or []
        print(f"  User: {user.username} (stored={len(stored)} embeddings)")
        for i, enc in enumerate(stored[:3]):
            if enc:
                d = cosine_dist(emb, enc)
                label = ["FRONT","LEFT","RIGHT"][i] if i < 3 else f"#{i}"
                status = "[MATCH]" if d < face_utils.POST_MATCH_THRESHOLD else "[MISS]"
                print(f"    {status}  angle={label}  dist={d:.4f}  threshold={face_utils.POST_MATCH_THRESHOLD}")
        best = min(cosine_dist(emb, enc) for enc in stored[:3] if enc)
        print(f"  >>> BEST distance = {best:.4f} (threshold = {face_utils.POST_MATCH_THRESHOLD})")
        if best < face_utils.POST_MATCH_THRESHOLD:
            print(f"  >>> RESULT: Would tag '{user.username}' for permission [MATCH]")
        else:
            print(f"  >>> RESULT: Would MISS '{user.username}' - no permission request [MISS]")
db.close()
print("\n=== Done ===")
