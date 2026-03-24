import os
import io
import time
import numpy as np
from PIL import Image
from deepface import DeepFace

def load_image(filepath):
    image = Image.open(filepath).convert("RGB")
    return np.array(image)

def to_bgr(image_np):
    if len(image_np.shape) == 3 and image_np.shape[2] == 3:
        return image_np[:, :, ::-1]
    return image_np

def test_opt():
    # Pick any test image available
    img_files = [f for f in os.listdir(".") if f.endswith(".jpg")]
    if not img_files:
        print("No test images.")
        return
    img_path = img_files[0]
    print(f"Using {img_path}")
    image_np = load_image(img_path)
    image_bgr = to_bgr(image_np)

    # Standard approach (what Face app does now)
    t0 = time.time()
    res1 = DeepFace.represent(img_path=image_bgr, model_name="Facenet512", detector_backend="retinaface", align=True)
    enc1 = res1[0]["embedding"]
    t1 = time.time()
    print(f"Standard represent: {t1-t0:.3f}s")

    # Optimized approach
    t0 = time.time()
    faces = DeepFace.extract_faces(img_path=image_bgr, detector_backend="retinaface", align=True)
    face_img = faces[0]["face"] # This is usually RGB float32 or uint8 array between 0-255 or 0-1
    # Multiply by 255 if it's 0-1
    if face_img.dtype in [np.float32, np.float64] and face_img.max() <= 1.0:
        face_img = (face_img * 255).astype(np.uint8)
    # DeepFace's represent with 'skip' expects BGR if we pass bgr, but since extract_faces returns RGB normalized?
    # Let's just pass the raw crop from original image. To preserve alignment, we should use the aligned face.
    # Actually, DeepFace represent(detector='skip') aligns? No.
    # Let's just try sending face_img to represent as BGR.
    face_bgr = to_bgr(face_img)

    res2 = DeepFace.represent(img_path=face_bgr, model_name="Facenet512", detector_backend="skip")
    enc2 = res2[0]["embedding"]
    t1 = time.time()
    print(f"Extract + Represent('skip'): {t1-t0:.3f}s")

    # Compare
    v1 = np.array(enc1)
    v2 = np.array(enc2)
    dist = 1.0 - np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
    print(f"Distance between standard and optimized: {dist:.6f}")

if __name__ == "__main__":
    test_opt()
