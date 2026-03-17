import face_utils
import os
import cv2
import numpy as np

# Load the debug image saved by auth.py
img_path = "debug_last_scan.jpg"
if not os.path.exists(img_path):
    print("DEBUG IMAGE NOT FOUND!")
    exit(1)

print(f"Loading {img_path}...")
with open(img_path, "rb") as f:
    content = f.read()

# Load using face_utils logic
try:
    image_np = face_utils.load_image_file(content)
    print(f"Image loaded. Shape: {image_np.shape}")
except Exception as e:
    print(f"Load failed: {e}")
    exit(1)

# Try detection
print("Attempting get_face_encoding...")
try:
    encoding = face_utils.get_face_encoding(image_np)
    if encoding is None:
        print("RESULT: None (No face detected)")
    else:
        print("RESULT: Success! Encoding generated.")
except Exception as e:
    print(f"RESULT: CRASHED! Error: {e}")
