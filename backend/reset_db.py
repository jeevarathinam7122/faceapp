from database import SessionLocal, engine, Base
import models

def reset_database():
    db = SessionLocal()
    try:
        # Delete all records from all tables
        db.query(models.Post).delete()
        db.query(models.User).delete()
        
        db.commit()
        print("Successfully removed all users and data. The app is fresh!")
    except Exception as e:
        db.rollback()
        print(f"Error resetting database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_database()
