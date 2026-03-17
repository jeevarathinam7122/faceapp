import io
import numpy as np
import cv2
from PIL import Image

_deepface = None

def _get_deepface():
    global _deepface
    if _deepface is None:
        from deepface import DeepFace as _df
        _deepface = _df
    return _deepface

# ───────────────────────── Configuration ─────────────────────────────────────

# Facenet512 is extremely robust against occlusions (sunglasses/masks) and side profiles.
RECOGNITION_MODEL = "Facenet512"

# Primary detector: RetinaFace is best for group photos & far-away faces.
DETECTOR_BACKEND = "retinaface"

# Fallback detector for occluded/glasses/side-angle faces.
FALLBACK_DETECTOR = "opencv"

# Facenet512 cosine thresholds (0 = same person, 1 = totally different)
# Registration dupe check — strict to avoid false positives between strangers.
MATCH_THRESHOLD = 0.30
# Adjusted to 0.45. Previous value of 0.65 was far too permissive and caused false positives.
POST_MATCH_THRESHOLD = 0.45

MIN_VOTES_FOR_DUPLICATE = 2
LOWER_FACE_MATCH_THRESHOLD = 0.45

# Self-match threshold: how close a face must be to the UPLOADER'S OWN stored
# embeddings to be considered "their own face" and skip the permission check.
SELF_MATCH_THRESHOLD = 0.40

# ─────────────────────── Image loading ───────────────────────────────────────

def load_image_file(file_contents: bytes):
    """Loads an image from raw bytes into a numpy RGB array."""
    image = Image.open(io.BytesIO(file_contents)).convert("RGB")
    return np.array(image)

def _to_bgr(image_np):
    """Converts RGB numpy array to BGR as DeepFace expects."""
    if len(image_np.shape) == 3 and image_np.shape[2] == 3:
        return image_np[:, :, ::-1]
    return image_np

# ─────────────────────── Face encoding (for registration) ────────────────────

def get_face_encoding(image_np):
    """
    Returns the 512-D Facenet512 embedding for the most prominent face found.
    Used during registration. Always pass-1 only (strict so we don't accept garbage scans).
    """
    DeepFace = _get_deepface()
    image_bgr = _to_bgr(image_np)
    try:
        objs = DeepFace.represent(
            img_path=image_bgr,
            model_name=RECOGNITION_MODEL,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True,
            align=True,
        )
        if objs:
            # Pick the largest face (most important during single-person registration)
            objs.sort(key=lambda x: x["facial_area"]["w"] * x["facial_area"]["h"], reverse=True)
            return objs[0]["embedding"]
    except Exception as e:
        print(f"DEBUG [encoding] {e}", flush=True)
    return None

def validate_face_direction(image_np, expected_angle: str, is_mirrored: bool = False) -> bool:
    """
    Validates face direction using precise RetinaFace landmarks.
    """
    if expected_angle not in ["front", "left", "right"]:
        return True
        
    image_bgr = _to_bgr(image_np)
    try:
        DeepFace = _get_deepface()
        res = DeepFace.extract_faces(
            img_path=image_bgr, 
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True
        )
        fa = res[0]['facial_area']
        le = fa.get("left_eye")
        re = fa.get("right_eye")
        if not le or not re:
            return False 
            
        x, w = fa['x'], fa['w']
        eye_cx = (le[0] + re[0]) / 2  
        box_cx = x + w / 2
        
        offset = (eye_cx - box_cx) / w
        print(f"\n\n*** DEBUG [direction] *** expected={expected_angle} mirrored={is_mirrored} offset={offset:.5f}\n\n", flush=True)
        
        if expected_angle == "front":
            return abs(offset) < 0.12  # Strict front alignment
        elif expected_angle == "left":
            if is_mirrored:
                return offset > 0.03
            else:
                return offset < -0.03
        elif expected_angle == "right":
            if is_mirrored:
                return offset < -0.03
            else:
                return offset > 0.03
                
    except Exception as e:
        print(f"DEBUG [direction] failed to validate: {e}", flush=True)
        return False
        
    return True

def get_lower_face_encoding(image_np, face_box=None):
    """
    Extracts the lower 55% of the face (nose/mouth/chin area) and returns its embedding.
    This effectively ignores the eye region where dark glasses usually cause match failure.
    """
    if face_box is None:
        image_bgr = _to_bgr(image_np)
        try:
            objs = _get_deepface().extract_faces(
                img_path=image_bgr, 
                detector_backend=DETECTOR_BACKEND,
                enforce_detection=True
            )
            if not objs:
                return None
            face_box = objs[0]['facial_area']
        except Exception:
            return None

    # Calculate lower face crop (bottom 55% of the detection box)
    x, y, w, h = face_box['x'], face_box['y'], face_box['w'], face_box['h']
    img_h, img_w = image_np.shape[:2]
    
    # Start ~45% down the face (just below eyes), extending to bottom of box
    start_y = y + int(h * 0.45)
    end_y = min(y + h, img_h)
    
    # Add a little padding to the sides and bottom if possible
    start_x = max(0, x - int(w * 0.1))
    end_x = min(img_w, x + w + int(w * 0.1))
    end_y = min(img_h, end_y + int(h * 0.1))
    
    if end_y <= start_y or end_x <= start_x:
        return None

    lower_face_crop = image_np[start_y:end_y, start_x:end_x]
    
    # Resize slightly so DeepFace has enough pixels to process
    if lower_face_crop.shape[0] < 64 or lower_face_crop.shape[1] < 64:
        lower_face_crop = cv2.resize(lower_face_crop, (112, 112))
        
    DeepFace = _get_deepface()
    try:
        # We don't enforce detection on the crop itself, since it's only half a face
        objs = DeepFace.represent(
            img_path=_to_bgr(lower_face_crop),
            model_name=RECOGNITION_MODEL,
            detector_backend='skip', # Skip detection, use the provided crop directly
            enforce_detection=False
        )
        if objs:
            return objs[0]["embedding"]
    except Exception as e:
        print(f"DEBUG [lower_face] Error extracting lower face embedding: {e}", flush=True)

    return None

def detect_glasses(face_region_np) -> bool:
    """
    Detects if the face is wearing dark glasses.
    Returns True if dark regions over the eyes imply sunglasses.
    """
    try:
        # Convert to grayscale for intensity analysis
        gray = cv2.cvtColor(face_region_np, cv2.COLOR_RGB2GRAY)
        h, w = gray.shape
        
        # Analyze the eye region (top 20% to 45% of the face box)
        eye_y_start = int(h * 0.20)
        eye_y_end = int(h * 0.45)
        
        # Avoid edge cases where the box is too small
        if eye_y_end <= eye_y_start or w < 10:
            return False
            
        eye_region = gray[eye_y_start:eye_y_end, :]
        
        # Calculate the average darkness of the eye region compared to the rest of the face
        eye_mean = np.mean(eye_region)
        face_mean = np.mean(gray)
        
        # If the eye region is significantly darker than the overall face, 
        # it strongly indicates dark sunglasses are being worn.
        # This ratio (0.65) was calibrated for typical sunglasses contrast.
        if eye_mean < (face_mean * 0.65):
            print(f"DEBUG [glasses] Detected dark glasses! Eye brightness: {eye_mean:.1f} vs Face: {face_mean:.1f}")
            return True
            
    except Exception as e:
        print(f"DEBUG [glasses] Error checking glasses: {e}", flush=True)
        
    return False

# ─────────────── Multi-face detection (for post uploads) ─────────────────────

def _represent_faces(image_bgr, detector: str, enforce: bool) -> list:
    """
    Helper to run DeepFace.represent and return objects list.
    Returns empty list on any failure.
    """
    DeepFace = _get_deepface()
    try:
        objs = DeepFace.represent(
            img_path=image_bgr,
            model_name=RECOGNITION_MODEL,
            detector_backend=detector,
            enforce_detection=enforce,
            align=True,
        )
        return objs or []
    except Exception as e:
        print(f"DEBUG [represent] detector={detector} enforce={enforce} error={e}", flush=True)
        return []


def _deduplicate(results: list) -> list:
    """
    Remove duplicate face detections that overlap heavily (IoU > 0.5).
    This avoids counting the same physical face twice from two detectors.
    """
    def iou(a, b):
        ax1, ay1 = a["x"], a["y"]
        ax2, ay2 = ax1 + a["w"], ay1 + a["h"]
        bx1, by1 = b["x"], b["y"]
        bx2, by2 = bx1 + b["w"], by1 + b["h"]
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
        inter = iw * ih
        union = a["w"] * a["h"] + b["w"] * b["h"] - inter
        return inter / union if union > 0 else 0

    kept = []
    for r in results:
        box = r["face_box"]
        duplicate = False
        for k in kept:
            if iou(box, k["face_box"]) > 0.5:
                duplicate = True
                # Merge embeddings from different passes
                if r.get("full_embedding") and not k.get("full_embedding"):
                    k["full_embedding"] = r["full_embedding"]
                if r.get("enhanced_embedding") and not k.get("enhanced_embedding"):
                    k["enhanced_embedding"] = r["enhanced_embedding"]
                break
        if not duplicate:
            kept.append(r)
    return kept


def _enhance_for_detection(image_bgr: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Apply CLAHE contrast enhancement + upscaling to improve detection of faces in:
      - Outdoor / uneven lighting photos
      - Underexposed or overexposed shots
      - Far-away faces (person is small in the full frame)
    Returns (enhanced_image, scale_factor)
    """
    h, w = image_bgr.shape[:2]
    scale = 1.0
    # Upscale small images so the face detector can find tiny faces
    if min(h, w) < 640:
        scale = 640 / min(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        image_bgr = cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    # Aggressive CLAHE on L channel of LAB to shatter harsh outdoor shadows
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return enhanced, scale


def get_all_face_data(image_np: np.ndarray) -> list:
    """
    4-pass face detection to catch ALL faces including:
      - Group photos (multiple people)
      - Faces wearing dark glasses / occlusions
      - Side / extreme profile angles
      - Far-away outdoor faces (small relative to image size)
      - AI-generated or heavily processed face images

    Pass 1 - RetinaFace strict      (clear, near, front-facing)
    Pass 2 - RetinaFace lenient     (glasses, hats, cropped edges)
    Pass 3 - OpenCV fallback        (side profiles, poor lighting)
    Pass 4 - CLAHE enhanced image   (outdoor / dim / far-away faces)
    """
    image_bgr = _to_bgr(image_np)
    h_img, w_img = image_np.shape[:2]
    img_area = h_img * w_img

    results = []

    def add_objs(objs, min_coverage=0.0, is_enhanced=False, scale=1.0):
        """Convert raw DeepFace repr objects to our standard dict format."""
        for obj in objs:
            if "embedding" not in obj:
                continue
            fa = obj.get("facial_area", {})
            
            # Divide out the upscaling factor so bounding box coordinates remain
            # relative to the original, unscaled image.
            face_w = int(fa.get("w", w_img * scale) / scale)
            face_h = int(fa.get("h", h_img * scale) / scale)
            x = int(fa.get("x", 0) / scale)
            y = int(fa.get("y", 0) / scale)

            coverage = (face_w * face_h) / img_area if img_area > 0 else 1.0
            if coverage < min_coverage:
                print(f"DEBUG [face-data] skipping tiny face coverage={coverage:.2%}", flush=True)
                continue
            # Extract the actual face region pixels to check for glasses
            has_glasses = False
            lower_embedding = None
            
            # Make sure coordinates are valid before slicing THE ORIGINAL UN-SCALED IMAGE
            if x >= 0 and y >= 0 and face_w > 0 and face_h > 0 and y+face_h <= h_img and x+face_w <= w_img:
                face_crop = image_np[y:y+face_h, x:x+face_w]
                if face_crop.size > 0:
                    has_glasses = detect_glasses(face_crop)
                    if has_glasses:
                        print(f"DEBUG [face-data] Face has glasses, extracting lower face embedding", flush=True)
                        lower_embedding = get_lower_face_encoding(image_np, face_box={'x':x,'y':y,'w':face_w,'h':face_h})

            results.append({
                "full_embedding": obj["embedding"] if not is_enhanced else None,
                "enhanced_embedding": obj["embedding"] if is_enhanced else None,
                "has_glasses": has_glasses,
                "lower_embedding": lower_embedding,
                "face_box": {'x':x,'y':y,'w':face_w,'h':face_h},
            })

    # ── Pass 1: RetinaFace strict ──────────────────────────────────────────
    p1_objs = _represent_faces(image_bgr, DETECTOR_BACKEND, enforce=True)
    add_objs(p1_objs)
    print(f"DEBUG [face-data] pass-1 (retinaface strict): {len(p1_objs)} obj(s)", flush=True)

    # ── Pass 2: RetinaFace lenient — catches glasses/occluded ─────────────
    if not results:
        p2_objs = _represent_faces(image_bgr, DETECTOR_BACKEND, enforce=False)
        add_objs(p2_objs, min_coverage=0.003)
        print(f"DEBUG [face-data] pass-2 (retinaface lenient): {len(p2_objs)} obj(s)", flush=True)

    # ── Pass 3: OpenCV Haar fallback — strong on profiles ─────────────────
    if not results:
        p3_objs = _represent_faces(image_bgr, FALLBACK_DETECTOR, enforce=False)
        add_objs(p3_objs, min_coverage=0.003)
        print(f"DEBUG [face-data] pass-3 (opencv fallback): {len(p3_objs)} obj(s)", flush=True)

    # ── Pass 4: CLAHE + upscale — for outdoor/far-away/dim photos ─────────
    # We ALWAYS run this pass to extract contrast-enhanced embeddings for all faces,
    # as it drastically improves accuracy for ambiguous or low-res outdoor faces.
    enhanced_bgr, scale_factor = _enhance_for_detection(image_bgr)
    p4_objs = _represent_faces(enhanced_bgr, DETECTOR_BACKEND, enforce=False)
    add_objs(p4_objs, min_coverage=0.001, is_enhanced=True, scale=scale_factor)
    print(f"DEBUG [face-data] pass-4 (clahe+retinaface): {len(p4_objs)} obj(s)", flush=True)

    if not results:
        p4b_objs = _represent_faces(enhanced_bgr, FALLBACK_DETECTOR, enforce=False)
        add_objs(p4b_objs, min_coverage=0.001, is_enhanced=True, scale=scale_factor)
        print(f"DEBUG [face-data] pass-4b (clahe+opencv): {len(p4b_objs)} obj(s)", flush=True)

    # Remove any overlapping detections from multiple passes, merging their embeddings
    results = _deduplicate(results)
    print(f"DEBUG [face-data] final unique faces: {len(results)}", flush=True)
    return results


# ─────────────────────── Face comparison ─────────────────────────────────────

def _cosine_dist(a: list, b: list) -> float:
    va = np.array(a, dtype=np.float64)
    vb = np.array(b, dtype=np.float64)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 1.0
    return float(1.0 - np.dot(va, vb) / (na * nb))


def compare_faces(known_encodings, unknown_encoding, tolerance=MATCH_THRESHOLD):
    if not known_encodings or unknown_encoding is None:
        return False

    if isinstance(known_encodings[0], (int, float)):
        known_encodings = [known_encodings]

    for enc in known_encodings:
        dist = _cosine_dist(enc, unknown_encoding)
        print(f"DEBUG: Comparing faces. Distance: {dist:.4f} (Threshold: {tolerance})", flush=True)
        if dist < tolerance:
            return True
    return False


def is_duplicate_registration(
    stored_embeddings: list,
    candidate_embedding: list,
    tolerance: float = MATCH_THRESHOLD,
    min_votes: int = MIN_VOTES_FOR_DUPLICATE
) -> bool:
    if not stored_embeddings or candidate_embedding is None:
        return False

    votes = 0
    for enc in stored_embeddings:
        if not isinstance(enc[0], (int, float)):
            continue
        dist = _cosine_dist(enc, candidate_embedding)
        print(f"DEBUG [vote check] dist={dist:.4f}  votes={votes}/{min_votes}", flush=True)
        if dist < tolerance:
            votes += 1

    is_dup = votes >= min_votes
    print(f"DEBUG [vote check] RESULT: {votes} votes >= {min_votes} -> duplicate={is_dup}", flush=True)
    return is_dup
