from io import BytesIO
import posixpath
import re
from zipfile import BadZipFile, ZipFile
import xml.etree.ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
MAX_ROWS = 1000

ALIASES = {
    "team_name": ("teamname", "rescueteam", "parentteam", "name"),
    "team_type": ("teamtype", "rescueteamtype", "parentteamtype"),
    "base_address": ("baseaddress", "baselocation", "location", "address"),
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon", "lng"),
    "authorized_strength": ("authorizedstrength", "teamcapacity", "capacity"),
    "current_member_count": ("currentmembercount", "currentmembers", "currentpeople", "teamheadcount", "headcount"),
    "available_member_count": ("availablemembercount", "availablemembers", "availablepeople"),
    "team_status": ("teamstatus", "rescueteamstatus"),
    "rating_average": ("teamrating", "ratingaverage", "overallrating"),
    "rating_count": ("teamratingcount", "ratingcount"),
    "unit_name": ("internalteamname", "unitname", "internalteam"),
    "unit_type": ("internalteamtype", "unittype", "internaltype"),
    "unit_status": ("internalteamstatus", "unitstatus"),
    "capabilities": ("internalteamcapabilities", "unitcapabilities", "capabilities", "capability"),
    "unit_authorized_strength": ("unitcapacity", "unitauthorizedstrength", "internalteamcapacity"),
    "unit_current_member_count": ("unitcurrentmembercount", "unitcurrentmembers", "unitcurrentpeople"),
    "unit_available_member_count": ("unitavailablemembercount", "unitavailablemembers", "unitavailablepeople"),
    "unit_rating_average": ("unitrating", "unitratingaverage"),
    "unit_rating_count": ("unitratingcount",),
}


def _tag(name: str) -> str:
    return f"{{{MAIN_NS}}}{name}"


def _column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        return 0
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - 64
    return result - 1


def _xml(zip_file: ZipFile, path: str) -> ET.Element:
    return ET.fromstring(zip_file.read(path))


def _worksheet_path(zip_file: ZipFile) -> str:
    workbook = _xml(zip_file, "xl/workbook.xml")
    first_sheet = workbook.find(f"{_tag('sheets')}/{_tag('sheet')}")
    if first_sheet is None:
        raise ValueError("The workbook has no worksheets")
    relationship_id = first_sheet.attrib.get(f"{{{DOC_REL_NS}}}id")
    relationships = _xml(zip_file, "xl/_rels/workbook.xml.rels")
    for relationship in relationships.findall(f"{{{PKG_REL_NS}}}Relationship"):
        if relationship.attrib.get("Id") != relationship_id:
            continue
        target = relationship.attrib.get("Target", "")
        path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
        if path not in zip_file.namelist() or not path.startswith("xl/worksheets/"):
            raise ValueError("The first worksheet could not be read")
        return path
    raise ValueError("The workbook worksheet relationship is invalid")


def _shared_strings(zip_file: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zip_file.namelist():
        return []
    root = _xml(zip_file, "xl/sharedStrings.xml")
    return ["".join(node.text or "" for node in entry.iter(_tag("t"))) for entry in root.findall(_tag("si"))]


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(_tag("t"))).strip()
    value = cell.find(_tag("v"))
    if value is None or value.text is None:
        return ""
    raw = value.text.strip()
    if cell_type == "s":
        try:
            return shared[int(raw)]
        except (IndexError, ValueError):
            return ""
    if cell_type == "b":
        return "true" if raw == "1" else "false"
    return raw


def _normal_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _number(value: str, *, integer: bool = False):
    if not value:
        return None
    try:
        parsed = float(value)
        if integer:
            return int(parsed) if parsed.is_integer() else None
        return parsed
    except ValueError:
        return None


def _enum(value: str, allowed: set[str], default: str = "") -> str:
    normalized = re.sub(r"[^a-z0-9]", "", value.casefold())
    aliases = {
        "searchrescue": "search_and_rescue",
        "searchandrescue": "search_and_rescue",
        "medicalresponse": "medical",
        "fireresponse": "fire",
        "waterrescue": "water_rescue",
        "communication": "communications",
        "notrated": "",
    }
    for choice in allowed:
        if _normal_header(choice) == normalized:
            return choice
    mapped = aliases.get(normalized, "")
    return mapped if mapped in allowed else default


def parse_team_workbook(data: bytes) -> dict:
    """Parse an .xlsx file in memory and return editable team/unit preview data."""
    if not data or len(data) > MAX_FILE_BYTES:
        raise ValueError("The Excel file must be between 1 byte and 10 MB")
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("The workbook contains unsupported XML declarations")
    try:
        with ZipFile(BytesIO(data)) as zip_file:
            entries = zip_file.infolist()
            if len(entries) > 500 or sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("The workbook is too large to preview safely")
            names = {entry.filename for entry in entries}
            if "xl/workbook.xml" not in names:
                raise ValueError("This file is not a supported .xlsx workbook")
            sheet_path = _worksheet_path(zip_file)
            shared = _shared_strings(zip_file)
            sheet = _xml(zip_file, sheet_path)
    except (BadZipFile, KeyError, ET.ParseError) as exc:
        raise ValueError("The Excel file is damaged or could not be read") from exc

    rows: list[list[str]] = []
    for row in sheet.findall(f".//{_tag('sheetData')}/{_tag('row')}"):
        values: list[str] = []
        for cell in row.findall(_tag("c")):
            column = _column_index(cell.attrib.get("r", ""))
            if column >= 500:
                raise ValueError("The worksheet has too many columns")
            if len(values) <= column:
                values.extend([""] * (column + 1 - len(values)))
            values[column] = _cell_text(cell, shared)
        rows.append(values)
        if len(rows) > MAX_ROWS + 1:
            raise ValueError("The worksheet has more than 1000 data rows")
    header_index = next((index for index, row in enumerate(rows) if any(value.strip() for value in row)), None)
    if header_index is None:
        raise ValueError("The worksheet is empty")
    headers = [_normal_header(value) for value in rows[header_index]]
    columns = {}
    for field, aliases in ALIASES.items():
        columns[field] = next((index for index, header in enumerate(headers) if header in aliases), None)
    if columns["team_name"] is None:
        raise ValueError("A Team Name column is required. See the import template headers.")

    allowed_team_types = {"medical", "search_and_rescue", "fire", "water_rescue", "logistics", "other"}
    allowed_unit_types = allowed_team_types | {"communications", "evacuation"}
    allowed_statuses = {"available", "deployed", "offline"}
    teams_by_name: dict[str, dict] = {}
    warnings: list[str] = []
    source_rows = 0

    def value_at(row: list[str], field: str) -> str:
        column = columns[field]
        return row[column].strip() if column is not None and column < len(row) else ""

    for row_number, row in enumerate(rows[header_index + 1:], start=header_index + 2):
        if not any(value.strip() for value in row):
            continue
        source_rows += 1
        name = value_at(row, "team_name")
        if not name:
            name = f"Imported team (row {row_number})"
            warnings.append(f"Row {row_number}: team name was missing; edit it before saving.")
        key = name.casefold()
        if key not in teams_by_name:
            team_type = _enum(value_at(row, "team_type"), allowed_team_types)
            status = _enum(value_at(row, "team_status"), allowed_statuses, "offline")
            team = {
                "name": name,
                "team_type": team_type,
                "base_address": value_at(row, "base_address"),
                "latitude": _number(value_at(row, "latitude")),
                "longitude": _number(value_at(row, "longitude")),
                "authorized_strength": _number(value_at(row, "authorized_strength"), integer=True),
                "current_member_count": _number(value_at(row, "current_member_count"), integer=True),
                "available_member_count": _number(value_at(row, "available_member_count"), integer=True),
                "status": status,
                "rating_average": _number(value_at(row, "rating_average")),
                "rating_count": _number(value_at(row, "rating_count"), integer=True),
                "units": [],
            }
            teams_by_name[key] = team
        else:
            team = teams_by_name[key]

        unit_name = value_at(row, "unit_name")
        unit_type = _enum(value_at(row, "unit_type"), allowed_unit_types)
        if unit_name or unit_type:
            if not unit_name:
                unit_name = f"Internal team (row {row_number})"
                warnings.append(f"Row {row_number}: internal team name was missing; edit it before saving.")
            capabilities = [item.strip() for item in re.split(r"[,;|]", value_at(row, "capabilities")) if item.strip()]
            team["units"].append({
                "name": unit_name,
                "unit_type": unit_type,
                "status": _enum(value_at(row, "unit_status"), allowed_statuses, "available"),
                "capabilities": capabilities,
                "authorized_strength": _number(value_at(row, "unit_authorized_strength"), integer=True),
                "current_member_count": _number(value_at(row, "unit_current_member_count"), integer=True),
                "available_member_count": _number(value_at(row, "unit_available_member_count"), integer=True),
                "rating_average": _number(value_at(row, "unit_rating_average")),
                "rating_count": _number(value_at(row, "unit_rating_count"), integer=True),
            })

    if not teams_by_name:
        raise ValueError("No team records were found below the header row")
    return {"teams": list(teams_by_name.values()), "source_rows": source_rows, "warnings": warnings}
