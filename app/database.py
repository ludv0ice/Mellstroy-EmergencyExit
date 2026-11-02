import os
from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    })

def make_engine(url=None):
    return create_engine(url or os.getenv("DATABASE_URL", "postgresql+psycopg://marathon:marathon_local@localhost:5432/marathon"), pool_pre_ping=True)

def session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)
