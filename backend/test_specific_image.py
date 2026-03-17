import os, sys, database, models, face_utils, numpy as np

db = database.SessionLocal()
all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
f = 'uploads/f7eb1678-b0c2-4d15-bc2d-bdca7508d756.jpeg'

with open(f, 'rb') as file:
    image_np = face_utils.load_image_file(file.read())

face_data_list = face_utils.get_all_face_data(image_np)
print(f"Detected {len(face_data_list)} faces")

def cosine_dist(enc_a, enc_b):
    a = np.array(enc_a, dtype=np.float64)
    b = np.array(enc_b, dtype=np.float64)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0: return 1.0
    return float(1.0 - np.dot(a, b) / (na * nb))

for idx, face_data in enumerate(face_data_list):
    box = face_data.get("face_box", {})
    full_emb = face_data.get("full_embedding")
    enh_emb = face_data.get("enhanced_embedding")
    print(f"\nFace {idx} (x:{box.get('x')}, y:{box.get('y')}):")
    for u in all_users:
        valid_encs = [enc for enc in u.face_encodings[:3] if enc]
        dist = float('inf')
        if full_emb and valid_encs:
            dist = min(dist, min(cosine_dist(full_emb, enc) for enc in valid_encs))
        if enh_emb and valid_encs:
            dist = min(dist, min(cosine_dist(enh_emb, enc) for enc in valid_encs))
        print(f"  -> {u.username}: dist={dist:.4f}")
