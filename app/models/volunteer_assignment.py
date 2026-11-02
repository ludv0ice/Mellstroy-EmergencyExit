from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


class VolunteerAssignment(Base):
    __tablename__ = "volunteer_assignments"
    __table_args__ = (
        UniqueConstraint("volunteer_id", "marathon_id", "starts_at"),
        CheckConstraint("ends_at > starts_at", name="valid_shift"),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    volunteer_id = Column(
        Integer,
        ForeignKey("volunteers.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Волонтер",
    )
    marathon_id = Column(
        Integer,
        ForeignKey("marathons.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Мероприятие",
    )
    duty = Column(String(150), nullable=False, comment="Обязанности")
    starts_at = Column(DateTime(timezone=True), nullable=False, comment="Начало смены")
    ends_at = Column(DateTime(timezone=True), nullable=False, comment="Окончание смены")
    volunteer = relationship("Volunteer")
    marathon = relationship("Marathon")
