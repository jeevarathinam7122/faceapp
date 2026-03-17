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
        # Get users and posts
        users = db.query(models.User).all()
        posts = db.query(models.Post).order_by(models.Post.id.desc()).limit(3).all()
        
        print(f"Users found: {[u.username for u in users]}")
        
        # Helper
        def cosine_dist(enc_a, enc_b):
            a = np.array(enc_a, dtype=np.float64)
            b = np.array(enc_b, dtype=np.float64)
            na, nb = np.linalg.norm(a), np.linalg.norm(b)
            if na == 0 or nb == 0:
                return 1.0
            return float(1.0 - np.dot(a, b) / (na * nb))

        for post in posts:
            if not os.path.exists(post.image_url):
                print(f"Post {post.id} missing image file")
                continue
                
            print(f"\\n--- POST {post.id} --- Image: {post.image_url}")
            with open(post.image_url, "rb") as f:
                image_bytes = f.read()
            image_np = face_utils.load_image_file(image_bytes)
            
            face_data_list = await asyncio.to_thread(face_utils.get_all_face_data, image_np)
            print(f"Detected {len(face_data_list)} faces")
            
            for f_idx, face_data in enumerate(face_data_list):
                full_emb = face_data["full_embedding"]
                
                print(f"  Face #{f_idx}:")
                for u in users:
                    if not u.face_encodings:
                        continue
                        
                    user_min_dist = float('inf')
                    valid_encs = [enc for enc in u.face_encodings[:3] if enc]
                    if valid_encs:
                        user_min_dist = min(cosine_dist(full_emb, enc) for enc in valid_encs)
                        
                    print(f"    v.s. {u.username}: dist={user_min_dist:.4f}")
                    
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
