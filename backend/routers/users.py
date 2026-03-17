from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models, schemas, auth

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

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

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.get("/permissions/pending", response_model=List[schemas.PermissionRequest])
def get_pending_permissions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    requests = db.query(models.PermissionRequest).filter(
        models.PermissionRequest.tagged_user_id == current_user.id,
        models.PermissionRequest.status == "PENDING"
    ).all()
    # Filter out orphaned requests where the associated post was deleted
    return [r for r in requests if r.post is not None]

@router.get("/permissions/sent", response_model=List[schemas.PermissionRequest])
def get_sent_permissions(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Requests sent BY ME (post.uploader == current_user)
    # We join PermissionRequest -> Post to filter by Post.uploader_id
    requests = db.query(models.PermissionRequest)\
                 .join(models.Post)\
                 .filter(models.Post.uploader_id == current_user.id)\
                 .order_by(models.PermissionRequest.id.desc())\
                 .all()
    # Filter out orphaned requests where the associated post was deleted
    return [r for r in requests if r.post is not None]

@router.post("/permissions/{request_id}/approve")
def approve_permission(
    request_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(models.PermissionRequest).filter(models.PermissionRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req.tagged_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    req.status = "APPROVED"
    db.commit()
    
    # Check if all permissions for this post are approved
    post = req.post
    all_reqs = post.permission_requests
    if all(r.status == "APPROVED" for r in all_reqs):
        post.is_active = True
        db.commit()
        
    return {"message": "Approved"}

@router.post("/permissions/{request_id}/deny")
def deny_permission(
    request_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req = db.query(models.PermissionRequest).filter(models.PermissionRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req.tagged_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    req.status = "DENIED"
    # Logic: if one denies, maybe the post is deleted or just never shown?
    # For now, let's just keep it inactive.
    # Optionally, we could delete the post or blur the face.
    
    db.commit()
    return {"message": "Denied"}
