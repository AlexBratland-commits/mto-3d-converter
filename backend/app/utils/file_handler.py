import os
from pathlib import Path
from fastapi import UploadFile, HTTPException

# Maks filstørrelse: 50 MB
MAX_FILE_SIZE = 50 * 1024 * 1024

# Tillatte filtyper
ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}

# Mapper
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs"

# Sørg for at mappene finnes
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


def validate_file(file: UploadFile) -> str:
    """Validerer filtype og størrelse. Returnerer filendelse."""
    
    # Sjekk filendelse
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Ugyldig filtype: {ext}. Tillatt: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    return ext


async def save_upload(file: UploadFile) -> Path:
    """Lagrer opplastet fil og returnerer filbanen."""
    
    ext = validate_file(file)
    
    # Les filinnhold og sjekk størrelse
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Filen er for stor (maks 50 MB)")
    
    # Lagre filen
    file_path = UPLOAD_DIR / f"upload{ext}"
    with open(file_path, "wb") as f:
        f.write(contents)
    
    return file_path