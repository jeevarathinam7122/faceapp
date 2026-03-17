import os
import sys
import asyncio
from database import SessionLocal
import models
import face_utils
import numpy as np

async def main():
    db = SessionLocal()
    try:
        users = db.query(models.User).all()
        post = db.query(models.Post).order_by(models.Post.id.desc()).first()
        
        def cosine_dist(enc_a, enc_b):
            a = np.array(enc_a, dtype=np.float64)
            b = np.array(enc_b, dtype=np.float64)
            na, nb = np.linalg.norm(a), np.linalg.norm(b)
            if na == 0 or nb == 0:
                return 1.0
            return float(1.0 - np.dot(a, b) / (na * nb))

        with open(post.image_url, "rb") as f:
            image_bytes = f.read()
            
        image_np = face_utils.load_image_file(image_bytes)
        image_bgr = face_utils._to_bgr(image_np)
        
        # Test 1: Original image embedding
        print("====== ORIGINAL IMAGE EMBEDDING ======")
        res1 = face_utils._represent_faces(image_bgr, face_utils.DETECTOR_BACKEND, enforce=True)
        if res1:
            for u in users:
                if not u.face_encodings: continue
                d1 = min(cosine_dist(res1[0]["embedding"], enc) for enc in u.face_encodings[:3] if enc)
                print(f" -> {u.username}: dist={d1:.4f}")
                
        # Test 2: Enhanced image embedding
        print("\\n====== ENHANCED IMAGE EMBEDDING ======")
        enhanced_bgr = face_utils._enhance_for_detection(image_bgr)
        res2 = face_utils._represent_faces(enhanced_bgr, face_utils.DETECTOR_BACKEND, enforce=False)
        if res2:
            for u in users:
                if not u.face_encodings: continue
                d2 = min(cosine_dist(res2[0]["embedding"], enc) for enc in u.face_encodings[:3] if enc)
                print(f" -> {u.username}: dist={d2:.4f}")
                
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
