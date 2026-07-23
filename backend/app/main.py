from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.upload import router as upload_router
from app.api.analyze import router as analyze_router

app = FastAPI(title="MTO til 3D Konverterer")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrer API-rutere
app.include_router(upload_router)
app.include_router(analyze_router)

@app.get("/")
def root():
    return {"message": "MTO til 3D Konverterer - Backend kjører!"}

@app.get("/health")
def health_check():
    return {"status": "OK"}