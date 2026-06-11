from __future__ import annotations

import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import ZipFile


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MONTH_NAMES = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]


def excel_date(value: str) -> str:
    date = datetime(1899, 12, 30) + timedelta(days=float(value))
    return date.strftime("%Y-%m-%d")


def normalize_text(value: str) -> str:
    value = re.sub(r"\s*\[[^\]]*\]", "", value)
    value = re.sub(r"\s*\([^)]*\)", "", value)
    value = re.sub(r"\s+", " ", value).strip(" -")
    return value


def ascii_upper(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFD", value.upper())
        if unicodedata.category(char) != "Mn"
    )


DESTINATION_PATTERNS = [
    (r"\bSAO JOSE DOS CAMPOS\b|\bSAO JOSE\b|\bSJC\b", "São José dos Campos"),
    (r"\bSAO VICENTE\b|\bSV\b", "São Vicente"),
    (r"\bSANTO AMARO\b|\bSA\b", "Santo Amaro"),
    (r"\bGUARULHOS\b|\bGR\b", "Guarulhos"),
    (r"\bCABO FRIO\b", "Cabo Frio"),
    (r"\bJACAREI\b|\bJCI\b", "Jacareí"),
    (r"\bROCINHA\b", "Rocinha"),
    (r"\bPIRAI\b", "Piraí"),
    (r"\bTIJUCA\b", "Tijuca"),
]


def extract_destinations(value: str) -> list[str]:
    searchable = ascii_upper(normalize_text(value))
    matches = []
    for pattern, display_name in DESTINATION_PATTERNS:
        for match in re.finditer(pattern, searchable):
            matches.append((match.start(), display_name))
    return [display_name for _, display_name in sorted(matches)]


def split_stops(destination: str, volume_text: str, total: int) -> list[dict]:
    destinations = extract_destinations(destination)
    volumes = [int(value) for value in re.findall(r"\d+", volume_text)]

    if len(destinations) == len(volumes):
        pairs = zip(destinations, volumes)
    elif len(destinations) == 1:
        pairs = [(destinations[0], total)]
    elif destinations:
        distributed = total // len(destinations)
        remainder = total % len(destinations)
        pairs = [
            (destination_name, distributed + (1 if index < remainder else 0))
            for index, destination_name in enumerate(destinations)
        ]
    else:
        pairs = [(normalize_text(destination).title(), total)]

    consolidated = {}
    order = []
    for destination_name, volume in pairs:
        if destination_name not in consolidated:
            consolidated[destination_name] = 0
            order.append(destination_name)
        consolidated[destination_name] += volume
    return [
        {"destination": destination_name, "volumes": consolidated[destination_name]}
        for destination_name in order
    ]


def cell_column(reference: str) -> str:
    match = re.match(r"[A-Z]+", reference)
    return match.group() if match else ""


def read_workbook(path: Path) -> list[dict]:
    records = []

    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(
            archive.read("xl/_rels/workbook.xml.rels")
        )
        targets = {
            relationship.attrib["Id"]: relationship.attrib["Target"]
            for relationship in relationships
        }

        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_xml:
                shared_strings.append(
                    "".join(
                        text.text or ""
                        for text in item.iter(f"{{{MAIN_NS}}}t")
                    )
                )

        sheets = workbook.find(f"{{{MAIN_NS}}}sheets")
        for sheet in sheets if sheets is not None else []:
            year = sheet.attrib["name"]
            if year not in {"2024", "2025", "2026"}:
                continue

            relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
            target = targets[relationship_id].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"

            date_column, destination_column, volume_column = (
                ("A", "B", "C") if year == "2024" else ("B", "D", "E")
            )
            sheet_xml = ET.fromstring(archive.read(target))

            for row in sheet_xml.iter(f"{{{MAIN_NS}}}row"):
                values = {}
                for cell in row.findall(f"{{{MAIN_NS}}}c"):
                    value_node = cell.find(f"{{{MAIN_NS}}}v")
                    value = "" if value_node is None else (value_node.text or "")
                    cell_type = cell.attrib.get("t")
                    if cell_type == "s" and value:
                        value = shared_strings[int(value)]
                    elif cell_type == "inlineStr":
                        value = "".join(
                            text.text or ""
                            for text in cell.iter(f"{{{MAIN_NS}}}t")
                        )
                    values[cell_column(cell.attrib["r"])] = value.strip()

                try:
                    date = excel_date(values.get(date_column, ""))
                except (ValueError, TypeError):
                    continue

                destination = values.get(destination_column, "")
                volume_text = values.get(volume_column, "")
                volume_values = [
                    int(value) for value in re.findall(r"\d+", volume_text)
                ]
                if not destination or not volume_values:
                    continue

                total = sum(volume_values)
                records.append(
                    {
                        "date": date,
                        "destination": " + ".join(
                            stop["destination"]
                            for stop in split_stops(destination, volume_text, total)
                        ),
                        "volumes": total,
                        "stops": split_stops(destination, volume_text, total),
                    }
                )

    return sorted(records, key=lambda record: record["date"])


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: extract_data.py <arquivo.xlsx> <saida.js>")

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    records = read_workbook(source)
    years = sorted({record["date"][:4] for record in records})
    metadata = {
        "source": source.name,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "years": years,
        "recordCount": len(records),
        "monthNames": MONTH_NAMES,
    }
    content = (
        "window.EXPEDITION_DATA = "
        + json.dumps(
            {"metadata": metadata, "records": records},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + ";\n"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")
    print(f"{len(records)} registros gravados em {output}")


if __name__ == "__main__":
    main()
