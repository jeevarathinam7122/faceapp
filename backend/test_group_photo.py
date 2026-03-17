import os, sys
import numpy as np
import face_utils
from database import SessionLocal
import models
import cv2

db = SessionLocal()
users = db.query(models.User).all()

img_path = r"uploads/b823dfa7-581f-45aa-b128-b50f5d31cc10.jpeg"
with open(img_path, "rb") as f:
    img_bytes = f.read()

image_np = face_utils.load_image_file(img_bytes)
import asyncio
face_data_list = asyncio.run(asyncio.to_thread(face_utils.get_all_face_data, image_np))

def cosine_dist(enc_a, enc_b):
    a = np.array(enc_a, dtype=np.float64)
    b = np.array(enc_b, dtype=np.float64)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0: return 1.0
    return float(1.0 - np.dot(a, b) / (na * nb))

for idx, face_data in enumerate(face_data_list):
    print(f"\n--- FACE {idx} ---")
    full_emb = face_data.get("full_embedding")
    lower_emb = face_data.get("lower_embedding")
    x = face_data["face_box"]["x"]
    w = face_data["face_box"]["w"]
    print(f"Box: {face_data['face_box']}")
    
    for user in users:
        print(f" User: {user.username} (ID {user.id})")
        encs = [e for e in user.face_encodings[:3] if e]
        if full_emb and encs:
            min_dist = min([cosine_dist(full_emb, e) for e in encs])
            print(f"  -> Full Face Min Dist: {min_dist:.4f}")
        
        if lower_emb and len(user.face_encodings) > 3:
            l_enc = user.face_encodings[3]
            if l_enc:
                l_dist = cosine_dist(lower_emb, l_enc)
                print(f"  -> Lower Face Min Dist: {l_dist:.4f}")
