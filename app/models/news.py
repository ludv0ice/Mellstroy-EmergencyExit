from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class News(Base):
    __tablename__ = "news"
    id = Column(Integer, primary_key=True, comment="Первичный ключ")
    marathon_id = Column(
        Integer,
        ForeignKey("marathons.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Мероприятие",
    )
    author_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Автор новости",
    )
    language_code = Column(
        String(5), nullable=False, server_default="ru", comment="Язык публикации"
    )
    title = Column(String(200), nullable=False, comment="Заголовок")
    body = Column(Text, nullable=False, comment="Текст новости")
    published_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Время публикации; NULL означает черновик",
    )
    marathon = relationship("Marathon")
    author = relationship("User")
