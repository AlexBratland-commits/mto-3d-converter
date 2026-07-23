from pydantic import BaseModel
from typing import Optional


class MTOComponent(BaseModel):
    """Komplett MTO-komponent - standardisert mellommodell."""
    
    # === Identifikasjon ===
    line_no: str
    tag_no: str = ""
    item_no: str
    component: str                  # "Pipe", "90° Bend", "Flange WN", "Gate Valve", etc.
    iso_drawing_ref: str = ""
    pid_ref: str = ""
    
    # === Spesifikasjoner ===
    pipe_class: str = ""
    spec_material: str = ""
    size_dn_nps: str                # "DN300" eller "12""
    schedule_thickness: str = ""    # "SCH40", "SCH80", etc.
    
    # === Komponenttype (for 3D-generering) ===
    component_type: str = ""        # "pipe", "bend", "flange", "valve", "reducer", "tee"
    angle: Optional[float] = None   # 45, 90 for bends
    connection_type: str = ""       # "BW", "FL", "SW", "TH"
    
    # === Geometri ===
    start_x: float
    start_y: float
    start_z: float
    end_x: float
    end_y: float
    end_z: float
    direction: str = ""             # "N", "NE", "E", "SE", "S", "SW", "W", "NW"
    rotation: float = 0.0           # Rotasjonsvinkel
    
    # === Isolasjon ===
    insulation_class: str = ""
    insulation_thickness_mm: float = 0.0
    
    # === Prosess ===
    pressure_bar: float = 0.0
    temperature_c: float = 0.0
    
    # === Metadata ===
    area_module_system: str = ""    # "Area 12", "Module A", etc.
    revision: str = ""              # "Rev 1", "Rev 2"
    break_point: bool = False       # Break point mellom klasser?


class MTOSheet(BaseModel):
    """Komplett MTO-ark."""
    components: list[MTOComponent]
    total_count: int
    metadata: dict = {}             # Prosjektnavn, dato, etc.