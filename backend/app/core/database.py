from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Enable PostGIS extension on connect
@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    with dbapi_conn.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        dbapi_conn.commit()

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
