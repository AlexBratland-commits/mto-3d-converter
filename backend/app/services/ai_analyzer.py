import base64
import json
from pathlib import Path
from openai import OpenAI
from app.config import get_settings


def analyze_iso_drawing(image_path: Path) -> list[dict]:
    """
    Analyserer en ISO-tegning og returnerer MTO-komponenter.
    Bruker OpenRouter med GPT-4o Vision.
    """
    
    settings = get_settings()
    
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.api_key,
    )
    
    # Les bildefilen som base64
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    # Bestem filtype
    ext = image_path.suffix.lower()
    mime_type = "image/png" if ext == ".png" else "image/jpeg"
    
    prompt = """Du er en ekspert på rør- og instrumentdiagrammer (P&ID) og isometriske tegninger (ISO).
    
Analyser denne tekniske tegningen og returner en JSON-liste med alle rørkomponenter du kan identifisere.

For hver komponent, returner disse feltene (bruk tom streng hvis feltet ikke kan bestemmes):
- line_no: Linjenummer (f.eks. "12-P-15001-A1")
- item_no: Komponentnummer i linjen (1, 2, 3...)
- component: Komponenttype ("Pipe spool", "90° bend", "45° bend", "Flange WN", "Gate valve", "Reducer", "Tee", etc.)
- size_dn_nps: Dimensjon (f.eks. "DN300 / 12\"")
- spec_material: Materialspesifikasjon (f.eks. "CS", "SS316")
- pipe_class: Rørklasse (f.eks. "A1", "B2")
- start_x, start_y, start_z: Startkoordinater i mm
- end_x, end_y, end_z: Sluttkoordinater i mm
- direction: Retning ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
- pressure_bar: Trykk i bar (tall)
- temperature_c: Temperatur i celsius (tall)
- insulation_thickness_mm: Isolasjonstykkelse i mm (tall)
- iso_drawing_ref: ISO-tegningsreferanse
- pid_ref: P&ID-referanse

VIKTIG: 
- Returner KUN gyldig JSON, ingen annen tekst.
- Hvis du ser koordinater på tegningen, bruk dem. Hvis ikke, estimer basert på typisk rørgeometri.

Eksempel på forventet format:
[
  {
    "line_no": "12-P-15001-A1",
    "item_no": "1",
    "component": "Pipe spool",
    "size_dn_nps": "DN300 / 12\"",
    "spec_material": "CS",
    "pipe_class": "A1",
    "start_x": 0, "start_y": 0, "start_z": 0,
    "end_x": 2000, "end_y": 0, "end_z": 0,
    "direction": "E",
    "pressure_bar": 16,
    "temperature_c": 200,
    "insulation_thickness_mm": 50,
    "iso_drawing_ref": "ISO-12-001",
    "pid_ref": "P&ID-12-001"
  }
]"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_data}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=4000,
            temperature=0.1,
        )
        
        # Hent ut JSON fra responsen
        content = response.choices[0].message.content
        
        # Fjern eventuelle markdown-kodeblokker
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        components = json.loads(content.strip())
        return components
        
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returnerte ugyldig JSON: {e}")
    except Exception as e:
        raise ValueError(f"AI-analyse feilet: {e}")