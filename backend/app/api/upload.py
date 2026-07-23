from fastapi import APIRouter, UploadFile, File, HTTPException
from app.utils.file_handler import save_upload
from app.services.excel_parser import parse_excel

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Tar imot en MTO Excel-fil, parser den, og returnerer dataene."""
    
    # Lagre filen
    file_path = await save_upload(file)
    
    # Parser Excel-filen
    try:
        mto_sheet = parse_excel(file_path)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    
    # Returner data til frontend
    return {
        "message": "Fil lastet opp og prosessert!",
        "filename": file.filename,
        "total_components": mto_sheet.total_count,
        "components": [comp.model_dump() for comp in mto_sheet.components],
    }