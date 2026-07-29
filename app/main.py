import time
from pydantic import HttpUrl, BaseModel
import fastapi
import psycopg2
import os
import logging
import structlog
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
first_id = 10000

base_url = os.getenv("BASE_URL", "http://localhost:8000/")
user = os.getenv("DB_USER", "your_username")
password = os.getenv("DB_PASS", "your_password")
database = os.getenv("DB_NAME", "your_database")
host = os.getenv("DB_HOST", "localhost")

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, LOG_LEVEL)),
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger()
app = fastapi.FastAPI()
class URLRequest(BaseModel):
    url: HttpUrl

def get_db_connection():
    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                    host=host,
                    database=database,
                    user=user,
                    password=password
            )
            break
        except psycopg2.OperationalError as e:
            log.warning("db_retry", attempt=attempt + 1, error=str(e))
            time.sleep(5) 
    else:
        log.error("db_connection_failed", attempts=3)
        raise fastapi.HTTPException(status_code=503)
    try:
        yield conn

    finally:
        conn.close()

def encode_62(num):
    characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base = len(characters)
    encoded = ""
    
    while num > 0:
        remainder = num % base
        encoded = characters[remainder] + encoded
        num //= base
    
    return encoded

@app.get("/")
def read_root():
    return FileResponse("index.html")

@app.post("/shorten")
def shorten_url(url: URLRequest, conn=fastapi.Depends(get_db_connection)):
    cur = conn.cursor()

    cur.execute("SELECT nextval('urls_id_seq')")
    db_id = cur.fetchone()[0]
    
    url_id = db_id + first_id
    short_code = encode_62(url_id)

    cur.execute("INSERT INTO urls (id, original_url, short_code) VALUES (%s,%s, %s)", (url_id, str(url.url), short_code))
    conn.commit()
    cur.close()
    
    short_url = f"{base_url}{short_code}"
    log.info("url_shortened", original_url=str(url.url), short_url=short_url)
    return {"original_url": url.url, "short_url": short_url}

@app.get("/{short_code}")
def redirect_url(short_code: str, conn=fastapi.Depends(get_db_connection)):
    cur = conn.cursor()
    cur.execute("SELECT original_url FROM urls WHERE short_code = %s", (short_code,))
    result = cur.fetchone()
    cur.close()

    if result:
        original_url = result[0]
        log.info("redirect_hit", short_code=short_code, original_url=original_url)
        return fastapi.responses.RedirectResponse(original_url)
    else:
        log.info("redirect_miss", short_code=short_code)
        return fastapi.responses.JSONResponse(status_code=404, content={"message": "URL no encontrada"})    
