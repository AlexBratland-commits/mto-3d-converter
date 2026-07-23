import pandas as pd
from pathlib import Path
from app.models.mto import MTOComponent, MTOSheet

# Mapping: Kolonnenavn i Excel → feltnavn i modellen
COLUMN_MAP = {
    # Identifikasjon
    "Line No": "line_no",
    "Item No": "item_no",
    "Component": "component",
    "ISO Drawing Ref": "iso_drawing_ref",
    "P&ID Ref": "pid_ref",
    
    # Spesifikasjoner
    "Pipe Class": "pipe_class",
    "Spec/Material": "spec_material",
    "Size (DN/NPS)": "size_dn_nps",
    "Insulation Thickness (mm)": "insulation_thickness_mm",
    
    # Geometri
    "Start X": "start_x",
    "Start Y": "start_y",
    "Start Z": "start_z",
    "End X": "end_x",
    "End Y": "end_y",
    "End Z": "end_z",
    
    # Retning
    "Direction": "direction",
    
    # Prosess
    "Pressure (bar)": "pressure_bar",
    "Temperature (°C)": "temperature_c",
}

# Obligatoriske kolonner
REQUIRED_COLUMNS = [
    "line_no", "item_no", "component",
    "start_x", "start_y", "start_z",
    "end_x", "end_y", "end_z",
]


def parse_excel(file_path: Path) -> MTOSheet:
    """Leser en Excel-fil og returnerer et MTO-ark."""
    
    # Les Excel
    df = pd.read_excel(file_path)
    
    # Rens kolonnenavn (fjern mellomrom før/etter)
    df.columns = df.columns.str.strip()
    
    # Sjekk at alle forventede kolonner finnes
    missing = [col for col in COLUMN_MAP.keys() if col not in df.columns]
    if missing:
        raise ValueError(
            f"Manglende kolonner i Excel-filen: {', '.join(missing)}. "
            f"Forventede kolonner: {', '.join(COLUMN_MAP.keys())}"
        )
    
    # Omdøp kolonner til modellens feltnavn
    df = df.rename(columns=COLUMN_MAP)
    
    # Fyll manglende valgfrie felt
    if "insulation_thickness_mm" not in df.columns:
        df["insulation_thickness_mm"] = 0.0
    df["insulation_thickness_mm"] = df["insulation_thickness_mm"].fillna(0.0)
    
    # Valider at obligatoriske kolonner har verdier
    for col in REQUIRED_COLUMNS:
        if df[col].isna().any():
            raise ValueError(f"Kolonne '{col}' har tomme celler - alle rader må ha verdi.")
    
    # Konverter til MTOComponent-objekter
    components = []
    for _, row in df.iterrows():
        comp = MTOComponent(
            line_no=str(row["line_no"]),
            item_no=str(row["item_no"]),
            component=str(row["component"]),
            iso_drawing_ref=str(row.get("iso_drawing_ref", "")),
            pid_ref=str(row.get("pid_ref", "")),
            pipe_class=str(row.get("pipe_class", "")),
            spec_material=str(row.get("spec_material", "")),
            size_dn_nps=str(row.get("size_dn_nps", "")),
            insulation_thickness_mm=float(row.get("insulation_thickness_mm", 0)),
            start_x=float(row["start_x"]),
            start_y=float(row["start_y"]),
            start_z=float(row["start_z"]),
            end_x=float(row["end_x"]),
            end_y=float(row["end_y"]),
            end_z=float(row["end_z"]),
            direction=str(row.get("direction", "")),
            pressure_bar=float(row.get("pressure_bar", 0)),
            temperature_c=float(row.get("temperature_c", 0)),
        )
        components.append(comp)
    
    return MTOSheet(
        components=components,
        total_count=len(components),
    )