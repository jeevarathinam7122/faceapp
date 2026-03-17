from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer
import bcrypt as _bcrypt

# SECRET_KEY should be in .env, but hardcoding for demo simplicity
SECRET_KEY = "supersecretkey"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def _prepare_password(password: str) -> bytes:
    """
    Bcrypt supports a maximum of 72 bytes.
    Encode to UTF-8 and truncate at byte level to prevent errors with
    long passwords or passwords containing multi-byte Unicode characters.
    """
    encoded = password.encode("utf-8")
    return encoded[:72]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pw_bytes = _prepare_password(plain_password)
    hash_bytes = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    return _bcrypt.checkpw(pw_bytes, hash_bytes)


def get_password_hash(password: str) -> str:
    pw_bytes = _prepare_password(password)
    salt = _bcrypt.gensalt(rounds=6)
    return _bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
