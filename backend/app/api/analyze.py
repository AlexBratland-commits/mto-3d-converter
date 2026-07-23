from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
from app.utils.file_handler import UPLOAD_DIR
from app.services.ai_analyzer import analyze_iso_drawing

router = APIRouter(prefix="/api", tags=["analyze"])

ALLOWED_IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".pdf"}


@router.post("/analyze-drawing")
async def analyze_drawing(file: UploadFile = File(...)):
    """Analyserer en P&ID/ISO-tegning med AI og returnerer MTO-data."""
    
    # Valider filtype
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Ugyldig filtype: {ext}. Tillatt: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )
    
    # Lagre filen
    contents = await file.read()
    file_path = UPLOAD_DIR / f"drawing{ext}"
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # AI-analyse
    try:
        components = analyze_iso_drawing(file_path)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    
    return {
        "message": f"Tegning analysert! {len(components)} komponenter funnet.",
        "filename": file.filename,
        "total_components": len(components),
        "components": components,
    }