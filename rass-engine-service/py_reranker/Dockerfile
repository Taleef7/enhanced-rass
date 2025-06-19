# Use an official Python runtime as a parent image
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY rerank_service.py ./

EXPOSE 8008

CMD ["uvicorn", "rerank_service:app", "--host", "0.0.0.0", "--port", "8008"]
