from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import shutil
import os
import asyncio
from datetime import timedelta
from pydantic import BaseModel
from typing import List
import json
import base64

from database import get_db
import models, schemas, auth, face_utils

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)


# ─── /auth/scan-face ─────────────────────────────────────────────────────────

@router.post("/scan-face")
async def scan_face(
    file: UploadFile = File(...),
    angle: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Scan a single face photo:
    - Detects whether a face is present
    - Checks if the face is already registered
    - Returns the ArcFace embedding so the client can reuse it at registration time
      (avoids running heavy ArcFace a second time during /auth/register)
    """
    contents = await file.read()

    # DEBUG: Save the received image to inspect it
    try:
        with open("debug_last_scan.jpg", "wb") as f:
            f.write(contents)
        print("DEBUG: Saved debug_last_scan.jpg", flush=True)
    except:
        pass

    try:
        # 1. Load Image
        print(f"DEBUG: scan_face called. converting to np...", flush=True)
        try:
            image_np = face_utils.load_image_file(contents)
        except Exception as e:
            print(f"DEBUG: load_image_file failed: {e}", flush=True)
            return JSONResponse(status_code=400, content={"face_detected": False, "message": "Invalid image file."})

        # 1.5 Validate Face Direction
        if angle:
            is_valid_dir = await asyncio.to_thread(face_utils.validate_face_direction, image_np, angle)
            if not is_valid_dir:
                return {
                    "face_detected": False,
                    "already_registered": False,
                    "embedding": None,
                    "message": f"Incorrect angle detected. Please provide a clear '{angle}' view of your face."
                }

        # 2. Get Embedding (Run in threadpool to avoid blocking async loop)
        print(f"DEBUG: calling get_face_encoding...", flush=True)
        try:
            # DeepFace is synchronous and heavy. Running it in the main async loop blocks
            # the server heartbeat, causing timeouts/network errors.
            # We must offload it to a thread.
            encoding = await asyncio.to_thread(face_utils.get_face_encoding, image_np)
            lower_encoding = await asyncio.to_thread(face_utils.get_lower_face_encoding, image_np)
            print(f"DEBUG: get_face_encoding returned: {type(encoding)}", flush=True)
            print(f"DEBUG: get_lower_face_encoding returned: {type(lower_encoding)}", flush=True)
        except Exception as e:
            print(f"DEBUG: get_face_encoding CRASHED: {e}", flush=True)
            return JSONResponse(status_code=500, content={"face_detected": False, "message": f"AI Error: {str(e)}"})

        if encoding is None:
            print("DEBUG: No face detected.", flush=True)
            return {
                "face_detected": False,
                "already_registered": False,
                "embedding": None,
                "lower_embedding": None,
                "message": "No face detected. Please use a clear, well-lit photo where your face is clearly visible."
            }

        print("DEBUG: Checking duplicates...", flush=True)
        all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
        for user in all_users:
            stored = user.face_encodings or []
            if len(stored) < 3:
                continue
                
            matched_views = 0
            # Cross-compare against all 3 stored angles of this user
            for i_stored, enc_stored in enumerate(stored[:3]):
                if not enc_stored:
                    continue
                    
                # Use strict threshold (0.28) for all views to prevent false matches between different people.
                tol = 0.28
                
                if face_utils.is_duplicate_registration([enc_stored], encoding, min_votes=1, tolerance=tol):
                    matched_views += 1

            # In scan-face, we only get ONE image to check at a time. So it's not possible to have 3 matches.
            # However, if this single face matches ANY stored face of an existing user, we should warn them.
            if matched_views > 0:
                print(f"DEBUG: Already registered as {user.username} (matched stored view)", flush=True)
                return {
                    "face_detected": True,
                    "already_registered": True,
                    "embedding": None, # Don't return embedding if duplicate
                    "lower_embedding": None,
                    "message": f"This face already matches a registered user '{user.username}'."
                }

        # 4. Success
        print("DEBUG: Scan success!", flush=True)
        return {
            "face_detected": True,
            "already_registered": False,
            "embedding": encoding,      # <-- returned to client for reuse
            "lower_embedding": lower_encoding if angle == "front" else None,
            "message": "Face detected and verified - not yet registered."
        }

    except Exception as e:
        print(f"CRITICAL: Unhandled exception: {e}", flush=True)
        return JSONResponse(status_code=500, content={"face_detected": False, "message": f"Server Error: {str(e)}"})


# ─── /auth/register-with-embeddings ─────────────────────────────────────────

class RegisterWithEmbeddingsRequest(BaseModel):
    username: str
    email: str
    password: str
    front_embedding: List[float]
    left_embedding: List[float]
    right_embedding: List[float]
    lower_embedding: List[float] = None
    front_image_base64: str = None
    left_image_base64: str = None
    right_image_base64: str = None


@router.post("/register-with-embeddings", response_model=schemas.Token)
async def register_with_embeddings(
    body: RegisterWithEmbeddingsRequest,
    db: Session = Depends(get_db)
):
    """
    Register a user using pre-verified ArcFace embeddings from /auth/scan-face.
    No need to re-run DeepFace — embeddings are already computed and validated.
    """
    # Check username / email uniqueness
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already registered.")
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Final duplicate-face check (strict angle-to-angle comparison)
    # To prevent false positives between different users' side profiles,
    # we specifically compare:
    #   new front <-> stored front
    #   new left  <-> stored left
    #   new right <-> stored right
    
    embeddings = [body.front_embedding, body.left_embedding, body.right_embedding, body.lower_embedding]
    all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
    for user in all_users:
        stored = user.face_encodings or []
        if len(stored) < 3:
            continue # Malformed user data, skip
            
        angle_names = ["front", "left", "right"]
        new_encodings = [body.front_embedding, body.left_embedding, body.right_embedding]
        
        matched_views = 0
        for i_new, enc_new in enumerate(new_encodings):
            for i_stored, enc_stored in enumerate(stored[:3]):
                # Use a strict threshold (0.28) for all views to prevent false matches between different people.
                tol = 0.28

                if face_utils.is_duplicate_registration([enc_stored], enc_new, min_votes=1, tolerance=tol):
                    matched_views += 1
                    break # Stop checking other stored views for this new view
                    
        # Only block registration if ALL 3 views (front, left, right) match an existing user
        if matched_views >= 3:
            raise HTTPException(
                status_code=400,
                detail=f"This face already belongs to registered user '{user.username}'."
            )

    all_embeddings = embeddings

    # Save the base64 images if provided
    profiles_dir = "uploads/profiles"
    os.makedirs(profiles_dir, exist_ok=True)
    
    def decode_and_save(base64_str, filename):
        if not base64_str: return
        try:
            if "," in base64_str:
                base64_str = base64_str.split(",")[1]
            img_data = base64.b64decode(base64_str)
            with open(os.path.join(profiles_dir, filename), "wb") as f:
                f.write(img_data)
        except Exception as e:
            print(f"DEBUG: Failed to save {filename}: {e}", flush=True)

    decode_and_save(body.front_image_base64, f"{body.username}_front.jpg")
    decode_and_save(body.left_image_base64, f"{body.username}_left.jpg")
    decode_and_save(body.right_image_base64, f"{body.username}_right.jpg")

    hashed_password = auth.get_password_hash(body.password)
    db_user = models.User(
        username=body.username,
        email=body.email,
        hashed_password=hashed_password,
        face_encodings=all_embeddings
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    access_token = auth.create_access_token(
        data={"sub": db_user.username},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ─── /auth/register (kept for camera mode — images submitted directly) ────────

@router.post("/register", response_model=schemas.Token)
async def register(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already registered.")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    encodings = []
    front_np_for_lower = None
    profiles_dir = "uploads/profiles"
    os.makedirs(profiles_dir, exist_ok=True)

    for label, upload_file in [("front", front), ("left", left), ("right", right)]:
        contents = await upload_file.read()
        image_np = face_utils.load_image_file(contents)

        # 1. Validate angle. Not mirrored anymore since frontend fix.
        is_valid_dir = await asyncio.to_thread(face_utils.validate_face_direction, image_np, label, False)
        if not is_valid_dir:
            raise HTTPException(status_code=400, detail=f"Incorrect angle detected for the {label} picture. Please provide a clear '{label}' view of your face.")

        if label == "front":
            front_np_for_lower = image_np

        # Offload encoding to thread pool
        encoding = await asyncio.to_thread(face_utils.get_face_encoding, image_np)
        if encoding is None:
            raise HTTPException(
                status_code=400,
                detail=f"No face detected in the {label} image. Please ensure your face is clearly visible."
            )
        encodings.append(encoding)

        # Save the photo immediately while bytes are in memory
        try:
            with open(os.path.join(profiles_dir, f"{username}_{label}.jpg"), "wb") as f:
                f.write(contents)
        except Exception as e:
            print(f"DEBUG: Failed to save {label} photo: {e}", flush=True)

    # 2. Check for Duplicate Face Registration (MUST be done before saving)
    # Strict angle-to-angle comparison (encodings: [front, left, right])
    all_users = db.query(models.User).filter(models.User.face_encodings != None).all()
    for user in all_users:
        stored = user.face_encodings or []
        if len(stored) < 3:
            continue
        
        angle_names = ["front", "left", "right"]
        matched_views = 0
        for i_new, enc_new in enumerate(encodings):
            for i_stored, enc_stored in enumerate(stored[:3]):
                # Use strict threshold (0.28) for all views to prevent false matches between different people.
                tol = 0.28
                
                if face_utils.is_duplicate_registration([enc_stored], enc_new, min_votes=1, tolerance=tol):
                    matched_views += 1
                    break

        if matched_views >= 3:
            raise HTTPException(
                status_code=400,
                detail=f"This face already belongs to registered user '{user.username}'."
            )

    # Photos already saved inside the loop above


    hashed_password = auth.get_password_hash(password)
    db_user = models.User(
        username=username,
        email=email,
        hashed_password=hashed_password,
        face_encodings=encodings
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    access_token = auth.create_access_token(
        data={"sub": db_user.username},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ─── /auth/token ─────────────────────────────────────────────────────────────

@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(
    form_data: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ─── /auth/add-face  (Progressive Face Enhancement) ─────────────────────────

def _get_current_user(token: str = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency to extract current user from JWT token."""
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


@router.post("/add-face")
async def add_face_angle(
    file: UploadFile = File(...),
    angle: str = Form(None),
    current_user: models.User = Depends(_get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allow a logged-in user to upload an additional face photo (any angle).
    The new 512D embedding is appended to their profile, progressively
    improving the AI's accuracy for recognizing them.
    """
    contents = await file.read()
    image_np = face_utils.load_image_file(contents)

    # Extract the face embedding
    encoding = await asyncio.to_thread(face_utils.get_face_encoding, image_np)
    if encoding is None:
        raise HTTPException(
            status_code=400,
            detail="No face detected in the image. Please upload a clear photo of your face."
        )

    # Validate angle if provided
    if angle and angle in ["front", "left", "right"]:
        is_valid_dir = await asyncio.to_thread(face_utils.validate_face_direction, image_np, angle, False)
        if not is_valid_dir:
            raise HTTPException(
                status_code=400,
                detail=f"Incorrect angle detected. Please provide a clear '{angle}' view of your face."
            )

    # Safety check: make sure this face actually belongs to the current user
    # (prevent them from accidentally adding someone else's face to their profile)
    stored = current_user.face_encodings or []
    if stored:
        min_dist = min(face_utils._cosine_dist(enc, encoding) for enc in stored if isinstance(enc[0], (int, float)))
        print(f"DEBUG [add-face] closest distance to stored faces: {min_dist:.4f}", flush=True)
        if min_dist > 0.65:
            raise HTTPException(
                status_code=400,
                detail="This face doesn't look like you! Please upload a photo of your own face."
            )

    # Append the new embedding to the user's face_encodings array
    new_encodings = list(stored) + [encoding]
    current_user.face_encodings = new_encodings

    # SQLAlchemy needs to know the JSON column changed
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "face_encodings")

    db.commit()
    db.refresh(current_user)

    total_encodings = len(current_user.face_encodings)
    total = 1 + (total_encodings - 4) if total_encodings > 4 else (1 if total_encodings > 0 else 0)

    # Save the photo to uploads/profiles/ so it can be displayed in the UI
    try:
        profiles_dir = "uploads/profiles"
        os.makedirs(profiles_dir, exist_ok=True)
        # Count existing extra files to get a unique index
        existing = [f for f in os.listdir(profiles_dir)
                    if f.startswith(f"{current_user.username}_extra_")]
        idx = len(existing)
        filename = f"{current_user.username}_extra_{idx}_{angle or 'other'}.jpg"
        with open(os.path.join(profiles_dir, filename), "wb") as f:
            f.write(contents)
        print(f"DEBUG [add-face] saved extra photo: {filename}", flush=True)
    except Exception as e:
        print(f"DEBUG [add-face] failed to save photo: {e}", flush=True)

    print(f"DEBUG [add-face] user '{current_user.username}' now has {total} face profiles (from {total_encodings} embeddings)", flush=True)

    return {
        "message": f"Face angle added successfully! You now have {total} face profiles.",
        "total_embeddings": total
    }


@router.get("/face-count")
def get_face_count(
    current_user: models.User = Depends(_get_current_user),
    db: Session = Depends(get_db)
):
    """Returns how many face embeddings the current user has stored (base profile = 1)."""
    total_encodings = len(current_user.face_encodings or [])
    total = 1 + (total_encodings - 4) if total_encodings > 4 else (1 if total_encodings > 0 else 0)
    return {"total_embeddings": total, "username": current_user.username}


@router.get("/face-gallery")
def get_face_gallery(
    current_user: models.User = Depends(_get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns URLs for all saved face photos of the current user:
    - Registered photos: front, left, right
    - Enhanced photos: extra_0, extra_1, ...
    """
    profiles_dir = "uploads/profiles"
    username = current_user.username

    registered = []
    for angle in ["front", "left", "right"]:
        filename = f"{username}_{angle}.jpg"
        if os.path.exists(os.path.join(profiles_dir, filename)):
            registered.append({
                "url": f"uploads/profiles/{filename}",
                "label": angle.capitalize(),
                "type": "registered"
            })

    enhanced = []
    if os.path.exists(profiles_dir):
        for fname in sorted(os.listdir(profiles_dir)):
            if fname.startswith(f"{username}_extra_"):
                # Extract angle label from filename: {user}_extra_{idx}_{angle}.jpg
                parts = fname.replace(".jpg", "").split("_")
                angle_label = parts[-1].capitalize() if len(parts) >= 4 else "Extra"
                enhanced.append({
                    "url": f"uploads/profiles/{fname}",
                    "label": angle_label,
                    "type": "enhanced"
                })

    return {"registered": registered, "enhanced": enhanced}
