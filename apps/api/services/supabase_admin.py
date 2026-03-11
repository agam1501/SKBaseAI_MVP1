import httpx

from config import settings


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


async def invite_user_by_email(email: str, redirect_to: str) -> dict:
    """POST /auth/v1/invite — sends invite email, returns user dict (with id)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/invite",
            params={"redirect_to": redirect_to},
            headers=_headers(),
            json={"email": email},
        )
        resp.raise_for_status()
        return resp.json()


async def list_auth_users() -> list[dict]:
    """GET /auth/v1/admin/users — returns all Supabase auth users."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/admin/users",
            params={"page": 1, "per_page": 1000},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json().get("users", [])
