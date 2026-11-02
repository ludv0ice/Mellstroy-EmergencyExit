"""Детерминированные синтетические данные. Только отдельная учебная БД."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.database import make_engine
from app.models import (
    Role,
    User,
    UserRole,
    Runner,
    Marathon,
    Distance,
    Race,
    Registration,
    Result,
    Sponsor,
    Sponsorship,
    Certificate,
    Volunteer,
    VolunteerAssignment,
    News,
    Achievement,
)


def seed(session):
    if session.scalar(select(func.count()).select_from(User)):
        raise RuntimeError("Заполнение разрешено только для пустой учебной БД.")
    roles = [
        Role(code=c, name=n)
        for c, n in [
            ("runner", "Бегун"),
            ("coordinator", "Координатор"),
            ("admin", "Администратор"),
        ]
    ]
    distances = [
        Distance(name=n, kilometers=k)
        for n, k in [("5 км", 5), ("Полумарафон", 21), ("Марафон", 42)]
    ]
    session.add_all(roles + distances)
    session.flush()
    for i in range(50):
        # Нет рабочего пароля: все демонстрационные учетные записи отключены.
        user = User(
            email=f"runner{i+1}@example.test",
            password_hash="!disabled-demo-account",
            is_active=False,
        )
        coordinator = User(
            email=f"coordinator{i+1}@example.test",
            password_hash="!disabled-demo-account",
            is_active=False,
        )
        session.add_all([user, coordinator])
        session.flush()
        session.add_all(
            [
                UserRole(user_id=user.id, role_id=roles[0].id),
                UserRole(user_id=coordinator.id, role_id=roles[1].id),
            ]
        )
        if i == 0:
            session.add(UserRole(user_id=coordinator.id, role_id=roles[2].id))
        runner = Runner(
            user_id=user.id,
            first_name=["Руслан", "Иван", "Анна", "Мария", "Алексей"][i % 5],
            last_name=f"Участник-{i+1}",
            birth_date=date(1935 + i, 1 + i % 12, 1 + i % 25),
            country_code="RU",
        )
        marathon = Marathon(
            name="Учебный международный марафон",
            year=1976 + i,
            city="Екатеринбург",
            country_code="RU",
            event_date=date(1976 + i, 9, 15),
        )
        sponsor = Sponsor(
            name=f"Учебный спонсор {i+1}",
            email=f"sponsor{i+1}@example.test",
            description="Синтетическая организация для проверки БД",
        )
        volunteer = Volunteer(
            first_name="Волонтер",
            last_name=f"Учебный-{i+1}",
            email=f"volunteer{i+1}@example.test",
        )
        session.add_all([runner, marathon, sponsor, volunteer])
        session.flush()
        start = datetime(1976 + i, 9, 15, 6, tzinfo=timezone.utc)
        races = [
            Race(
                marathon_id=marathon.id,
                distance_id=d.id,
                starts_at=start,
                capacity=1000,
            )
            for d in distances
        ]
        session.add_all(races)
        session.flush()
        registration = Registration(
            runner_id=runner.id,
            race_id=races[i % 3].id,
            bib_number=i + 1,
            status="confirmed",
            registered_at=start - timedelta(days=30),
        )
        session.add(registration)
        session.flush()
        session.add_all(
            [
                Result(
                    registration_id=registration.id,
                    status="finished",
                    elapsed_seconds=[1800, 7200, 14400][i % 3] + i * 5,
                ),
                Sponsorship(
                    sponsor_id=sponsor.id,
                    registration_id=registration.id,
                    amount=Decimal("5000.00") + i * 100,
                    currency="RUB",
                    terms="Учебное соглашение: поддержка участия бегуна",
                    status="confirmed",
                    confirmed_by_id=coordinator.id,
                    confirmed_at=start - timedelta(days=10),
                ),
                Certificate(
                    registration_id=registration.id,
                    number=f"DEMO-{1976+i}-{i+1:04}",
                    kind="finish",
                    issued_at=start + timedelta(days=1),
                ),
                VolunteerAssignment(
                    volunteer_id=volunteer.id,
                    marathon_id=marathon.id,
                    duty="Выдача воды на дистанции",
                    starts_at=start - timedelta(hours=1),
                    ends_at=start + timedelta(hours=8),
                ),
                News(
                    marathon_id=marathon.id,
                    author_id=coordinator.id,
                    title=f"Регистрация на учебный марафон {1976+i}",
                    body="Доступны дистанции 5, 21 и 42 км. Все сведения демонстрационные.",
                    published_at=start - timedelta(days=60),
                ),
                Achievement(
                    runner_id=runner.id,
                    title="Завершение дистанции",
                    description="Учебная запись достижения",
                    achieved_on=start.date(),
                ),
            ]
        )
    session.flush()


def main():
    with Session(make_engine()) as session, session.begin():
        seed(session)
    print("Демонстрационные данные созданы одной транзакцией.")


if __name__ == "__main__":
    main()
