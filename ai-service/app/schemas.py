"""Pydantic schemas for code review analysis."""

from pydantic import BaseModel, Field
from typing import Literal


class CodeIssue(BaseModel):
    """A single issue found in the code."""

    line: int = Field(..., description="1-based line number where the issue occurs")
    type: Literal[
        "bug",
        "logical_error",
        "security",
        "performance",
        "code_quality",
        "best_practice",
    ] = Field(..., description="Category of the issue")
    severity: Literal["critical", "warning", "info"] = Field(
        ..., description="How severe the issue is"
    )
    title: str = Field(..., description="Short one-line summary of the issue")
    explanation: str = Field(
        ..., description="Detailed explanation of why this is a problem"
    )
    suggested_fix: str = Field(
        ..., description="Concrete suggestion for how to fix the issue"
    )


class AnalysisResult(BaseModel):
    """Complete analysis result from the LLM."""

    issues: list[CodeIssue] = Field(
        default_factory=list, description="List of issues found"
    )


class AnalyzeRequest(BaseModel):
    """Request body for the /analyze endpoint."""

    code: str = Field(..., description="Source code to analyze")
    language: str = Field(..., description="Programming language of the code")
