"""ReviewSync AI Service — FastAPI application."""

import logging

from fastapi import FastAPI, HTTPException

from .schemas import AnalyzeRequest, AnalysisResult
from .llm_client import get_review

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ReviewSync AI Service",
    description="AI-powered code review analysis service",
    version="1.0.0",
)


@app.get("/")
async def root():
    return {"message": "Hello from ReviewSync AI Service"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze(request: AnalyzeRequest):
    """
    Analyze source code for bugs, security issues, performance problems,
    and code quality issues using an LLM.
    """
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    try:
        result = await get_review(request.code, request.language)
        return result
    except ValueError as e:
        # Missing API key
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Analysis failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"LLM service error: {str(e)}",
        )
