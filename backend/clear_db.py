from database import SessionLocal
from models import User, Post

db = SessionLocal()
try:
    print("Deleting all posts...")
    db.query(Post).delete()
    print("Deleting all users...")
    db.query(User).delete()
    db.commit()
    print("Successfully deleted all users and user data from the database.")
except Exception as e:
    db.rollback()
    print("Failed to clear database:", e)
finally:
    db.close()
