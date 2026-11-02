from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class Volunteer(Base):
    __tablename__ = 'volunteers'
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    first_name = Column(String(80), nullable=False, comment="Имя волонтера")
    last_name = Column(String(80), nullable=False, comment="Фамилия волонтера")
    email = Column(String(254), nullable=False, unique=True, comment="Контактный email")
    phone = Column(String(30), nullable=True, comment="Телефон")
