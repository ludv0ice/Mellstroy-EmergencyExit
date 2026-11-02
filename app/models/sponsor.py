from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class Sponsor(Base):
    __tablename__ = 'sponsors'
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    name = Column(String(160), nullable=False, comment="Имя или название спонсора")
    email = Column(String(254), nullable=False, unique=True, comment="Контактный email")
    phone = Column(String(30), nullable=True, comment="Контактный телефон")
    description = Column(Text, nullable=True, comment="Сведения о спонсоре")
