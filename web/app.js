const body = document.querySelector('#readings-body');
const fields = [
  'temperature_C',
  'pressure_hPa',
  'relative_humidity_percent',
];

let selectedLocation = null;
let activeStationId = 'AWS-DEMO-SAMPLE';
let refreshTimer = null;

function renderRows(readings) {
  body.replaceChildren();

  for (let index = 0; index < 24; index++) {
    const reading = readings?.[index];
    const hour = reading?.hour ?? index;
    const row = document.createElement('tr');
    const hourCell = document.createElement('td');
    hourCell.className = 'hour-cell';
    hourCell.textContent = reading?.time ?? `${String(hour).padStart(2, '0')}:00`;
    row.append(hourCell);

    for (const [fieldIndex, field] of fields.entries()) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'reading-input';
      input.type = 'number';
      input.step = fieldIndex === 2 ? '0.1' : '0.01';
      input.required = true;
      input.setAttribute('aria-label', `${field} at ${hourCell.textContent}`);
      input.dataset.field = field;
      input.dataset.index = String(index);
      input.dataset.hour = String(hour);

      if (field === 'relative_humidity_percent') {
        input.min = '0';
        input.max = '100';
      }

      if (reading) {
        input.value = reading[field];
      }

      cell.append(input);
      row.append(cell);
    }

    body.append(row);
  }
}

function sampleReadings() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    time: `${String(hour).padStart(2, '0')}:00`,
    temperature_C: (
      24.5 + 4.1 * Math.sin(((hour - 7) * Math.PI) / 12)
    ).toFixed(1),
    pressure_hPa: (
      1012.6 - hour * 0.045 + 0.25 * Math.sin((hour * Math.PI) / 8)
    ).toFixed(1),
    relative_humidity_percent: (
      62 - 0.32 * hour + 3 * Math.sin((hour * Math.PI) / 12)
    ).toFixed(1),
  }));
}

async function refreshHealth() {
  const pill = document.querySelector('.health-pill');

  try {
    const response = await fetch('/health');
    const health = await response.json();
    const isOnline = health.status === 'ONLINE' && health.artifacts_loaded;

    pill.classList.toggle('online', isOnline);
    pill.classList.toggle('offline', !health.artifacts_loaded);
    document.querySelector('#health-text').textContent = health.artifacts_loaded
      ? 'ENGINE ONLINE'
      : 'MODEL NOT LOADED';
  } catch {
    pill.classList.add('offline');
    document.querySelector('#health-text').textContent = 'ENGINE OFFLINE';
  }
}

function showReport(data) {
  document.querySelector('#empty-state').classList.add('hidden');

  const report = document.querySelector('#report');
  report.classList.remove('hidden');

  const banner = document.querySelector('#status-banner');
  banner.classList.toggle('alert', data.is_anomaly);
  document.querySelector('#status-symbol').textContent = data.is_anomaly
    ? '!'
    : '✓';
  document.querySelector('#result-status').textContent = data.status.replaceAll(
    '_',
    ' ',
  );
  document.querySelector('#alert-tag').textContent = data.alert_triggered
    ? 'ALERT TRIGGERED'
    : 'NO ALERT';
  document.querySelector('#fault-type').textContent = data.fault_type.replaceAll(
    '_',
    ' ',
  );
  document.querySelector('#mse').textContent = Number(
    data.reconstruction_mse,
  ).toFixed(6);

  const fraction = Math.min(
    Number(data.reconstruction_mse) / Math.max(Number(data.threshold) * 1.5, 1e-9),
    1,
  );
  const fill = document.querySelector('#meter-fill');
  fill.style.width = `${Math.max(2, fraction * 100)}%`;
  fill.classList.toggle('danger', data.is_anomaly);

  const observed = data.observed_values;
  const healed = data.healed_values;
  document.querySelector('#obs-temp').textContent = `${observed.temperature_C.toFixed(1)} °C`;
  document.querySelector('#heal-temp').textContent = `${healed.temperature_C.toFixed(1)} °C`;
  document.querySelector('#obs-pressure').textContent = `${observed.pressure_hPa.toFixed(1)} hPa`;
  document.querySelector('#heal-pressure').textContent = `${healed.pressure_hPa.toFixed(1)} hPa`;
  document.querySelector('#obs-humidity').textContent = `${observed.relative_humidity_percent.toFixed(1)} %`;
  document.querySelector('#heal-humidity').textContent = `${healed.relative_humidity_percent.toFixed(1)} %`;
}

async function runDiagnostics() {
  const error = document.querySelector('#error-message');
  const readings = [];
  error.textContent = '';

  for (let index = 0; index < 24; index++) {
    const reading = { hour: index };

    for (const field of fields) {
      const input = body.querySelector(
        `[data-field="${field}"][data-index="${index}"]`,
      );

      if (!input || input.value.trim() === '' || !Number.isFinite(Number(input.value))) {
        error.textContent = `Enter a valid ${field.replaceAll('_', ' ')} for reading ${index + 1}.`;
        input?.focus();
        return;
      }

      reading[field] = Number(input.value);
      if (field === 'temperature_C') {
        reading.hour = Number(input.dataset.hour);
      }
    }

    readings.push(reading);
  }

  if (
    readings.some(
      (row) =>
        row.relative_humidity_percent < 0 ||
        row.relative_humidity_percent > 100,
    )
  ) {
    error.textContent = 'Humidity must be between 0 and 100 percent.';
    return;
  }

  const button = document.querySelector('#run-btn');
  button.disabled = true;
  button.querySelector('span:first-child').textContent = 'Analyzing…';

  try {
    const response = await fetch('/api/v1/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_id: activeStationId, readings }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || `Request failed (${response.status})`);
    }

    showReport(payload);
  } catch (problem) {
    error.textContent = problem.message || 'Could not reach the diagnosis service.';
  } finally {
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'Run diagnostics';
  }
}

function localTimeKey(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

async function fetchWeatherForLocation(location) {
  const weatherMeta = document.querySelector('#weather-meta');
  weatherMeta.textContent = `Loading recent weather for ${location.name}…`;

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    hourly: 'temperature_2m,surface_pressure,relative_humidity_2m',
    past_hours: '24',
    forecast_hours: '1',
    timezone: location.timezone || 'auto',
    temperature_unit: 'celsius',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) {
    throw new Error(`Weather service returned ${response.status}.`);
  }

  const payload = await response.json();
  const hourly = payload.hourly;
  const latestLocalTime = localTimeKey(payload.timezone || location.timezone || 'UTC');
  const available = hourly.time
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time.slice(0, 16) <= latestLocalTime)
    .slice(-24);

  if (available.length !== 24) {
    throw new Error(`Weather service returned ${available.length} usable hourly readings; 24 are needed.`);
  }

  const readings = available.map(({ time, index }) => ({
    hour: Number(time.slice(11, 13)),
    time: time.slice(11, 16),
    temperature_C: hourly.temperature_2m[index],
    pressure_hPa: hourly.surface_pressure[index],
    relative_humidity_percent: hourly.relative_humidity_2m[index],
  }));

  if (readings.some((reading) => fields.some((field) => !Number.isFinite(reading[field])))) {
    throw new Error('Weather service returned incomplete data for this location.');
  }

  renderRows(readings);
  activeStationId = `AWS-OPENMETEO-${location.id}`;
  document.querySelector('.station-chip b').textContent = location.name.toUpperCase();
  document.querySelector('.station-chip small').textContent = `WEATHER GRID · ${location.country}`;
  weatherMeta.textContent = `Updated ${readings.at(-1).time} local time · model-based weather estimates · refreshes every 15 minutes.`;
  await runDiagnostics();
}

async function searchLocationAndFetch() {
  const input = document.querySelector('#location-input');
  const weatherMeta = document.querySelector('#weather-meta');
  const query = input.value.trim();

  if (!query) {
    weatherMeta.textContent = 'Enter a city or town to search.';
    return;
  }

  const button = document.querySelector('#weather-btn');
  button.disabled = true;
  button.textContent = 'Searching…';

  try {
    const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if (!response.ok) {
      throw new Error(`Location search returned ${response.status}.`);
    }

    const result = await response.json();
    const match = result.results?.[0];
    if (!match) {
      throw new Error(`No matching location found for “${query}”.`);
    }

    selectedLocation = {
      id: match.id,
      latitude: match.latitude,
      longitude: match.longitude,
      timezone: match.timezone,
      country: match.country || match.country_code || 'Unknown region',
      name: [match.name, match.admin1, match.country].filter(Boolean).join(', '),
    };

    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    await fetchWeatherForLocation(selectedLocation);
    refreshTimer = setInterval(() => {
      fetchWeatherForLocation(selectedLocation).catch((problem) => {
        weatherMeta.textContent = `Refresh failed: ${problem.message}`;
      });
    }, 15 * 60 * 1000);
  } catch (problem) {
    weatherMeta.textContent = `${problem.message} Check your internet connection or use sample data.`;
  } finally {
    button.disabled = false;
    button.textContent = 'Fetch live weather';
  }
}

document.querySelector('#weather-btn').addEventListener('click', searchLocationAndFetch);
document.querySelector('#location-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchLocationAndFetch();
  }
});

document.querySelector('#sample-btn').addEventListener('click', () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  selectedLocation = null;
  activeStationId = 'AWS-DEMO-SAMPLE';
  renderRows(sampleReadings());
  document.querySelector('.station-chip b').textContent = 'DEMO SAMPLE';
  document.querySelector('.station-chip small').textContent = 'SYNTHETIC TELEMETRY';
  document.querySelector('#weather-meta').textContent = 'Showing synthetic data for an offline/demo fallback.';
  document.querySelector('#error-message').textContent = '';
  runDiagnostics();
});

document.querySelector('#run-btn').addEventListener('click', runDiagnostics);

function updateClock() {
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  document.querySelector('#clock').textContent = `${time} IST`;
}

renderRows();
refreshHealth();
updateClock();
searchLocationAndFetch();
setInterval(updateClock, 30000);
