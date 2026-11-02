from sqlalchemy import Column, Integer, String, Text, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    runner_id = Column(
        Integer,
        ForeignKey("runners.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Бегун",
    )
    title = Column(String(150), nullable=False, comment="Название достижения")
    description = Column(Text, nullable=True, comment="Описание достижения")
    achieved_on = Column(Date, nullable=False, comment="Дата достижения")
    runner = relationship("Runner")
