"""Live Row Level Security check with two real accounts. Needs a Supabase project with the migration applied
and Email auth enabled. Run: RLS_TEST=1 pytest -m live   (creates and then deletes two throwaway users)."""
import os
import uuid

import pytest

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.environ.get("RLS_TEST") != "1", reason="set RLS_TEST=1 to run")]


@pytest.fixture(scope="module")
def two_users():
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv()
    url, secret, public = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
    admin = create_client(url, secret)
    made = []
    for _ in range(2):
        email, password = f"rls-{uuid.uuid4().hex[:8]}@example.com", uuid.uuid4().hex
        user = admin.auth.admin.create_user({"email": email, "password": password, "email_confirm": True}).user
        c = create_client(url, public)
        c.auth.sign_in_with_password({"email": email, "password": password})
        made.append((user.id, c))
    yield made
    for uid, _ in made:
        admin.auth.admin.delete_user(uid)


def test_user_a_cannot_touch_user_b(two_users):
    (a_id, a), (b_id, b) = two_users
    b.table("registration_answers").insert({"question": "Secret question?", "answer": "B only"}).execute()
    for table in ("profiles", "user_preferences", "registration_answers", "saved_searches", "event_alerts", "registrations"):
        assert a.table(table).select("*").eq("user_id", b_id).execute().data == [], table
    assert a.table("profiles").update({"full_name": "hacked"}).eq("user_id", b_id).execute().data == []
    with pytest.raises(Exception):  # cannot write rows owned by someone else
        a.table("registration_answers").insert({"user_id": b_id, "question": "Injected?", "answer": "x"}).execute()


def test_browser_clients_cannot_write_catalogue_or_queue(two_users):
    (_, a), _ = two_users
    with pytest.raises(Exception):
        a.table("events").insert({"source_id": 1, "url": "https://evil.example", "title": "Fake"}).execute()
    with pytest.raises(Exception):
        a.table("automation_jobs").insert({"kind": "discovery"}).execute()
    assert a.table("event_sources").select("*").execute().data == []  # admin only


def test_cannot_change_email_or_self_confirm(two_users):
    (a_id, a), _ = two_users
    with pytest.raises(Exception):
        a.table("profiles").update({"email": "x@evil.example"}).eq("user_id", a_id).execute()
    with pytest.raises(Exception):
        a.table("registrations").insert({"event_id": 1, "status": "confirmed"}).execute()
