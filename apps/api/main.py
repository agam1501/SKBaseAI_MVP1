import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import inspect

from config import settings
from models import Ticket, TicketProposal, TicketProposalFeedback, TicketTaxonomy, UserRoles
from routes import analytics, clients, proposals, taxonomies, tickets, users
from schemas import FeedbackRead, ProposalRead, TaxonomyRead, TicketRead, UserRoleRead

app = FastAPI(title="SKBaseAI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_bearer = HTTPBearer()


def _assert_schema_subset(orm_model, pydantic_schema):
    orm_cols = {c.key for c in inspect(orm_model).mapper.columns}
    schema_fields = set(pydantic_schema.model_fields.keys())
    missing = schema_fields - orm_cols
    assert not missing, f"{pydantic_schema.__name__} has fields not in ORM: {missing}"


@app.on_event("startup")
async def startup():
    """Fetch Supabase public keys and validate Pydantic/ORM schema alignment."""
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
        app.state.jwks = resp.json().get("keys", [])

    _assert_schema_subset(Ticket, TicketRead)
    _assert_schema_subset(TicketProposal, ProposalRead)
    _assert_schema_subset(TicketProposalFeedback, FeedbackRead)
    _assert_schema_subset(TicketTaxonomy, TaxonomyRead)
    _assert_schema_subset(UserRoles, UserRoleRead)


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
app.include_router(analytics.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(users.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
