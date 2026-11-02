import os
from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


def get_database_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise ValueError("Заполните DATABASE_URL в файле .env в корне проекта")
    return url


def make_engine(url=None):
    return create_engine(url or get_database_url(), pool_pre_ping=True)
