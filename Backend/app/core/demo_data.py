from datetime import datetime, timezone

from pymongo.database import Database

from app.core.config import Settings
from app.modules.auth.security import build_password_hasher, hash_password


DEMO_USERS = (
    {
        "_id": "demo-admin-account",
        "email": "admin@rescuegrid.local",
        "full_name": "RescueGrid Admin",
        "password": "AdminDemo!2026",
        "roles": ["admin"],
        "scopes": ["profile:read:self", "profile:write:self", "operations:manage"],
    },
    {
        "_id": "demo-user-account",
        "email": "user@rescuegrid.local",
        "full_name": "Community User",
        "password": "UserDemo!2026",
        "roles": ["user"],
        "scopes": ["profile:read:self", "profile:write:self"],
    },
    {
        "_id": "demo-responder-account",
        "email": "responder@rescuegrid.local",
        "full_name": "Rescue Team Responder",
        "password": "RescueDemo!2026",
        "roles": ["responder"],
        "scopes": ["profile:read:self", "profile:write:self", "response:read", "response:update"],
    },
)


def seed_demo_data(database: Database, settings: Settings) -> None:
    """Create local demo records once; never overwrite existing account credentials."""
    now = datetime.now(timezone.utc)
    hasher = build_password_hasher(settings)
    for demo in DEMO_USERS:
        if database.users.find_one({"_id": demo["_id"]}, {"_id": 1}):
            continue
        database.users.update_one(
            {"_id": demo["_id"]},
            {"$setOnInsert": {
                "_id": demo["_id"],
                "email": demo["email"],
                "email_normalized": demo["email"],
                "full_name": demo["full_name"],
                "password_hash": hash_password(demo["password"], hasher),
                "roles": demo["roles"],
                "scopes": demo["scopes"],
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }},
            upsert=True,
        )

    team_id = "demo-rescue-team"
    database.rescue_teams.update_one(
        {"_id": team_id},
        {"$setOnInsert": {
            "_id": team_id,
            "name": "Central Rescue Team",
            "code": "DEMO-TEAM-01",
            "team_type": "search_and_rescue",
            "base_location": {"type": "Point", "coordinates": [78.4867, 17.3850]},
            "base_address": "Hyderabad (demo location)",
            "authorized_strength": 12,
            "current_member_count": 1,
            "available_member_count": 1,
            "status": "available",
            "created_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
    database.team_memberships.update_one(
        {"team_id": team_id, "user_id": "demo-responder-account"},
        {"$setOnInsert": {
            "team_id": team_id,
            "user_id": "demo-responder-account",
            "member_role": "team_lead",
            "member_status": "active",
            "availability": "available",
            "joined_at": now,
            "created_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
