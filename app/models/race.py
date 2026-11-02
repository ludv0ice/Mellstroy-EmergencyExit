from sqlalchemy import (
    Column,
    Integer,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Race(Base):
    __tablename__ = "races"
    __table_args__ = (
        UniqueConstraint("marathon_id", "distance_id"),
        CheckConstraint("capacity > 0", name="positive_capacity"),
    )
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    marathon_id = Column(
        Integer,
        ForeignKey("marathons.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Ежегодное мероприятие",
    )
    distance_id = Column(
        Integer,
        ForeignKey("distances.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Дистанция",
    )
    starts_at = Column(
        DateTime(timezone=True),
        nullable=False,
        comment="Дата и время старта с часовым поясом",
    )
    capacity = Column(Integer, nullable=False, comment="Предельное число участников")
    marathon = relationship("Marathon")
    distance = relationship("Distance")
