import os

from supabase import Client, create_client


def get_supabase_client() -> Client:
    """Create a Supabase client from environment variables."""

    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

    return create_client(url, key)
