import os
import sys
import numpy as np

# Change dir if needed
sys.path.append(os.path.dirname(__file__))

import database, models, face_utils

db = database.SessionLocal()
all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
print(f"Found {len(all_users)} users with encodings")

# Find the most recently uploaded image
files = [f for f in os.listdir("uploads") if f.endswith(".jpg") or f.endswith(".png")]
if not files:
    print("No images found in uploads/")
    sys.exit(0)

files.sort(key=lambda x: os.path.getmtime(os.path.join("uploads", x)))
latest_file = os.path.join("uploads", files[-1])
print(f"Testing latest image: {latest_file}")

with open(latest_file, "rb") as f:
    image_np = face_utils.load_image_file(f.read())

face_data_list = face_utils.get_all_face_data(image_np)
print(f"Detected {len(face_data_list)} faces")

def cosine_dist(enc_a: list, enc_b: list) -> float:
    a = np.array(enc_a, dtype=np.float64)
    b = np.array(enc_b, dtype=np.float64)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0: return 1.0
    return float(1.0 - np.dot(a, b) / (na * nb))

for idx, face_data in enumerate(face_data_list):
    full_emb = face_data.get("full_embedding")
    if not full_emb: continue
    face_box = face_data.get("face_box", {})
    x = face_box.get("x", 0)
    y = face_box.get("y", 0)
    print(f"\nFace {idx} (x:{x}, y:{y}):")
    for user in all_users:
        valid_encs = [enc for enc in user.face_encodings[:3] if enc]
        if valid_encs:
            dist = min(cosine_dist(full_emb, enc) for enc in valid_encs)
            
            status = "MISMATCH"
            if dist < face_utils.POST_MATCH_THRESHOLD:
                status = "MATCH (Threshold pass)"
            
            print(f"  -> User {user.username} (ID:{user.id}): dist={dist:.4f} [{status}]")
