from sqlalchemy import Column, Integer, String, Numeric, CheckConstraint

from app.database import Base


class Distance(Base):
    __tablename__ = "distances"
    __table_args__ = (
        CheckConstraint("kilometers IN (5, 21, 42)", name="allowed_distance"),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    name = Column(String(80), nullable=False, unique=True, comment="Название дистанции")
    kilometers = Column(
        Numeric(5, 2),
        nullable=False,
        unique=True,
        comment="Длина дистанции по ТЗ: 5, 21, 42 км",
    )
