from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (
        CheckConstraint("kind IN ('participation','finish')", name="valid_kind"),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    registration_id = Column(
        Integer,
        ForeignKey("registrations.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        comment="Регистрация, для которой выдан сертификат",
    )
    number = Column(
        String(60), nullable=False, unique=True, comment="Уникальный номер сертификата"
    )
    kind = Column(String(20), nullable=False, comment="participation или finish")
    issued_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Дата выдачи",
    )
    file_path = Column(String(500), nullable=True, comment="Путь к файлу сертификата")
    registration = relationship("Registration")
