import json
import face_utils
from deepface import DeepFace

path = 'uploads/b19a3497-ed65-446b-a265-f8e5aefdb8b2.jpeg'
with open(path, 'rb') as f:
    img_np = face_utils.load_image_file(f.read())
    
backends = ['opencv', 'mtcnn', 'retinaface', 'ssd', 'yunet', 'centerface']
results = {}
for b in backends:
    try:
        res = DeepFace.extract_faces(img_path=img_np, detector_backend=b, enforce_detection=True)
        results[b] = f'SUCCESS - {len(res)} faces. Bbox: {res[0]["facial_area"]}'
    except Exception as e:
        results[b] = f'FAILED - {str(e)[:150]}'

with open('detector_results.json', 'w') as out:
    json.dump(results, out, indent=2)
