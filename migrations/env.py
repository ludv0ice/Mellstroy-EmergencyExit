import os
from alembic import context
from app.database import Base, make_engine
import app.models  # noqa: F401

target_metadata = Base.metadata
if context.is_offline_mode():
    context.configure(url=os.getenv("DATABASE_URL", "postgresql+psycopg://marathon:marathon_local@localhost:5432/marathon"), target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with make_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
