# FaceSocial App

A social media application with face permission features.

## Prerequisites

- Python 3.8+
- Node.js 18+
- Visual Studio C++ Build Tools (optional, for dlib support if needed)

## Setup

### Backend

1. Navigate to `backend` directory.
2. Create virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate virtual environment:
   - Windows: `venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Run server:
   ```bash
   python -m uvicorn main:app --reload
   ```
   Server runs at `http://localhost:8000`.

### Frontend

1. Navigate to `frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run development server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:3000`.

## Features

- **User Registration**: Register with username, email, password, and face photo.
- **Login**: Secure JWT authentication.
- **Feed**: View posts from other users.
- **Upload**: Upload photos. If a face matches a registered user, permission is requested.
- **Permissions**: Approve or deny photos of you uploaded by others.

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite, OpenCV (Face Detection).
- **Frontend**: Next.js, Tailwind CSS, Shadcn UI (Components).
