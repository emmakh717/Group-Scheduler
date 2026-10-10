# Group Project Scheduler

A web application that helps student groups find the best meeting times by collecting individual availability and computing optimal meeting windows.

## Problem
Scheduling group meetings is difficult when everyone has different availability. Existing tools often require manual comparison or full availability overlap, which is unrealistic for larger groups.

## Solution
This application allows users to:
- Create a group with a unique code
- Submit weekly availability in hourly time blocks
- Automatically compute:
  - Times when everyone is available
  - Ranked meeting suggestions when only partial attendance is possible
  - Multi-hour meeting windows

## Features
- Group-based scheduling with unique join codes
- Availability validation using structured data models
- Overlap detection using set intersection
- Ranked meeting suggestions based on attendance count
- Support for configurable meeting duration and minimum attendance
- Human-readable time formatting

## Tech Stack
- **Backend:** Python, FastAPI
- **Server:** Uvicorn
- **Validation:** Pydantic
- **Frontend (planned):** HTML, CSS, JavaScript

## How It Works
1. A user creates a group and receives a unique group code
2. Group members submit their weekly availability
3. The backend computes overlapping time slots and ranked meeting suggestions
4. Results are returned in both machine-readable and user-friendly formats

## Running Locally
```bash
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn
uvicorn main:app --reload
