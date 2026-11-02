from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Numeric,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Sponsorship(Base):
    __tablename__ = "sponsorships"
    __table_args__ = (
        UniqueConstraint("sponsor_id", "registration_id"),
        CheckConstraint("amount > 0", name="positive_amount"),
        CheckConstraint(
            "status IN ('pending','confirmed','rejected')", name="valid_status"
        ),
        CheckConstraint(
            "(status = 'confirmed' AND confirmed_by_id IS NOT NULL AND confirmed_at IS NOT NULL) OR (status <> 'confirmed' AND confirmed_by_id IS NULL AND confirmed_at IS NULL)",
            name="confirmation_fields",
        ),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    sponsor_id = Column(
        Integer,
        ForeignKey("sponsors.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Спонсор",
    )
    registration_id = Column(
        Integer,
        ForeignKey("registrations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Участие конкретного бегуна",
    )
    amount = Column(Numeric(12, 2), nullable=False, comment="Сумма спонсорства")
    currency = Column(
        String(3), nullable=False, server_default="RUB", comment="Код валюты ISO 4217"
    )
    terms = Column(Text, nullable=False, comment="Условия соглашения")
    document_path = Column(
        String(500), nullable=True, comment="Ссылка на документ; файл хранится вне БД"
    )
    status = Column(
        String(20),
        nullable=False,
        server_default="pending",
        comment="pending, confirmed, rejected",
    )
    confirmed_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Координатор, подтвердивший соглашение",
    )
    confirmed_at = Column(
        DateTime(timezone=True), nullable=True, comment="Время подтверждения"
    )
    sponsor = relationship("Sponsor")
    registration = relationship("Registration")
    confirmed_by = relationship("User")
