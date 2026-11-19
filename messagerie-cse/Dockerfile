FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY serveur.py .

# Utilisateur sans privilèges
RUN useradd --create-home --uid 10001 messagerie
USER messagerie

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/sante')" || exit 1
CMD ["python", "serveur.py"]
