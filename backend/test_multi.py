import cv2
import face_utils

print("Loading image...")
img = cv2.imread("test_group.jpg")
img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

print("Running get_all_face_data...")
faces = face_utils.get_all_face_data(img_rgb)

print(f"Found faces: {len(faces)}")
for i, f in enumerate(faces):
    box = f.get("face_box", {})
    print(f"Face {i}: coverage={(box.get('w',0)*box.get('h',0))/(img.shape[0]*img.shape[1]):.2%}, box={box}")

print("Done")
