import sqlite3
import json
from face_utils import _cosine_dist

db = sqlite3.connect('sql_app.db')
c = db.cursor()
encs = c.execute('SELECT username, face_encodings FROM users WHERE face_encodings IS NOT NULL').fetchall()
data = {r[0]: json.loads(r[1]) for r in encs}

if 'Jeeva' in data and 'Ramana' in data:
    enc_j = data['Jeeva']
    enc_r = data['Ramana']
    print("Jeeva views:", [e is not None for e in enc_j])
    print("Ramana views:", [e is not None for e in enc_r])
    dist = _cosine_dist(enc_j[0], enc_r[0])
    print(f"Jeeva front to Ramana front distance: {dist}")
    
    if len(enc_r) > 1 and enc_r[1]:
        print(f"Jeeva front to Ramana left distance: {_cosine_dist(enc_j[0], enc_r[1])}")
    if len(enc_r) > 2 and enc_r[2]:
        print(f"Jeeva front to Ramana right distance: {_cosine_dist(enc_j[0], enc_r[2])}")
else:
    print("Users not found")
