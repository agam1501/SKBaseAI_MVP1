import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings
from routes import clients, proposals, taxonomies, tickets

app = FastAPI(title="SKBaseAI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_bearer = HTTPBearer()


@app.on_event("startup")
async def load_jwks():
    """Fetch Supabase public keys on startup for ES256 token verification."""
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
        app.state.jwks = resp.json().get("keys", [])


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Bad token header: {exc}")

    alg = header.get("alg", "HS256")
    kid = header.get("kid")

    if alg == "ES256":
        # Find the matching public key from JWKS
        keys = getattr(app.state, "jwks", [])
        key = next((k for k in keys if k.get("kid") == kid), None)
        if key is None:
            raise HTTPException(status_code=401, detail=f"Unknown key ID: {kid}")
        verify_key = key
        algorithms = ["ES256"]
    else:
        # Legacy HS256
        verify_key = settings.supabase_jwt_secret
        algorithms = ["HS256"]

    try:
        payload = jwt.decode(token, verify_key, algorithms=algorithms, audience="authenticated")
        request.state.user = payload
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(clients.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(tickets.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(proposals.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(taxonomies.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
