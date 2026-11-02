from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    CheckConstraint,
    func,
    true,
)

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("email = lower(email)", name="email_lowercase"),)
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    email = Column(
        String(254), nullable=False, unique=True, comment="Email в нижнем регистре"
    )
    password_hash = Column(
        String(255), nullable=False, comment="Хеш пароля; открытый пароль не хранится"
    )
    is_active = Column(
        Boolean,
        nullable=False,
        server_default=true(),
        comment="Активна ли учетная запись",
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Дата создания",
    )
