from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class Marathon(Base):
    __tablename__ = 'marathons'
    __table_args__ = (UniqueConstraint('name', 'year'), CheckConstraint('year >= 1900', name='valid_year'),)
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    name = Column(String(160), nullable=False, comment="Название ежегодного марафона")
    year = Column(Integer, nullable=False, comment="Год проведения")
    city = Column(String(100), nullable=False, comment="Город")
    country_code = Column(String(2), nullable=False, comment="Код страны")
    event_date = Column(Date, nullable=False, comment="Дата проведения")
