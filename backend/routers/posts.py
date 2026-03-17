from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import shutil
import os
import uuid
import numpy as np
import asyncio

from database import get_db
import models, schemas, auth, face_utils

router = APIRouter(
    prefix="/posts",
    tags=["posts"]
)

# Dependency to get current user
def get_current_user(token: str = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except auth.JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/upload", response_model=schemas.Post)
async def upload_post(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Save file
    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1]
    filename = f"{file_id}.{ext}"
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    with open(file_path, "rb") as f:
        image_bytes = f.read()
    
    image_np = face_utils.load_image_file(image_bytes)

    # get_all_face_data returns: [{full_embedding, has_glasses, lower_embedding, face_box}, ...]
    face_data_list = await asyncio.to_thread(face_utils.get_all_face_data, image_np)

    print(f"DEBUG [upload] detected {len(face_data_list)} face(s) in image", flush=True)

    # ── Cosine distance helper ─────────────────────────────────────────────────
    def cosine_dist(enc_a: list, enc_b: list) -> float:
        a = np.array(enc_a, dtype=np.float64)
        b = np.array(enc_b, dtype=np.float64)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na == 0 or nb == 0:
            return 1.0
        return float(1.0 - np.dot(a, b) / (na * nb))

    all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
    
    # ── Calculate all possible distances (dist, user, face_idx, face_box) ──────
    matches = []

    for idx, face_data in enumerate(face_data_list):
        has_glasses  = face_data["has_glasses"]
        full_emb     = face_data["full_embedding"]
        lower_emb    = face_data["lower_embedding"]
        
        # Convert DeepFace's dict {x, y, w, h} into [top, right, bottom, left]
        raw_box = face_data.get("face_box")
        face_box = None
        if raw_box and isinstance(raw_box, dict) and "x" in raw_box:
            face_box = [
                raw_box["y"], 
                raw_box["x"] + raw_box["w"], 
                raw_box["y"] + raw_box["h"], 
                raw_box["x"]
            ]

        print(f"DEBUG [upload] face#{idx} glasses={has_glasses}", flush=True)

        for user in all_users:
            stored_encs = user.face_encodings or []
            user_min_dist = float('inf')

            if full_emb:
                valid_encs = [enc for enc in stored_encs[:3] if enc]
                if valid_encs:
                    user_min_dist = min(cosine_dist(full_emb, enc) for enc in valid_encs)

            enhanced_emb = face_data.get("enhanced_embedding")
            if enhanced_emb:
                valid_encs = [enc for enc in stored_encs[:3] if enc]
                if valid_encs:
                    enh_dist = min(cosine_dist(enhanced_emb, enc) for enc in valid_encs)
                    user_min_dist = min(user_min_dist, enh_dist)

            if has_glasses and lower_emb and len(stored_encs) > 3:
                l_enc = stored_encs[3]
                if l_enc:
                    d = cosine_dist(lower_emb, l_enc)
                    print(f"DEBUG [upload]   -> Lower face dist={d:.4f} against '{user.username}'")
                    if d < face_utils.LOWER_FACE_MATCH_THRESHOLD:
                        user_min_dist = min(user_min_dist, d)

            if user_min_dist < float('inf'):
                matches.append((user_min_dist, user, idx, face_box))

    # ── Greedy Assignment to find absolute best matches ────────────────────────
    # Sort all recorded pairs by distance ascending
    matches.sort(key=lambda x: x[0])
    
    tagged_data = []          # List of (User, face_box)
    tagged_user_ids = set()   # Keep track of which users have already been tagged
    assigned_face_idxs = set() # Keep track of which faces have already been matched
    
    for dist, user, face_idx, face_box in matches:
        if user.id in tagged_user_ids or face_idx in assigned_face_idxs:
            continue
            
        if user.id == current_user.id:
            # It's (most likely) the uploader's own face
            if dist < face_utils.SELF_MATCH_THRESHOLD:
                print(f"DEBUG [upload]   -> Confirmed face#{face_idx} as uploader's own face (dist={dist:.4f}). Skipping.", flush=True)
                tagged_user_ids.add(user.id)
                assigned_face_idxs.add(face_idx)
        else:
            # It's another user's face
            if dist < face_utils.POST_MATCH_THRESHOLD:
                print(f"DEBUG [upload]   -> Tagging '{user.username}' for consent at face#{face_idx} (dist={dist:.4f})!", flush=True)
                tagged_data.append((user, face_box))
                tagged_user_ids.add(user.id)
                assigned_face_idxs.add(face_idx)
                
    is_active = len(tagged_data) == 0

    new_post = models.Post(
        uploader_id=current_user.id,
        image_url=file_path,
        is_active=is_active
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    for user, box in tagged_data:
        db.add(models.PermissionRequest(
            post_id=new_post.id,
            tagged_user_id=user.id,
            status="PENDING",
            face_box=box
        ))
    db.commit()

    print(f"DEBUG [upload] done - is_active={is_active}, tagged={[u.username for u, _ in tagged_data]}", flush=True)
    return new_post




@router.get("/", response_model=List[schemas.Post])
def get_feed(db: Session = Depends(get_db)):
    return db.query(models.Post).filter(models.Post.is_active == True).order_by(models.Post.id.desc()).all()

@router.get("/me", response_model=List[schemas.Post])
def get_my_posts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Post).filter(
        models.Post.uploader_id == current_user.id,
        models.Post.is_active == True
    ).order_by(models.Post.id.desc()).all()

@router.delete("/{post_id}")
def delete_post(
    post_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
        
    if post.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")
        
    try:
        if os.path.exists(post.image_url):
            os.remove(post.image_url)
    except Exception as e:
        print(f"Error deleting file: {e}")

    # Explicitly delete child relations to guarantee no SQLite IntegrityErrors
    db.query(models.PermissionRequest).filter(models.PermissionRequest.post_id == post_id).delete()
    db.query(models.Like).filter(models.Like.post_id == post_id).delete()
    db.query(models.Comment).filter(models.Comment.post_id == post_id).delete()

    db.delete(post)
    db.commit()
    return {"message": "Post deleted"}


# ─── Likes ────────────────────────────────────────────────────────────────────

@router.post("/{post_id}/like")
def toggle_like(
    post_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle like on a post. Returns liked=True/False and new like count."""
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = db.query(models.Like).filter(
        models.Like.post_id == post_id,
        models.Like.user_id == current_user.id
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(models.Like(post_id=post_id, user_id=current_user.id))
        db.commit()
        liked = True

    count = db.query(models.Like).filter(models.Like.post_id == post_id).count()
    return {"liked": liked, "like_count": count}


@router.get("/{post_id}/likes")
def get_likes(
    post_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    count = db.query(models.Like).filter(models.Like.post_id == post_id).count()
    liked = db.query(models.Like).filter(
        models.Like.post_id == post_id,
        models.Like.user_id == current_user.id
    ).first() is not None
    return {"liked": liked, "like_count": count}


# ─── Comments ─────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    text: str

@router.get("/{post_id}/comments")
def get_comments(
    post_id: int,
    db: Session = Depends(get_db)
):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.post_id == post_id)
        .order_by(models.Comment.created_at.asc())
        .all()
    )
    return [
        {
            "id": c.id,
            "text": c.text,
            "username": c.author.username,
            "created_at": c.created_at.isoformat(),
        }
        for c in comments
    ]

@router.post("/{post_id}/comments")
def add_comment(
    post_id: int,
    body: CommentIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = models.Comment(
        post_id=post_id,
        user_id=current_user.id,
        text=body.text.strip()
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "text": comment.text,
        "username": current_user.username,
        "created_at": comment.created_at.isoformat(),
    }

@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.query(models.Comment).filter(
        models.Comment.id == comment_id,
        models.Comment.post_id == post_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted"}

