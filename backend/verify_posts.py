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
        print("Running full extraction pipeline...")
        face_data_list = await asyncio.to_thread(face_utils.get_all_face_data, image_np)
        print(f"Detected {len(face_data_list)} faces")
        
        for idx, face_data in enumerate(face_data_list):
            print(f"\\n--- Face #{idx} ---")
            full_emb = face_data.get("full_embedding")
            enh_emb = face_data.get("enhanced_embedding")
            
            print(f"Has full_emb: {full_emb is not None}")
            print(f"Has enhanced_emb: {enh_emb is not None}")
            
            best_dist = float('inf')
            best_user = None
            
            for u in users:
                if not u.face_encodings: continue
                
                user_dist = float('inf')
                valid_encs = [enc for enc in u.face_encodings[:3] if enc]
                if not valid_encs: continue
                
                if full_emb:
                    user_dist = min(cosine_dist(full_emb, enc) for enc in valid_encs)
                    
                if enh_emb:
                    e_dist = min(cosine_dist(enh_emb, enc) for enc in valid_encs)
                    user_dist = min(user_dist, e_dist)
                    
                print(f" vs {u.username}: lowest_dist={user_dist:.4f}")
                
                if user_dist < best_dist:
                    best_dist = user_dist
                    best_user = u
                    
            if best_user:
                print(f"\\n*** BEST MATCH: {best_user.username} at {best_dist:.4f} ***")
                if best_dist < face_utils.POST_MATCH_THRESHOLD:
                    print(f"SUCCESS: Distance is below POST threshold ({face_utils.POST_MATCH_THRESHOLD}) -> Will tag this user!")
                else:
                    print("FAILURE: Distance is above threshold -> Nobody gets tagged.")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
