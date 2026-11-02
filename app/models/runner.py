from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Runner(Base):
    __tablename__ = "runners"
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        comment="Учетная запись бегуна",
    )
    first_name = Column(String(80), nullable=False, comment="Имя")
    last_name = Column(String(80), nullable=False, comment="Фамилия")
    birth_date = Column(Date, nullable=False, comment="Дата рождения")
    country_code = Column(
        String(2), nullable=False, comment="Код страны ISO 3166-1 alpha-2"
    )
    user = relationship("User")
