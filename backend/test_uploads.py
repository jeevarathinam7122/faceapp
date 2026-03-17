import os
import json
import face_utils
from deepface import DeepFace

uploads = os.listdir('uploads')
results = {}
for f in uploads:
    if not f.lower().endswith(('.png', '.jpg', '.jpeg')): continue
    path = os.path.join('uploads', f)
    with open(path, 'rb') as file:
        img_np = face_utils.load_image_file(file.read())
    
    try:
        faces = face_utils.get_all_face_data(img_np)
        results[f] = {
            "num_faces": len(faces),
            "glasses": [face.get("has_glasses") for face in faces],
            "bbox": [face.get("face_box") for face in faces]
        }
    except Exception as e:
        results[f] = {"error": str(e)}

with open('test_results.json', 'w') as out:
    json.dump(results, out, indent=2)
