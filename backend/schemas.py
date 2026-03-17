from pydantic import BaseModel
from typing import List, Optional
import datetime

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool = True
    face_encodings: Optional[List[List[float]]] = None

    class Config:
        orm_mode = True

class PostBase(BaseModel):
    image_url: str

class PostCreate(PostBase):
    pass

class Post(PostBase):
    id: int
    uploader_id: int
    uploader: UserBase
    is_active: bool
    created_at: datetime.datetime

    class Config:
        orm_mode = True

class PermissionRequestBase(BaseModel):
    post_id: int
    tagged_user_id: int

class PermissionRequest(PermissionRequestBase):
    id: int
    status: str
    face_box: Optional[List[int]] = None
    created_at: Optional[datetime.datetime] = None
    post: Post  # Include nested post details (image + uploader)
    tagged_user: UserBase  # Include tagged user details for "Sent" tab

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
