
const ORS_API_KEY = '5b3ce3597851110001cf624836bf313777364123b8266f2b3c09e17e';

let map, routeLayer;
let currentPos = null;
let destinationCoords = null;
let routeLog = JSON.parse(localStorage.getItem('routeLog') || '[]');
let images = [];

const logDiv = document.getElementById('log');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const destInput = document.getElementById('destinationAddress');
const imageUpload = document.getElementById('imageUpload');

function log(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  logDiv.appendChild(p);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function saveLog() {
  localStorage.setItem('routeLog', JSON.stringify(routeLog));
}

function clearLog() {
  routeLog = [];
  saveLog();
  logDiv.innerHTML = '';
}

function initMap() {
  map = L.map('map').setView([60.674, 17.141], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  if (routeLog.length > 0) {
    for (let i = 0; i < routeLog.length; i++) {
      addMarker(routeLog[i].coords, routeLog[i].desc);
      if (i > 0) drawRoute(routeLog[i-1].coords, routeLog[i].coords);
    }
    currentPos = routeLog[routeLog.length -1].coords;
  }
}

function addMarker(latlng, text) {
  const mk = L.marker(latlng).addTo(routeLayer);
  mk.bindPopup(text).openPopup();
}

async function getRoute(start, end) {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const body = { coordinates: [ [start[1], start[0]], [end[1], end[0]] ] };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("ORS API fel");
  return await response.json();
}

async function drawRoute(start, end) {
  try {
    const data = await getRoute(start, end);
    const segment = L.geoJSON(data, { style: { color: 'cyan', weight: 5 }});
    segment.addTo(routeLayer);
  } catch {
    log("Kunde inte hämta rutt, försök igen.");
  }
}

function randomMove([lat, lon]) {
  const mil = Math.floor(Math.random() * 10) + 1;
  const dir = Math.random() * 2 * Math.PI;
  const deltaLat = Math.cos(dir) * mil * 0.09;
  const deltaLon = Math.sin(dir) * mil * 0.09 / Math.cos(lat * Math.PI / 180);
  return [lat + deltaLat, lon + deltaLon];
}

async function getPlaceName(lat, lon) {
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
    const data = await resp.json();
    const address = data.address;
    return (
      address.village ||
      address.town ||
      address.city ||
      address.hamlet ||
      address.county ||
      address.state ||
      address.country ||
      "Okänd plats"
    );
  } catch {
    return "Okänd plats";
  }
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  if (!currentPos) {
    try {
      currentPos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve([pos.coords.latitude, pos.coords.longitude]),
          () => reject(),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
      log("Start från GPS: " + currentPos.map(x => x.toFixed(4)).join(", "));
    } catch {
      currentPos = [60.674, 17.141];
      log("Start från Gävle (ingen GPS).");
    }
  }
  await nextStep();
  startBtn.disabled = false;
});

async function nextStep() {
  if (destInput.value.trim() && !destinationCoords) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput.value.trim())}`);
      const data = await res.json();
      if (data.length) destinationCoords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch {}
  }

  if (destinationCoords && getDistance(currentPos, destinationCoords) < 0.5) {
    log("🎉 Du är framme!");
    addMarker(destinationCoords, "Slutmål");
    startBtn.textContent = "Börja";
    currentPos = null;
    destinationCoords = null;
    return;
  }

  let newPos;
  if (destinationCoords) {
    const stepLat = (destinationCoords[0] - currentPos[0]) / 10;
    const stepLon = (destinationCoords[1] - currentPos[1]) / 10;
    newPos = [currentPos[0] + stepLat, currentPos[1] + stepLon];
  } else {
    newPos = randomMove(currentPos);
  }

  const name = await getPlaceName(newPos[0], newPos[1]);
  log(
    `Reser till ${name}<br>
     <a href="https://www.google.com/maps/search/?api=1&query=${newPos[0]},${newPos[1]}" target="_blank">📍 Google Maps</a> |
     <a href="https://waze.com/ul?ll=${newPos[0]},${newPos[1]}&navigate=yes" target="_blank">🚗 Waze</a>`
  );
  addMarker(newPos, name);
  await drawRoute(currentPos, newPos);
  routeLog.push({ coords: newPos, desc: name });
  saveLog();
  currentPos = newPos;
  startBtn.textContent = "Nästa";
}

function getDistance([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

resetBtn.addEventListener('click', () => {
  routeLayer.clearLayers();
  clearLog();
  currentPos = null;
  destinationCoords = null;
  startBtn.textContent = "Börja";
  images = [];
  imageUpload.value = '';
});

imageUpload.addEventListener('change', () => {
  [...imageUpload.files].forEach(file => {
    const reader = new FileReader();
    reader.onload = e => { images.push(e.target.result); log("Bild uppladdad."); };
    reader.readAsDataURL(file);
  });
});

exportBtn.addEventListener('click', () => {
  if (!routeLog.length) return alert("Ingen reselog ännu.");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFontSize(18);
  pdf.text("Kerneheds Roadtrip 🚗", 10, 20);
  pdf.setFontSize(12);
  let y = 30;
  routeLog.forEach((r, i) => {
    pdf.text(`${i+1}. ${r.desc} (${r.coords[0].toFixed(3)}, ${r.coords[1].toFixed(3)})`, 10, y);
    y += 10; if (y > 280) { pdf.addPage(); y = 20; }
  });
  if (images.length) {
    pdf.addPage(); y = 20;
    images.forEach(img => {
      pdf.addImage(img, "JPEG", 10, y, 60, 60);
      y += 65; if (y > 250) { pdf.addPage(); y = 20; }
    });
  }
  pdf.save("roadtrip.pdf");
});

initMap();
