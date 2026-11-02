from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Result(Base):
    __tablename__ = "results"
    __table_args__ = (
        CheckConstraint(
            "(status = 'finished' AND elapsed_seconds IS NOT NULL AND elapsed_seconds > 0) OR (status IN ('dnf','dns','dsq') AND elapsed_seconds IS NULL)",
            name="valid_finish",
        ),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    registration_id = Column(
        Integer,
        ForeignKey("registrations.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        comment="Регистрация участника",
    )
    status = Column(String(10), nullable=False, comment="finished, dnf, dns, dsq")
    elapsed_seconds = Column(
        Integer, nullable=True, comment="Время прохождения в секундах; только finished"
    )
    registration = relationship("Registration")
