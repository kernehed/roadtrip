let currentPos = null;
let destinationCoords = null;
let routeLog = [];
const map = L.map('map').setView([60.6745, 17.1413], 10);
const routeLayer = L.featureGroup().addTo(map);
const startBtn = document.getElementById("startBtn");
const destInput = document.getElementById("destinationAddress");

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

function getDistance(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function randomMove([lat, lon]) {
  const dirs = [[0.1, 0], [0, -0.1], [-0.1, 0], [0, 0.1]];
  const [dLat, dLon] = dirs[Math.floor(Math.random() * dirs.length)];
  return [lat + dLat * (Math.random() * 10), lon + dLon * (Math.random() * 10)];
}

async function getRoute(start, end) {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "5b3ce3597851110001cf624836bf313777364123b8266f2b3c09e17e",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ coordinates: [[start[1], start[0]], [end[1], end[0]]] })
  });
  return res.json();
}

async function drawRoute(start, end) {
  try {
    const data = await getRoute(start, end);
    const segment = L.geoJSON(data, { style: { color: 'cyan', weight: 5 } });
    segment.addTo(routeLayer);
  } catch {
    log("⚠️ Kunde inte hämta rutt, försök igen.");
  }
}

async function getPlaceName(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
  const data = await res.json();
  return data.address?.village || data.address?.town || data.address?.city || "Okänd plats";
}

function addMarker(coords, label) {
  L.marker(coords).addTo(map).bindPopup(label).openPopup();
}

function log(msg) {
  const logDiv = document.getElementById("log");
  logDiv.innerHTML += `<p>${msg}</p>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function saveLog() {
  localStorage.setItem("roadtripLog", JSON.stringify(routeLog));
}

function loadLog() {
  const saved = JSON.parse(localStorage.getItem("roadtripLog") || "[]");
  routeLog = saved;
  for (const r of saved) {
    addMarker(r.coords, r.desc || "Stopp");
  }
}

async function nextStep() {
  if (!currentPos) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        currentPos = [pos.coords.latitude, pos.coords.longitude];
        map.setView(currentPos, 12);
        nextStep();
      });
    } else {
      currentPos = [60.6745, 17.1413]; // fallback: Gävle
    }
    return;
  }

  if (destInput.value.trim() && !destinationCoords) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput.value.trim())}`);
    const data = await res.json();
    if (data.length) destinationCoords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  }

  if (destinationCoords && getDistance(currentPos, destinationCoords) < 1) {
    log("🎉 Du är framme!");
    addMarker(destinationCoords, "Slutmål");
    startBtn.textContent = "Börja";
    currentPos = null;
    destinationCoords = null;
    return;
  }

  let newPos;
  if (destinationCoords) {
    const data = await getRoute(currentPos, destinationCoords);
    const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
    const idx = Math.min(Math.floor(coords.length / 10), coords.length - 1);
    newPos = coords[idx];
  } else {
    const approx = randomMove(currentPos);
    const data = await getRoute(currentPos, approx);
    const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
    newPos = coords[coords.length - 1];
  }

  const name = await getPlaceName(newPos[0], newPos[1]);
  const challenge = getRandomChallenge();

  document.getElementById('navLinks').innerHTML = `
    <div style="margin-top: 5px">
    Navigera till ${name}:<br>
    <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${newPos[0]},${newPos[1]}')">🗺️ Google Maps</button>
    <button onclick="window.open('https://waze.com/ul?ll=${newPos[0]},${newPos[1]}&navigate=yes')">🚗 Waze</button>
    </div>`;

  document.getElementById('challengeText').textContent = "Utmaning: " + challenge;
  document.getElementById('photoPreview').innerHTML = "";

  log("📍 " + name);
  addMarker(newPos, name);
  await drawRoute(currentPos, newPos);
  routeLog.push({ coords: newPos, desc: name, challenge });
  saveLog();
  currentPos = newPos;
  startBtn.textContent = "Nästa";
}

// 📸 Foto + utmaning
const photoInput = document.getElementById('challengePhoto');
const photoPreview = document.getElementById('photoPreview');
const uploadBtn = document.getElementById('uploadPhotoBtn');
uploadBtn.onclick = () => photoInput.click();
photoInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photoPreview.innerHTML = `<img src="${reader.result}" style="max-width:100%; max-height:200px;" />`;
    if (routeLog.length > 0) {
      routeLog[routeLog.length - 1].photo = reader.result;
      saveLog();
    }
  };
  reader.readAsDataURL(file);
};

const challenges = [
  "Knäpp kort på en röd dörr", "Fotografera en fågel", "Hitta ett speciellt gatunamn",
  "Ta en selfie vid en staty", "Hitta en udda skylt", "Fotografera en cykel",
  "Hitta något blått", "Knäpp kort på en hund", "Ta en bild på en blomma", "Hitta en lekplats"
];
function getRandomChallenge() {
  return challenges[Math.floor(Math.random() * challenges.length)];
}

// Exportera PDF
document.getElementById("exportBtn").onclick = () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let y = 20;
  pdf.text("Kerneheds Roadtrip", 10, y);
  y += 10;
  for (let i = 0; i < routeLog.length; i++) {
    const r = routeLog[i];
    pdf.text(`${i + 1}. ${r.desc} (${r.coords[0].toFixed(3)}, ${r.coords[1].toFixed(3)})`, 10, y);
    y += 10;
    if (r.challenge) {
      pdf.text("Utmaning: " + r.challenge, 10, y);
      y += 10;
    }
    if (r.photo) {
      pdf.addImage(r.photo, "JPEG", 10, y, 60, 60);
      y += 65;
      if (y > 250) { pdf.addPage(); y = 20; }
    }
  }
  pdf.save("kerneheds-roadtrip.pdf");
};

// Andra knappar
startBtn.onclick = nextStep;
document.getElementById("resetBtn").onclick = () => {
  localStorage.removeItem("roadtripLog");
  location.reload();
};

loadLog();
