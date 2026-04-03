FROM python:3.9-slim
LABEL authors="rotohands"

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    gcc \
    libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV FLASK_APP=/app/flask_analyze_server.py
COPY . /app

CMD ["python", "-u", "-m",  "flask", "run", "--host=0.0.0.0", "--port=8080"]
