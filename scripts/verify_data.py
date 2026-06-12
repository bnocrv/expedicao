from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def main() -> None:
    data_path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/expeditions.js")
    audit_path = data_path.with_name("audit.json")

    content = data_path.read_text(encoding="utf-8")
    match = re.fullmatch(r"window\.EXPEDITION_DATA = (.*);\s*", content, re.S)
    if not match:
        raise SystemExit("Arquivo de dados inválido.")

    data = json.loads(match.group(1))
    records = data["records"]
    audit = json.loads(audit_path.read_text(encoding="utf-8"))

    assert len(records) == audit["uniqueRecordCount"]
    assert sum(record["volumes"] for record in records) == audit["totalVolumes"]
    assert max(record["date"] for record in records) == audit["latestDate"]
    assert all(
        record["volumes"] == sum(stop["volumes"] for stop in record["stops"])
        for record in records
    )
    assert all("source" in record for record in records)
    analysis_records = [
        record
        for record in records
        if record["date"][:7] not in audit["analysisExcludedPeriods"]
    ]
    assert len(analysis_records) == audit["analysisRecordCount"]
    assert (
        sum(record["volumes"] for record in analysis_records)
        == audit["analysisTotalVolumes"]
    )

    print(
        f"OK: {len(records)} saídas únicas, "
        f"{audit['totalVolumes']} volumes, "
        f"dados até {audit['latestDate']}."
    )
    print(
        f"Duplicidades removidas: {len(audit['duplicateRowsRemoved'])} "
        f"({audit['duplicateRowsRemoved']})."
    )
    print(
        f"Base válida para análise: {audit['analysisRecordCount']} saídas, "
        f"{audit['analysisTotalVolumes']} volumes."
    )


if __name__ == "__main__":
    main()
