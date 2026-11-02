from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, func, true
from sqlalchemy.orm import relationship
from app.database import Base


class Registration(Base):
    __tablename__ = 'registrations'
    __table_args__ = (UniqueConstraint('runner_id', 'race_id'), UniqueConstraint('race_id', 'bib_number'), CheckConstraint('bib_number > 0', name='positive_bib'), CheckConstraint("status IN ('pending','confirmed','cancelled')", name='valid_status'),)
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    runner_id = Column(Integer, ForeignKey('runners.id', ondelete='RESTRICT'), nullable=False, index=True, comment="Бегун")
    race_id = Column(Integer, ForeignKey('races.id', ondelete='RESTRICT'), nullable=False, index=True, comment="Забег")
    bib_number = Column(Integer, nullable=False, comment="Нагрудный номер в пределах забега")
    status = Column(String(20), nullable=False, server_default='pending', comment="pending, confirmed, cancelled")
    registered_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="Время регистрации")
    runner = relationship('Runner')
    race = relationship('Race')
