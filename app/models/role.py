from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    code = Column(String(30), nullable=False, unique=True, comment="Код роли")
    name = Column(String(100), nullable=False, comment="Название роли")
