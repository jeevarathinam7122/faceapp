from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, posts, users

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

@app.on_event("startup")
def preload_models():
    print("Pre-loading DeepFace models into memory...")
    try:
        import numpy as np
        from face_utils import process_single_face
        # Run a dummy image through the pipeline to strictly force 
        # DeepFace to load and compile both RetinaFace and Facenet512.
        dummy_img = np.zeros((224, 224, 3), dtype=np.uint8)
        process_single_face(dummy_img, expected_angle="front")
        print("Models loaded successfully.")
    except Exception as e:
        print(f"Failed to preload models: {e}")
# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(users.router)

@app.get("/")
def read_root():
    return {"message": "Face App Backend Running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
