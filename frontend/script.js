let groupCode = "";

function createGroup() {
  fetch("http://127.0.0.1:8000/group/create", {
    method: "POST"
  })
  .then(res => res.json())
  .then(data => {
    groupCode = data.group_code;
    document.getElementById("groupCode").innerText =
      "Group Code: " + groupCode;
  });
}


const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
let selected = new Set(); // stores keys like "Monday-15"
let isMouseDown = false;

function hourLabel(h) {
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${suffix}`;
}

function buildGrid() {
  const start = parseInt(document.getElementById("startHour").value, 10);
  const end = parseInt(document.getElementById("endHour").value, 10);

  if (isNaN(start) || isNaN(end) || start < 0 || end > 24 || start >= end) {
    alert("Pick a valid time range (ex: start 8, end 22).");
    return;
  }

  const container = document.getElementById("availabilityGrid");
  container.innerHTML = `
    <table class="grid-table" id="gridTable">
      <thead>
        <tr>
          <th class="time-label">Time</th>
          ${DAYS.map(d => `<th>${d}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: end - start }, (_, i) => {
          const hour = start + i;
          return `
            <tr>
              <td class="time-label">${hourLabel(hour)}–${hourLabel(hour + 1)}</td>
              ${DAYS.map(day => {
                const key = `${day}-${hour}`;
                const on = selected.has(key) ? "selected" : "";
                return `<td class="slot ${on}" data-day="${day}" data-hour="${hour}"></td>`;
              }).join("")}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <div class="hint">Click to toggle. Drag to select multiple.</div>
  `;

  const table = document.getElementById("gridTable");

  table.addEventListener("mousedown", (e) => {
    if (!e.target.classList.contains("slot")) return;
    isMouseDown = true;
    toggleSlot(e.target);
  });

  table.addEventListener("mouseover", (e) => {
    if (!isMouseDown) return;
    if (!e.target.classList.contains("slot")) return;
    // drag select always turns ON
    selectSlot(e.target);
  });

  window.addEventListener("mouseup", () => {
    isMouseDown = false;
  });
}

function slotKey(cell) {
  return `${cell.dataset.day}-${cell.dataset.hour}`;
}

function toggleSlot(cell) {
  const key = slotKey(cell);
  if (selected.has(key)) {
    selected.delete(key);
    cell.classList.remove("selected");
  } else {
    selected.add(key);
    cell.classList.add("selected");
  }
}

function selectSlot(cell) {
  const key = slotKey(cell);
  if (!selected.has(key)) {
    selected.add(key);
    cell.classList.add("selected");
  }
}

function clearGrid() {
  selected.clear();
  buildGrid();
}

function buildScheduleObject() {
  const schedule = {};

  for (const key of selected) {
    const [day, hourStr] = key.split("-");
    const hour = parseInt(hourStr, 10);
    if (!schedule[day]) schedule[day] = [];
    schedule[day].push(hour);
  }

  // sort hours for each day so it looks clean
  for (const day of Object.keys(schedule)) {
    schedule[day].sort((a, b) => a - b);
  }

  return schedule;
}

function submitAvailability() {
  if (!groupCode) {
    document.getElementById("submitStatus").innerText =
      "Create a group first so we have a group code.";
    return;
  }

  const name = document.getElementById("name").value.trim();
  if (!name) {
    document.getElementById("submitStatus").innerText = "Enter your name.";
    return;
  }

  const schedule = buildScheduleObject();
  if (Object.keys(schedule).length === 0) {
    document.getElementById("submitStatus").innerText =
      "Select at least one time block.";
    return;
  }

  fetch(`http://127.0.0.1:8000/group/${groupCode}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, schedule })
  })
    .then(res => res.json())
    .then(() => {
      document.getElementById("submitStatus").innerText = "Availability submitted!";
    })
    .catch(err => {
      document.getElementById("submitStatus").innerText =
        "Submit failed. Is the backend running?";
      console.error(err);
    });
}


function getSuggestions() {
  if (!groupCode) {
    document.getElementById("results").innerHTML =
      "<p>Create a group first (so we have a group code).</p>";
    return;
  }

  const minPeople = document.getElementById("minPeople").value;
  const durationHours = document.getElementById("durationHours").value;
  const limit = document.getElementById("limit").value;

  const url = `http://127.0.0.1:8000/group/${groupCode}/suggestions?min_people=${minPeople}&duration_hours=${durationHours}&limit=${limit}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const resultsDiv = document.getElementById("results");
      resultsDiv.innerHTML = "";

      if (!data.results || data.results.length === 0) {
        resultsDiv.innerHTML = `<p>No suggestions found for min_people=${minPeople} and duration=${durationHours} hour(s). Try lowering min people or duration.</p>`;
        return;
      }

      data.results.forEach((slot, i) => {
        const card = document.createElement("div");
        card.className = "card";

        const whoBoxId = `who-${i}`;

        card.innerHTML = `
          <div class="card-title">${slot.day} — ${slot.time}</div>
          <div class="card-subtitle">Duration: ${durationHours} hour(s)</div>
          <div class="badge">Min attendees: ${slot.min_attendees} (avg ${Math.round(slot.avg_attendees)})</div>

          <button class="small-btn" onclick="showWho('${slot.day}', ${slot.start_hour}, '${whoBoxId}')">
            Show who’s free
          </button>

          <div id="${whoBoxId}" class="who"></div>
        `;

        resultsDiv.appendChild(card);
      });

    })
    .catch(err => {
      document.getElementById("results").innerHTML =
        "<p>Could not load suggestions. Is the backend running?</p>";
      console.error(err);
    });
}

function showWho(day, hour, containerId) {
  const box = document.getElementById(containerId);
  box.innerText = "Loading...";

  fetch(`http://127.0.0.1:8000/group/${groupCode}/who?day=${encodeURIComponent(day)}&hour=${hour}`)
    .then(res => res.json())
    .then(data => {
      const people = data.available || [];
      if (people.length === 0) {
        box.innerText = "Nobody is free for this slot.";
      } else {
        box.innerText = "Free: " + people.join(", ");
      }
    })
    .catch(err => {
      box.innerText = "Couldn’t load names.";
      console.error(err);
    });
}

buildGrid();
