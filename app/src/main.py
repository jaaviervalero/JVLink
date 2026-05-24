import os
import fastapi, uvicorn

from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Sequence, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Link(Base):
    __tablename__ = "links"
    id = Column(Integer, Sequence('links_id_seq', start=10000), primary_key=True, index=True)
    original_url = Column(String, nullable=False)
    short_code = Column(String, unique=True, index=True, nullable=False)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def base62_encode(num : int) -> str:
    characters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base62 = ""
    while num > 0:
        remainder = num % 62
        base62 = characters[remainder] + base62
        num //= 62
    return base62 or "0"

templates = Jinja2Templates(directory="/app/templates")
app = fastapi.FastAPI()

class LinkRequest(BaseModel):
    url: str

@app.get("/")
async def root(request: Request):
   return templates.TemplateResponse(
        request=request, name="index.html")

@app.post("/shorten")
async def shorten_url(request: LinkRequest, db: Session = fastapi.Depends(get_db)):
    clean_url = request.url
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = "https://" + clean_url
    
    next_id_query = text("SELECT nextval('links_id_seq')")
    next_id = db.execute(next_id_query).scalar()
    
    code = base62_encode(next_id)
    
    new_link = Link(id=next_id, original_url=request.url, short_code=code)
    db.add(new_link)
    db.commit()
    
    return {
        "original_url": new_link.original_url,
        "short_url": f"{request.base_url}{new_link.short_code}"
    }

@app.get("/{code}")
async def redirect_to_original(code: str, db: Session = fastapi.Depends(get_db)):
    link = db.query(Link).filter(Link.short_code == code).first()
    if link:
        return fastapi.responses.RedirectResponse(link.original_url)
    raise fastapi.HTTPException(status_code=404, detail="URL not found")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

