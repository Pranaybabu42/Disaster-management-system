from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo.database import Database

from app.api.v1.dependencies.auth import get_current_user, get_database, require_roles
from app.modules.teams.excel_import import MAX_FILE_BYTES, parse_team_workbook
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pymongo.errors import PyMongoError


router = APIRouter(prefix="/emergencies", tags=["emergencies"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


class EmergencyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    emergency_type: Literal["FLOOD", "FIRE", "EARTHQUAKE", "MEDICAL_EMERGENCY", "LANDSLIDE", "OTHER"]
    description: str = Field(min_length=5, max_length=500)
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    people_affected: int = Field(ge=1, le=5000)
    location_note: str = Field(default="", max_length=250)


class RescueTeamCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    team_type: Literal["medical", "search_and_rescue", "fire", "water_rescue", "logistics", "other"]
    base_address: str = Field(min_length=3, max_length=250)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    authorized_strength: int = Field(ge=1, le=10000)
    current_member_count: int = Field(ge=0, le=10000)
    available_member_count: int = Field(ge=0, le=10000)

    @model_validator(mode="after")
    def validate_strength_counts(self):
        if self.current_member_count > self.authorized_strength:
            raise ValueError("Current headcount cannot exceed authorized team capacity")
        if self.available_member_count > self.current_member_count:
            raise ValueError("Available headcount cannot exceed current team headcount")
        return self


class RescueTeamUnitCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    unit_type: Literal["medical", "search_and_rescue", "fire", "water_rescue", "logistics", "communications", "evacuation", "other"]
    status: Literal["available", "deployed", "offline"] = "available"
    capabilities: list[str] = Field(default_factory=list, max_length=30)
    authorized_strength: int = Field(ge=1, le=10000)
    current_member_count: int = Field(ge=0, le=10000)
    available_member_count: int = Field(ge=0, le=10000)

    @model_validator(mode="after")
    def validate_strength_counts(self):
        if self.current_member_count > self.authorized_strength:
            raise ValueError("Current headcount cannot exceed unit capacity")
        if self.available_member_count > self.current_member_count:
            raise ValueError("Available headcount cannot exceed current unit headcount")
        return self


class RescueTeamMemberCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str = Field(min_length=3, max_length=254)
    unit_id: str = Field(min_length=1, max_length=80)
    member_role: str = Field(default="responder", min_length=2, max_length=40)
    years_experience: float = Field(default=0, ge=0, le=80)
    rescues_completed: int = Field(default=0, ge=0, le=100000)
    capabilities: list[str] = Field(default_factory=list, max_length=30)
    rating_average: float | None = Field(default=None, ge=0, le=5)
    rating_count: int = Field(default=0, ge=0)
    member_status: Literal["active", "inactive"] = "active"
    availability: Literal["available", "deployed", "off-duty"] = "off-duty"


class ImportedTeamUnit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    unit_type: Literal["medical", "search_and_rescue", "fire", "water_rescue", "logistics", "communications", "evacuation", "other"]
    status: Literal["available", "deployed", "offline"] = "available"
    capabilities: list[str] = Field(default_factory=list, max_length=30)
    authorized_strength: int = Field(ge=1, le=10000)
    current_member_count: int = Field(ge=0, le=10000)
    available_member_count: int = Field(ge=0, le=10000)
    rating_average: float | None = Field(default=None, ge=0, le=5)
    rating_count: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_unit_counts(self):
        if self.current_member_count > self.authorized_strength:
            raise ValueError("Internal team headcount cannot exceed its capacity")
        if self.available_member_count > self.current_member_count:
            raise ValueError("Available internal team headcount cannot exceed its current headcount")
        return self


class ImportedTeam(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    team_type: Literal["medical", "search_and_rescue", "fire", "water_rescue", "logistics", "other"]
    base_address: str = Field(min_length=3, max_length=250)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    authorized_strength: int = Field(ge=1, le=10000)
    current_member_count: int = Field(ge=0, le=10000)
    available_member_count: int = Field(ge=0, le=10000)
    status: Literal["available", "deployed", "offline"] = "available"
    rating_average: float | None = Field(default=None, ge=0, le=5)
    rating_count: int = Field(default=0, ge=0)
    units: list[ImportedTeamUnit] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_team_counts(self):
        if self.current_member_count > self.authorized_strength:
            raise ValueError("Team headcount cannot exceed its authorized capacity")
        if self.available_member_count > self.current_member_count:
            raise ValueError("Available team headcount cannot exceed its current headcount")
        names = [unit.name.casefold() for unit in self.units]
        if len(names) != len(set(names)):
            raise ValueError("Internal team names must be unique within each rescue team")
        return self


class TeamImportBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teams: list[ImportedTeam] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_unique_team_names(self):
        names = [team.name.casefold() for team in self.teams]
        if len(names) != len(set(names)):
            raise ValueError("Rescue team names must be unique in the import")
        return self


def public_alert(document: dict) -> dict:
    return {
        "emergency_id": document["_id"],
        "reporter_id": document["reporter_id"],
        "emergency_type": document["emergency_type"],
        "description": document.get("description", ""),
        "priority": document.get("priority", "MEDIUM"),
        "people_affected": document.get("people_affected", 1),
        "location_note": document.get("location_note", ""),
        "status": document.get("status", "PENDING_ASSIGNMENT"),
        "location": document["location"],
        "created_at": document["created_at"],
        "updated_at": document["updated_at"],
    }


def mongo_safe(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: mongo_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [mongo_safe(item) for item in value]
    return value


@router.post("")
def create_emergency(
    payload: EmergencyInput,
    user: dict = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> dict:
    now = datetime.now(timezone.utc)
    document = {
        "_id": uuid4().hex,
        "reporter_id": str(user["_id"]),
        "emergency_type": payload.emergency_type,
        "description": payload.description.strip(),
        "priority": payload.priority,
        "people_affected": payload.people_affected,
        "location_note": payload.location_note.strip(),
        "status": "PENDING_ASSIGNMENT",
        "location": {"type": "Point", "coordinates": [payload.longitude, payload.latitude]},
        "created_at": now,
        "updated_at": now,
    }
    database.alerts.insert_one(document)
    return public_alert(document)


@router.get("/mine")
def list_my_emergencies(
    user: dict = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> list[dict]:
    records = database.alerts.find({"reporter_id": str(user["_id"])}).sort("created_at", -1).limit(200)
    return [public_alert(document) for document in records]


@admin_router.get("/users")
def list_users(
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> list[dict]:
    projection = {"password_hash": 0, "hashed_password": 0}
    users = database.users.find({}, projection).sort("created_at", -1).limit(500)
    return [{
        "id": str(user["_id"]),
        "full_name": user.get("full_name") or user.get("name") or user.get("email", "Unknown"),
        "email": user.get("email", ""),
        "roles": user.get("roles", ["user"]),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    } for user in users]


@admin_router.get("/alerts")
def list_all_emergencies(
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> list[dict]:
    records = list(database.alerts.find().sort("created_at", -1).limit(500))
    reporter_ids = list({record.get("reporter_id") for record in records if record.get("reporter_id")})
    reporters = database.users.find({"_id": {"$in": reporter_ids}}, {"full_name": 1, "email": 1, "name": 1})
    reporter_by_id = {str(user["_id"]): user for user in reporters}
    return [
        public_alert(document) | {
            "reporter_name": reporter_by_id.get(document.get("reporter_id"), {}).get("full_name")
            or reporter_by_id.get(document.get("reporter_id"), {}).get("name", "Unknown user"),
            "reporter_email": reporter_by_id.get(document.get("reporter_id"), {}).get("email", ""),
        }
        for document in records
    ]


@admin_router.get("/teams")
def list_rescue_teams(
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> list[dict]:
    teams = database.rescue_teams.find().sort("name", 1).limit(500)
    return [mongo_safe(
        {key: value for key, value in team.items() if key != "_id"}
        | {"id": str(team["_id"]), "unit_count": database.rescue_team_units.count_documents({"team_id": str(team["_id"])})}
    ) for team in teams]


def find_team(database: Database, team_id: str) -> dict | None:
    team = database.rescue_teams.find_one({"_id": team_id})
    if team is None and ObjectId.is_valid(team_id):
        team = database.rescue_teams.find_one({"_id": ObjectId(team_id)})
    return team


@admin_router.get("/teams/{team_id}")
def get_rescue_team(
    team_id: str,
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    team = find_team(database, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Rescue team not found")
    team_key = str(team["_id"])
    units = list(database.rescue_team_units.find({"team_id": team_key}).sort("name", 1).limit(500))
    memberships = list(database.team_memberships.find({"team_id": team_key}).limit(1000))
    member_ids = [membership.get("user_id") for membership in memberships if membership.get("user_id") is not None]
    account_ids: list[object] = list(member_ids)
    account_ids.extend(ObjectId(value) for value in member_ids if isinstance(value, str) and ObjectId.is_valid(value))
    profiles = database.users.find({"_id": {"$in": account_ids}}, {"full_name": 1, "name": 1, "email": 1}) if account_ids else []
    profile_by_id = {str(profile["_id"]): profile for profile in profiles}
    unit_names = {str(unit["_id"]): unit.get("name", "") for unit in units}
    members = []
    for membership in memberships:
        profile = profile_by_id.get(str(membership.get("user_id")), {})
        members.append({
            "id": str(membership.get("_id", membership.get("user_id", ""))),
            "user_id": str(membership.get("user_id", "")),
            "full_name": profile.get("full_name") or profile.get("name") or profile.get("email", "Unknown user"),
            "email": profile.get("email", ""),
            "member_role": membership.get("member_role", "responder"),
            "member_status": membership.get("member_status", "active"),
            "availability": membership.get("availability", "off-duty"),
            "unit_name": unit_names.get(str(membership.get("unit_id", "")), "Unassigned to internal team"),
            "years_experience": membership.get("years_experience"),
            "rescues_completed": membership.get("rescues_completed"),
            "capabilities": membership.get("capabilities", []),
            "rating_average": membership.get("rating_average"),
            "rating_count": membership.get("rating_count", 0),
        })
    return mongo_safe({
        "team": {key: value for key, value in team.items() if key != "_id"} | {"id": team_key},
        "units": [{key: value for key, value in unit.items() if key != "_id"} | {"id": str(unit["_id"])} for unit in units],
        "members": members,
    })


@admin_router.post("/teams/{team_id}/units", status_code=status.HTTP_201_CREATED)
def create_rescue_team_unit(
    team_id: str,
    payload: RescueTeamUnitCreateInput,
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    team = find_team(database, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Rescue team not found")
    now = datetime.now(timezone.utc)
    document = {
        "_id": uuid4().hex,
        "team_id": str(team["_id"]),
        "name": payload.name,
        "unit_type": payload.unit_type,
        "status": payload.status,
        "capabilities": payload.capabilities,
        "authorized_strength": payload.authorized_strength,
        "current_member_count": payload.current_member_count,
        "available_member_count": payload.available_member_count,
        "rating_average": None,
        "rating_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    database.rescue_team_units.insert_one(document)
    return mongo_safe({key: value for key, value in document.items() if key != "_id"} | {"id": document["_id"]})


@admin_router.post("/teams/{team_id}/members", status_code=status.HTTP_201_CREATED)
def create_or_update_rescue_team_member(
    team_id: str,
    payload: RescueTeamMemberCreateInput,
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    team = find_team(database, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Rescue team not found")
    account = database.users.find_one({"email_normalized": payload.email.casefold()}) or database.users.find_one({"email": payload.email})
    if account is None:
        raise HTTPException(status_code=404, detail="No account uses that email. Create the account first.")
    if not account.get("is_active", True):
        raise HTTPException(status_code=422, detail="The selected account is inactive.")
    if "admin" in account.get("roles", []):
        raise HTTPException(status_code=422, detail="An administrator account cannot be added as a rescue-team member.")
    database.users.update_one({"_id": account["_id"]}, {"$addToSet": {
        "roles": "responder",
        "scopes": {"$each": ["response:read", "response:update"]},
    }})
    team_key = str(team["_id"])
    unit = database.rescue_team_units.find_one({"_id": payload.unit_id, "team_id": team_key})
    if unit is None and ObjectId.is_valid(payload.unit_id):
        unit = database.rescue_team_units.find_one({"_id": ObjectId(payload.unit_id), "team_id": team_key})
    if unit is None:
        raise HTTPException(status_code=422, detail="Choose an internal team belonging to this rescue team.")
    user_key = str(account["_id"])
    existing = database.team_memberships.find_one({"team_id": team_key, "user_id": user_key})
    memberships = list(database.team_memberships.find({"team_id": team_key}))
    active_team_members = [item for item in memberships if item.get("member_status", "active") == "active" and item.get("user_id") != user_key]
    if payload.member_status == "active" and len(active_team_members) >= int(team.get("authorized_strength", 0)):
        raise HTTPException(status_code=422, detail="The rescue team is at its authorized capacity.")
    unit_members = [item for item in memberships if str(item.get("unit_id", "")) == str(unit["_id"]) and item.get("member_status", "active") == "active" and item.get("user_id") != user_key]
    if payload.member_status == "active" and len(unit_members) >= int(unit.get("authorized_strength", 0)):
        raise HTTPException(status_code=422, detail="The internal team is at its authorized capacity.")
    now = datetime.now(timezone.utc)
    membership = {
        "team_id": team_key,
        "user_id": user_key,
        "unit_id": str(unit["_id"]),
        "member_role": payload.member_role,
        "member_status": payload.member_status,
        "availability": payload.availability,
        "years_experience": payload.years_experience,
        "rescues_completed": payload.rescues_completed,
        "capabilities": payload.capabilities,
        "rating_average": payload.rating_average,
        "rating_count": payload.rating_count,
        "updated_at": now,
    }
    database.team_memberships.update_one(
        {"team_id": team_key, "user_id": user_key},
        {"$set": membership, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    refreshed_memberships = list(database.team_memberships.find({"team_id": team_key}))
    active_members = [item for item in refreshed_memberships if item.get("member_status", "active") == "active"]
    available_count = sum(1 for item in active_members if item.get("availability") == "available")
    database.rescue_teams.update_one({"_id": team["_id"]}, {"$set": {
        "current_member_count": len(active_members),
        "available_member_count": available_count,
        "updated_at": now,
    }})
    unit_active_members = [item for item in active_members if str(item.get("unit_id", "")) == str(unit["_id"])]
    database.rescue_team_units.update_one({"_id": unit["_id"]}, {"$set": {
        "current_member_count": len(unit_active_members),
        "available_member_count": sum(1 for item in unit_active_members if item.get("availability") == "available"),
        "updated_at": now,
    }})
    if existing and str(existing.get("unit_id", "")) != str(unit["_id"]):
        old_unit = next((item for item in database.rescue_team_units.find({"team_id": team_key}) if str(item["_id"]) == str(existing.get("unit_id", ""))), None)
        if old_unit is not None:
            old_unit_members = [item for item in active_members if str(item.get("unit_id", "")) == str(old_unit["_id"])]
            database.rescue_team_units.update_one({"_id": old_unit["_id"]}, {"$set": {
                "current_member_count": len(old_unit_members),
                "available_member_count": sum(1 for item in old_unit_members if item.get("availability") == "available"),
                "updated_at": now,
            }})
    return {"member_id": user_key, "unit_name": unit.get("name", ""), "message": "Rescue-team member profile saved."}


@admin_router.post("/teams", status_code=status.HTTP_201_CREATED)
def create_rescue_team(
    payload: RescueTeamCreateInput,
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    now = datetime.now(timezone.utc)
    team_id = uuid4().hex
    document = {
        "_id": team_id,
        "name": payload.name,
        "code": f"TEAM-{uuid4().hex[:6].upper()}",
        "team_type": payload.team_type,
        "base_location": {"type": "Point", "coordinates": [payload.longitude, payload.latitude]},
        "base_address": payload.base_address,
        "authorized_strength": payload.authorized_strength,
        "current_member_count": payload.current_member_count,
        "available_member_count": payload.available_member_count,
        "status": "available" if payload.available_member_count else "offline",
        "rating_average": None,
        "rating_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    database.rescue_teams.insert_one(document)
    return mongo_safe({key: value for key, value in document.items() if key != "_id"} | {"id": team_id})


@admin_router.post("/teams/import-preview")
async def preview_team_workbook(
    request: Request,
    _admin: dict = Depends(require_roles("admin")),
) -> dict:
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="The Excel file must be 10 MB or smaller")
    chunks: list[bytes] = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="The Excel file must be 10 MB or smaller")
        chunks.append(chunk)
    try:
        return parse_team_workbook(b"".join(chunks))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@admin_router.post("/teams/import", status_code=status.HTTP_201_CREATED)
def import_rescue_teams(
    payload: TeamImportBatch,
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    now = datetime.now(timezone.utc)
    team_documents = []
    unit_documents = []
    for imported in payload.teams:
        team_id = uuid4().hex
        team_documents.append({
            "_id": team_id,
            "name": imported.name,
            "code": f"TEAM-{uuid4().hex[:6].upper()}",
            "team_type": imported.team_type,
            "base_location": {"type": "Point", "coordinates": [imported.longitude, imported.latitude]},
            "base_address": imported.base_address,
            "authorized_strength": imported.authorized_strength,
            "current_member_count": imported.current_member_count,
            "available_member_count": imported.available_member_count,
            "status": imported.status,
            "rating_average": imported.rating_average,
            "rating_count": imported.rating_count,
            "created_at": now,
            "updated_at": now,
        })
        for unit in imported.units:
            unit_documents.append({
                "_id": uuid4().hex,
                "team_id": team_id,
                "name": unit.name,
                "unit_type": unit.unit_type,
                "status": unit.status,
                "capabilities": unit.capabilities,
                "authorized_strength": unit.authorized_strength,
                "current_member_count": unit.current_member_count,
                "available_member_count": unit.available_member_count,
                "rating_average": unit.rating_average,
                "rating_count": unit.rating_count,
                "created_at": now,
                "updated_at": now,
            })
    team_ids = [team["_id"] for team in team_documents]
    try:
        database.rescue_teams.insert_many(team_documents)
        if unit_documents:
            database.rescue_team_units.insert_many(unit_documents)
    except PyMongoError:
        database.rescue_team_units.delete_many({"team_id": {"$in": team_ids}})
        database.rescue_teams.delete_many({"_id": {"$in": team_ids}})
        raise
    return {"teams_created": len(team_documents), "internal_teams_created": len(unit_documents)}


@admin_router.get("/assignments/active")
def list_active_assignments(
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> list[dict]:
    active = {"$nin": ["completed", "declined", "cancelled", "resolved"]}
    assignments = database.assignments.find({"status": active}).sort("updated_at", -1).limit(500)
    return [mongo_safe({key: value for key, value in item.items() if key != "_id"} | {"id": str(item["_id"])}) for item in assignments]


@admin_router.get("/summary")
def admin_summary(
    _admin: dict = Depends(require_roles("admin")),
    database: Database = Depends(get_database),
) -> dict:
    return {
        "users": database.users.count_documents({}),
        "alerts": database.alerts.count_documents({}),
        "open_alerts": database.alerts.count_documents({"status": {"$nin": ["RESOLVED", "CANCELLED"]}}),
        "rescue_teams": database.rescue_teams.count_documents({}),
        "ongoing_assignments": database.assignments.count_documents({"status": {"$nin": ["completed", "declined", "cancelled", "resolved"]}}),
    }
