from datetime import datetime, timezone
from hashlib import sha256
from math import floor
import re

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from pymongo.database import Database


class DuplicateEmailError(Exception):
    pass


class AuthRepository:
    """MongoDB persistence for authentication. Keep Mongo queries in this class."""

    def __init__(self, database: Database):
        self.database = database

    def find_user_by_email(self, email: str) -> dict | None:
        return self.database.users.find_one({
            "$or": [
                {"email_normalized": email},
                {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            ],
        })

    def find_user_by_subject(self, subject: str, *, active_only: bool = False) -> dict | None:
        identifiers: list[object] = [subject]
        if ObjectId.is_valid(subject):
            identifiers.append(ObjectId(subject))
        query: dict = {"_id": {"$in": identifiers}}
        if active_only:
            query["$or"] = [{"is_active": True}, {"is_active": {"$exists": False}}]
        return self.database.users.find_one(query)

    def create_user(self, document: dict) -> None:
        existing = self.database.users.find_one(
            {"$or": [
                {"email_normalized": document["email_normalized"]},
                {"email": {"$regex": f"^{re.escape(document['email_normalized'])}$", "$options": "i"}},
            ]},
            {"_id": 1},
        )
        if existing:
            raise DuplicateEmailError
        try:
            self.database.users.insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateEmailError from exc

    def update_password_hash(self, user_id: object, old_hash: str, new_hash: str, updated_at: datetime) -> None:
        self.database.users.update_one(
            {"_id": user_id, "password_hash": old_hash},
            {"$set": {"password_hash": new_hash, "updated_at": updated_at}},
        )

    def set_password_hash(self, user_id: object, new_hash: str, updated_at: datetime) -> None:
        self.database.users.update_one(
            {"_id": user_id},
            {"$set": {"password_hash": new_hash, "updated_at": updated_at}},
        )

    def create_session(self, document: dict) -> None:
        self.database.auth_sessions.insert_one(document)

    def find_session(self, session_id: str, user_id: str | None = None) -> dict | None:
        query: dict = {"_id": session_id}
        if user_id is not None:
            query["user_id"] = user_id
        return self.database.auth_sessions.find_one(query)

    def find_active_session(self, session_id: str, user_id: str, now: datetime) -> dict | None:
        return self.database.auth_sessions.find_one({
            "_id": session_id,
            "user_id": user_id,
            "revoked_at": None,
            "expires_at": {"$gt": now},
        })

    def rotate_refresh_token(
        self,
        *,
        session_id: str,
        user_id: str,
        old_token_hash: str,
        new_token_hash: str,
        now: datetime,
        expires_at: datetime,
    ) -> bool:
        updated = self.database.auth_sessions.find_one_and_update(
            {
                "_id": session_id,
                "user_id": user_id,
                "refresh_token_hash": old_token_hash,
                "revoked_at": None,
                "expires_at": {"$gt": now},
            },
            {"$set": {"refresh_token_hash": new_token_hash, "last_used_at": now, "expires_at": expires_at}},
            return_document=ReturnDocument.AFTER,
        )
        return updated is not None

    def revoke_session(self, session_id: str, user_id: str, now: datetime) -> bool:
        result = self.database.auth_sessions.update_one(
            {"_id": session_id, "user_id": user_id, "revoked_at": None},
            {"$set": {"revoked_at": now, "refresh_token_hash": None}},
        )
        return result.matched_count > 0

    def revoke_user_sessions(self, user_id: str, now: datetime) -> None:
        self.database.auth_sessions.update_many(
            {"user_id": user_id, "revoked_at": None},
            {"$set": {"revoked_at": now, "refresh_token_hash": None}},
        )

    def list_active_sessions(self, user_id: str, now: datetime) -> list[dict]:
        return list(self.database.auth_sessions.find(
            {"user_id": user_id, "revoked_at": None, "expires_at": {"$gt": now}},
            {"created_at": 1, "expires_at": 1, "last_used_at": 1, "user_agent": 1, "ip_address": 1},
        ).sort("created_at", -1))

    def write_audit_event(self, document: dict) -> None:
        self.database.auth_audit_events.insert_one(document)

    def increment_rate_limit(self, key: str, window_seconds: int) -> int:
        now = datetime.now(timezone.utc)
        window_start = floor(now.timestamp() / window_seconds) * window_seconds
        expires_at = datetime.fromtimestamp(window_start + window_seconds * 2, tz=timezone.utc)
        record_id = sha256(f"{key}:{window_start}".encode("utf-8")).hexdigest()
        try:
            self.database.auth_rate_limits.update_one(
                {"_id": record_id},
                {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": expires_at}},
                upsert=True,
            )
        except DuplicateKeyError:
            self.database.auth_rate_limits.update_one({"_id": record_id}, {"$inc": {"count": 1}})
        record = self.database.auth_rate_limits.find_one({"_id": record_id}, {"count": 1})
        return record["count"] if record else 0

    def create_password_reset_token(self, token_hash: str, user_id: str, now: datetime, expires_at: datetime) -> None:
        self.database.password_reset_tokens.insert_one({
            "_id": token_hash,
            "user_id": user_id,
            "created_at": now,
            "expires_at": expires_at,
            "consumed_at": None,
        })

    def consume_password_reset_token(self, token_hash: str, now: datetime) -> dict | None:
        return self.database.password_reset_tokens.find_one_and_update(
            {"_id": token_hash, "consumed_at": None, "expires_at": {"$gt": now}},
            {"$set": {"consumed_at": now}},
            return_document=ReturnDocument.BEFORE,
        )

    def delete_user_password_reset_tokens(self, user_id: str) -> None:
        self.database.password_reset_tokens.delete_many({"user_id": user_id})
