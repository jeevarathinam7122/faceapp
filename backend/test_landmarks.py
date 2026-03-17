import os
import face_utils
from deepface import DeepFace

uploads = [f for f in os.listdir('uploads') if f.lower().endswith(('.jpg', '.jpeg', '.png'))]

print("--- LANDMARK ANALYSIS ---")
for f in uploads:
    path = os.path.join('uploads', f)
    with open(path, 'rb') as file:
        img_np = face_utils.load_image_file(file.read())
    
    try:
        res = DeepFace.extract_faces(img_path=img_np, detector_backend='retinaface', enforce_detection=True)
        fa = res[0]['facial_area']
        
        le = fa.get('left_eye')
        re = fa.get('right_eye')
        nose = fa.get('nose')
        x, w, h = fa['x'], fa['w'], fa['h']
        
        if le and re and nose:
            # RetinaFace returns (x, y)
            lex, ley = le
            rex, rey = re
            nx, ny = nose
            
            # Eye center
            ec_x = (lex + rex) / 2
            
            # Distance from nose to left eye vs nose to right eye
            dist_left = abs(nx - lex)
            dist_right = abs(nx - rex)
            
            # Ratio of left-dist vs right-dist
            # If front facing, ratio ~ 1.0
            # If looking Left (their left, viewer's right), nose is closer to their LEFT eye (viewer's right eye = le)
            ratio = dist_left / dist_right if dist_right > 0 else 999
            
            # Bounding box offset
            box_cx = x + w / 2
            offset = (ec_x - box_cx) / w
            
            print(f"{f[:8]}: Bbox Offset={offset:.3f} | Nose/Eyes Ratio (left/right)={ratio:.3f} | Width/Height={w/h:.2f}")
    except Exception as e:
        pass
