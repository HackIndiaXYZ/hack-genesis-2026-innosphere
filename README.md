# SkyGuard AI Platform

SkyGuard is a demo dashboard and FastAPI service for detecting anomalies in a 24-hour weather telemetry window. It uses a trained LSTM autoencoder and heuristic signal checks to flag possible sensor faults, then applies a Kalman filter to estimate healed current readings.

> The dashboard's live-weather mode uses model-based weather estimates from Open-Meteo. These are not readings from a physical AWS sensor. Synthetic sample data is also available for offline demonstrations.

## Features

- Browser dashboard for service health, weather data, and diagnosis results.
- City and town lookup with hourly temperature, surface pressure, and relative humidity from Open-Meteo.
- Diagnosis of exactly 24 chronological readings, including fault classification, alert state, reconstruction error, and observed/healed values.
- Synthetic sample data for demonstrations without an internet connection.
- FastAPI interactive documentation at `/docs`.

## Requirements

- Python 3.12 (recommended for the currently supported PyTorch installation)
- Internet access for location lookup and Open-Meteo weather data; sample data works offline
- Model files in `skyguard_model_package/`:
  - `lstm_autoencoder_best.pt`
  - `robust_scaler.pkl`

## Setup and run

From the project directory, create and activate a virtual environment, install dependencies, and start the API:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

On Windows, activate the environment with `.venv\Scripts\activate`.

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) to use the dashboard. Keep the server running while using it; press `Ctrl+C` in the terminal to stop it. If port `8000` is busy, use `--port 8001` and open `http://127.0.0.1:8001`.

## API

### `GET /health`

Returns service status, whether model artifacts loaded, and the inference device.

### `POST /api/v1/diagnose`

Submits a sequence of exactly 24 readings. Each reading contains temperature in Celsius, pressure in hPa, relative humidity as a percentage, and an hour from 0 to 23.

Example request:

```json
{
  "station_id": "AWS-DELHI-001",
  "readings": [
    {
      "temperature_C": 25.4,
      "pressure_hPa": 1008.2,
      "relative_humidity_percent": 61.0,
      "hour": 0
    }
  ]
}
```

The `readings` array must contain 24 items. The response includes `status`, `is_anomaly`, `fault_type`, `reconstruction_mse`, `threshold`, `alert_triggered`, `observed_values`, and `healed_values`. See `/docs` for the full schema and a try-it-out interface.

## Project layout

```text
main.py                       FastAPI service, model inference, and diagnosis logic
web/                          Dashboard HTML, CSS, and JavaScript
skyguard_model_package/       Trained model and scaler artifacts
requirements.txt              Python dependencies
```

## Data source and limitations

Location search and hourly weather estimates use the Open-Meteo Geocoding and Forecast APIs. An internet connection is needed for these features, and the dashboard provides an attribution link. The service is intended for demonstration and development; do not expose the development server as a production deployment.
