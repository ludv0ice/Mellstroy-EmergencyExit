"""Интеграционные тесты: TEST_DATABASE_URL должен указывать на ОТДЕЛЬНУЮ пустую БД."""

import os
from datetime import datetime, timezone
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, configure_mappers
from app.database import Base, make_engine
from app.models import (
    User,
    Runner,
    Sponsor,
    Registration,
    Result,
    VolunteerAssignment,
    Sponsorship,
    Distance,
    Certificate,
    Achievement,
)
from scripts.seed import seed


@pytest.fixture(scope="module")
def database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail(
            "Укажите TEST_DATABASE_URL отдельной пустой PostgreSQL БД (будут удалены созданные тестами таблицы)."
        )
    if not url.startswith("postgresql"):
        pytest.fail("Требуется PostgreSQL, не SQLite.")
    engine = make_engine(url)
    if inspect(engine).get_table_names():
        pytest.fail("Тестовая БД должна быть пустой. Существующие таблицы не изменены.")
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    try:
        command.upgrade(cfg, "head")
        command.check(cfg)
        with Session(engine) as s, s.begin():
            seed(s)
        yield engine
    finally:
        command.downgrade(cfg, "base")
        with engine.begin() as c:
            c.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        engine.dispose()
        if old is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old


def test_schema_and_seed(database):
    configure_mappers()
    assert set(inspect(database).get_table_names()) == set(Base.metadata.tables) | {
        "alembic_version"
    }
    with Session(database) as s:
        for table in Base.metadata.sorted_tables:
            count = s.scalar(select(func.count()).select_from(table))
            expected_counts = {
                "roles": 3,
                "distances": 3,
                "races": 150,
                "users": 100,
                "user_roles": 101,
            }
            assert count == expected_counts.get(table.name, 50)
        reg = s.scalar(select(Registration))
        assert reg.runner.user.email.endswith("@example.test")
        assert reg.race.marathon.city == "Екатеринбург"
        for registration in s.scalars(select(Registration)):
            assert registration.runner.birth_date < registration.race.marathon.event_date


@pytest.mark.parametrize(
    "kind",
    [
        "duplicate_email",
        "foreign_key",
        "negative_amount",
        "bad_distance",
        "duplicate_registration",
        "bad_result",
        "bad_confirmation",
        "bad_shift",
        "duplicate_certificate",
    ],
)
def test_constraints(database, kind):
    with Session(database) as s:
        reg = s.scalar(select(Registration))
        sponsor = s.scalars(select(Sponsor).order_by(Sponsor.id)).all()[1]
        user = s.scalar(select(User))
        volunteer = s.scalar(select(VolunteerAssignment))
        cases = {
            "duplicate_email": User(email=user.email, password_hash="disabled"),
            "foreign_key": Achievement(
                runner_id=999999, title="Тест", achieved_on=datetime.now().date()
            ),
            "negative_amount": Sponsorship(
                sponsor_id=sponsor.id, registration_id=reg.id, amount=-1, terms="Тест"
            ),
            "bad_distance": Distance(name="Тест", kilometers=10),
            "duplicate_registration": Registration(
                runner_id=reg.runner_id, race_id=reg.race_id, bib_number=999
            ),
            "bad_result": Result(
                registration_id=reg.id, status="finished", elapsed_seconds=-1
            ),
            "bad_confirmation": Sponsorship(
                sponsor_id=sponsor.id,
                registration_id=reg.id,
                amount=100,
                terms="Тест",
                status="confirmed",
            ),
            "bad_shift": VolunteerAssignment(
                volunteer_id=volunteer.volunteer_id,
                marathon_id=volunteer.marathon_id,
                duty="Тест",
                starts_at=datetime(2030, 1, 2, tzinfo=timezone.utc),
                ends_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
            ),
            "duplicate_certificate": Certificate(
                registration_id=reg.id, number="OTHER", kind="finish"
            ),
        }
        s.add(cases[kind])
        with pytest.raises(IntegrityError) as exc:
            s.flush()
        expected = {
            "duplicate_email": "uq_users_email",
            "foreign_key": "fk_achievements_runner_id_runners",
            "negative_amount": "ck_sponsorships_positive_amount",
            "bad_distance": "ck_distances_allowed_distance",
            "duplicate_registration": "uq_registrations_runner_id",
            "bad_result": "ck_results_valid_finish",
            "bad_confirmation": "ck_sponsorships_confirmation_fields",
            "bad_shift": "ck_volunteer_assignments_valid_shift",
            "duplicate_certificate": "uq_certificates_registration_id",
        }
        assert exc.value.orig.diag.constraint_name == expected[kind]
        s.rollback()


def test_delete_restrict(database):
    with Session(database) as s:
        s.delete(s.scalar(select(Runner)))
        with pytest.raises(IntegrityError):
            s.flush()
        s.rollback()


def test_seed_refuses_nonempty(database):
    with Session(database) as s:
        with pytest.raises(RuntimeError):
            seed(s)
