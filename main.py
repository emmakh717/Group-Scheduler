from fastapi import FastAPI
from pydantic import BaseModel
from typing import Dict, List, Any
from fastapi import Query
import secrets
from fastapi.middleware.cors import CORSMiddleware

groups: Dict[str, list] = {}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Availability(BaseModel):
    name: str
    schedule: Dict[str, List[int]]

def hour_block_to_label(h: int) -> str:
    start = h
    end = h + 1

    def fmt(x: int) -> str:
        suffix = "AM" if x < 12 else "PM"
        hour12 = x if 1 <= x <= 12 else (x - 12 if x > 12 else 12)
        return f"{hour12}:00 {suffix}"

    return f"{fmt(start)}–{fmt(end)}"

def compute_ranked_slots(group_availability: list):
    counts = {}  # (day, hour) -> count

    for person in group_availability:
        for day, hours in person.schedule.items():
            for h in hours:
                key = (day, h)
                counts[key] = counts.get(key, 0) + 1

    # turn into list of dicts for nice JSON output
    ranked = []
    for (day, h), count in counts.items():
        ranked.append({
            "day": day,
            "hour": h,
            "time": hour_block_to_label(h),
            "attendees": count
        })

    # sort: most attendees first, then earlier hours
    ranked.sort(key=lambda x: (-x["attendees"], x["day"], x["hour"]))
    return ranked

DAY_ORDER = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6
}

def find_windows_for_group(group_availability: list, min_people: int, duration_hours: int):
    # counts[(day, hour)] = number of people available
    counts = {}
    for person in group_availability:
        for day, hours in person.schedule.items():
            for h in hours:
                counts[(day, h)] = counts.get((day, h), 0) + 1

    suggestions = []

    # For each day, look for consecutive hour blocks where attendance >= min_people
    days = set(day for (day, _) in counts.keys())
    for day in days:
        valid_hours = sorted([h for (d, h), c in counts.items() if d == day and c >= min_people])

        # find consecutive runs in valid_hours
        start = None
        run = []

        for h in valid_hours:
            if not run or h == run[-1] + 1:
                run.append(h)
            else:
                # process previous run
                suggestions += _windows_from_run(day, run, counts, min_people, duration_hours)
                run = [h]

        if run:
            suggestions += _windows_from_run(day, run, counts, min_people, duration_hours)

    # sort by (most attendees avg) then day order then earliest
    suggestions.sort(key=lambda s: (-s["avg_attendees"], DAY_ORDER.get(s["day"], 99), s["start_hour"]))
    return suggestions


def _windows_from_run(day: str, run: list, counts: dict, min_people: int, duration_hours: int):
    out = []
    if len(run) < duration_hours:
        return out

    for i in range(0, len(run) - duration_hours + 1):
        window = run[i:i + duration_hours]
        start = window[0]
        end = window[-1] + 1

        attendee_counts = [counts[(day, h)] for h in window]
        avg_attendees = sum(attendee_counts) / len(attendee_counts)
        min_attendees_in_window = min(attendee_counts)

        out.append({
            "day": day,
            "start_hour": start,
            "end_hour": end,
            "time": f"{hour_block_to_label(start).split('–')[0]}–{hour_block_to_label(end-1).split('–')[1]}",
            "min_attendees": min_attendees_in_window,
            "avg_attendees": avg_attendees
        })
    return out


@app.post("/group/create")
def create_group():
    code = secrets.token_hex(3)
    groups[code] = []
    return {"group_code": code}

@app.get("/")
def root():
    return {"message": "Group Scheduler API is running"}

@app.post("/group/{code}/submit")
def submit_to_group(code: str, availability: Availability):
    if code not in groups:
        return {"error": "Group code not found"}

    groups[code].append(availability)
    return {"status": "availability added", "group_code": code}

@app.get("/group/{code}/overlap")
def overlap_for_group(code: str):
    if code not in groups:
        return {"error": "Group code not found"}

    group_availability = groups[code]
    if not group_availability:
        return {"message": "No availability submitted yet.", "group_code": code}

    overlap = group_availability[0].schedule

    for person in group_availability[1:]:
        new_overlap = {}
        for day, hours in overlap.items():
            if day in person.schedule:
                shared = sorted(list(set(hours) & set(person.schedule[day])))
                if shared:
                    new_overlap[day] = shared
        overlap = new_overlap

    pretty = {
        day: [hour_block_to_label(h) for h in hours]
        for day, hours in overlap.items()
    }

    return {"group_code": code, "overlap": overlap, "readable": pretty}

@app.get("/group/{code}/ranked")
def ranked_for_group(code: str, min_people: int = Query(2, ge=1)):
    if code not in groups:
        return {"error": "Group code not found"}

    group_availability = groups[code]
    if not group_availability:
        return {"message": "No availability submitted yet.", "group_code": code}

    ranked = compute_ranked_slots(group_availability)
    filtered = [slot for slot in ranked if slot["attendees"] >= min_people]

    return {
        "group_code": code,
        "min_people": min_people,
        "results": filtered
    }

@app.get("/group/{code}/members")
def group_members(code: str):
    if code not in groups:
        return {"error": "Group code not found"}
    return {
        "group_code": code,
        "count": len(groups[code]),
        "names": [p.name for p in groups[code]]
    }


@app.get("/group/{code}/suggestions")
def suggestions(code: str,
                min_people: int = Query(2, ge=1),
                duration_hours: int = Query(1, ge=1, le=6),
                limit: int = Query(5, ge=1, le=20)):
    if code not in groups:
        return {"error": "Group code not found"}

    group_availability = groups[code]
    if not group_availability:
        return {"message": "No availability submitted yet.", "group_code": code}

    sugg = find_windows_for_group(group_availability, min_people, duration_hours)
    return {
        "group_code": code,
        "min_people": min_people,
        "duration_hours": duration_hours,
        "results": sugg[:limit]
    }

from fastapi import Query, HTTPException

@app.get("/group/{code}/who")
def who_is_free(code: str, day: str = Query(...), hour: int = Query(...)):
    if code not in groups:
        raise HTTPException(status_code=404, detail="Group code not found")

    available = []
    for person in groups[code]:
        # person is an Availability model
        sched = person.schedule
        if day in sched and hour in sched[day]:
            available.append(person.name)

    return {"group_code": code, "day": day, "hour": hour, "available": available}
