from pymongo import ASCENDING, MongoClient
from pymongo.database import Database

from app.core.config import Settings


def create_mongo_client(settings: Settings) -> MongoClient:
    return MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000, tz_aware=True)


def initialize_indexes(database: Database) -> None:
    database.users.create_index(
        [("email_normalized", ASCENDING)],
        unique=True,
        partialFilterExpression={"email_normalized": {"$type": "string"}},
        name="users_email_unique",
    )
    database.auth_sessions.create_index([("user_id", ASCENDING), ("revoked_at", ASCENDING)], name="sessions_by_user")
    database.auth_sessions.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="sessions_expiry")
    database.auth_rate_limits.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="auth_rate_expiry")
    database.auth_audit_events.create_index([("created_at", ASCENDING)], expireAfterSeconds=60 * 60 * 24 * 180, name="audit_retention")
    database.password_reset_tokens.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="password_reset_expiry")
    database.team_memberships.create_index(
        [("team_id", ASCENDING), ("user_id", ASCENDING)], unique=True, name="team_membership_unique",
    )
    # Keep this definition aligned with the existing local index; MongoDB
    # rejects same-name indexes when their options (including partial filters) differ.
    database.rescue_teams.create_index(
        [("code", ASCENDING)], unique=True, name="rescue_teams_code_unique",
    )
    database.rescue_team_units.create_index(
        [("team_id", ASCENDING), ("name", ASCENDING)], unique=True, name="team_units_name_unique",
    )
    database.alerts.create_index([("reporter_id", ASCENDING), ("created_at", -1)], name="alerts_by_reporter")


