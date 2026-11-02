from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(Base):
    __tablename__ = 'user_roles'
    __table_args__ = (UniqueConstraint('user_id', 'role_id'),)
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, comment="Пользователь")
    role_id = Column(Integer, ForeignKey('roles.id', ondelete='RESTRICT'), nullable=False, comment="Роль")
    user = relationship('User')
    role = relationship('Role')
