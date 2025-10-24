# ML Pipeline Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the drug discovery ML pipeline to production environments.

## Prerequisites

### System Requirements
- **CPU**: 8+ cores recommended
- **RAM**: 16GB minimum, 32GB recommended
- **Storage**: 100GB available space
- **OS**: Linux (Ubuntu 20.04+) or macOS

### Software Dependencies
- Python 3.8+
- Docker (optional, for containerized deployment)
- PostgreSQL 12+ (for data storage)
- Redis (for caching)
- Nginx (for web server)

## Installation Steps

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv ml_pipeline_env
source ml_pipeline_env/bin/activate  # On Windows: ml_pipeline_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Database Configuration

```bash
# Create database
createdb drug_discovery_db

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser
```

### 3. Model Deployment

```bash
# Train and save models
python scripts/train_models.py

# Validate models
python scripts/validate_models.py

# Deploy to production
python scripts/deploy_models.py
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost/drug_discovery_db

# Redis
REDIS_URL=redis://localhost:6379/0

# Model paths
MODEL_PATH=/path/to/trained/models
DATA_PATH=/path/to/data/directory

# API settings
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False

# Security
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1,your-domain.com
```

### Model Configuration

Update `config/models.yaml`:

```yaml
models:
  random_forest:
    path: "models/rf_model.pkl"
    version: "1.0.0"
    active: true
  
  neural_network:
    path: "models/nn_model.pkl"
    version: "1.0.0"
    active: true
  
  ensemble:
    models: ["random_forest", "neural_network"]
    weights: [0.6, 0.4]
    active: true
```

## API Deployment

### 1. FastAPI Application

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Drug Discovery ML API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Drug Discovery ML API"}

@app.post("/predict")
async def predict_drug_activity(smiles: str):
    # Prediction logic here
    return {"prediction": "active", "confidence": 0.85}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 2. Docker Deployment

```dockerfile
# Dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Build and run
docker build -t drug-discovery-api .
docker run -p 8000:8000 drug-discovery-api
```

## Monitoring and Logging

### 1. Application Monitoring

```python
# monitoring.py
import logging
from prometheus_client import Counter, Histogram, start_http_server

# Metrics
REQUEST_COUNT = Counter('api_requests_total', 'Total API requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('api_request_duration_seconds', 'Request duration')

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
```

### 2. Health Checks

```python
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "models_loaded": check_models_loaded(),
        "database_connected": check_database_connection(),
        "timestamp": datetime.utcnow().isoformat()
    }
```

## Performance Optimization

### 1. Caching Strategy

```python
import redis
from functools import wraps

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cache_result(expiration=3600):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached_result = redis_client.get(cache_key)
            
            if cached_result:
                return json.loads(cached_result)
            
            result = func(*args, **kwargs)
            redis_client.setex(cache_key, expiration, json.dumps(result))
            return result
        return wrapper
    return decorator
```

### 2. Load Balancing

```nginx
# nginx.conf
upstream ml_api {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://ml_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Security Considerations

### 1. API Authentication

```python
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(token: str = Depends(security)):
    if not validate_token(token.credentials):
        raise HTTPException(status_code=401, detail="Invalid token")
    return token.credentials
```

### 2. Input Validation

```python
from pydantic import BaseModel, validator

class PredictionRequest(BaseModel):
    smiles: str
    
    @validator('smiles')
    def validate_smiles(cls, v):
        if not is_valid_smiles(v):
            raise ValueError('Invalid SMILES string')
        return v
```

## Troubleshooting

### Common Issues

1. **Model Loading Errors**
   - Check model file paths
   - Verify model compatibility
   - Ensure sufficient memory

2. **Database Connection Issues**
   - Verify connection string
   - Check database server status
   - Validate credentials

3. **Performance Issues**
   - Monitor memory usage
   - Check CPU utilization
   - Review query performance

### Log Analysis

```bash
# View application logs
tail -f app.log

# Monitor system resources
htop

# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:8000/health"
```

## Backup and Recovery

### 1. Database Backup

```bash
# Create backup
pg_dump drug_discovery_db > backup_$(date +%Y%m%d).sql

# Restore backup
psql drug_discovery_db < backup_20240101.sql
```

### 2. Model Backup

```bash
# Backup models
tar -czf models_backup_$(date +%Y%m%d).tar.gz models/

# Restore models
tar -xzf models_backup_20240101.tar.gz
```

## Maintenance

### Regular Tasks

- **Daily**: Monitor system health and performance
- **Weekly**: Review logs and update dependencies
- **Monthly**: Retrain models with new data
- **Quarterly**: Security audit and penetration testing

### Updates

```bash
# Update dependencies
pip install --upgrade -r requirements.txt

# Update models
python scripts/retrain_models.py

# Restart services
sudo systemctl restart ml-api
```
