BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE TABLE distances (
    id SERIAL NOT NULL, 
    name VARCHAR(80) NOT NULL, 
    kilometers NUMERIC(5, 2) NOT NULL, 
    CONSTRAINT pk_distances PRIMARY KEY (id), 
    CONSTRAINT ck_distances_allowed_distance CHECK (kilometers IN (5, 21, 42)), 
    CONSTRAINT uq_distances_kilometers UNIQUE (kilometers), 
    CONSTRAINT uq_distances_name UNIQUE (name)
);

COMMENT ON COLUMN distances.id IS 'Первичный ключ';

COMMENT ON COLUMN distances.name IS 'Название дистанции';

COMMENT ON COLUMN distances.kilometers IS 'Длина дистанции по ТЗ: 5, 21, 42 км';

CREATE TABLE marathons (
    id SERIAL NOT NULL, 
    name VARCHAR(160) NOT NULL, 
    year INTEGER NOT NULL, 
    city VARCHAR(100) NOT NULL, 
    country_code VARCHAR(2) NOT NULL, 
    event_date DATE NOT NULL, 
    CONSTRAINT pk_marathons PRIMARY KEY (id), 
    CONSTRAINT ck_marathons_valid_year CHECK (year >= 1900), 
    CONSTRAINT uq_marathons_name UNIQUE (name, year)
);

COMMENT ON COLUMN marathons.id IS 'Первичный ключ';

COMMENT ON COLUMN marathons.name IS 'Название ежегодного марафона';

COMMENT ON COLUMN marathons.year IS 'Год проведения';

COMMENT ON COLUMN marathons.city IS 'Город';

COMMENT ON COLUMN marathons.country_code IS 'Код страны';

COMMENT ON COLUMN marathons.event_date IS 'Дата проведения';

CREATE TABLE roles (
    id SERIAL NOT NULL, 
    code VARCHAR(30) NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    CONSTRAINT pk_roles PRIMARY KEY (id), 
    CONSTRAINT uq_roles_code UNIQUE (code)
);

COMMENT ON COLUMN roles.id IS 'Первичный ключ';

COMMENT ON COLUMN roles.code IS 'Код роли';

COMMENT ON COLUMN roles.name IS 'Название роли';

CREATE TABLE sponsors (
    id SERIAL NOT NULL, 
    name VARCHAR(160) NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    phone VARCHAR(30), 
    description TEXT, 
    CONSTRAINT pk_sponsors PRIMARY KEY (id), 
    CONSTRAINT uq_sponsors_email UNIQUE (email)
);

COMMENT ON COLUMN sponsors.id IS 'Первичный ключ';

COMMENT ON COLUMN sponsors.name IS 'Имя или название спонсора';

COMMENT ON COLUMN sponsors.email IS 'Контактный email';

COMMENT ON COLUMN sponsors.phone IS 'Контактный телефон';

COMMENT ON COLUMN sponsors.description IS 'Сведения о спонсоре';

CREATE TABLE users (
    id SERIAL NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    is_active BOOLEAN DEFAULT true NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_users PRIMARY KEY (id), 
    CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email)), 
    CONSTRAINT uq_users_email UNIQUE (email)
);

COMMENT ON COLUMN users.id IS 'Первичный ключ';

COMMENT ON COLUMN users.email IS 'Email в нижнем регистре';

COMMENT ON COLUMN users.password_hash IS 'Хеш пароля; открытый пароль не хранится';

COMMENT ON COLUMN users.is_active IS 'Активна ли учетная запись';

COMMENT ON COLUMN users.created_at IS 'Дата создания';

CREATE TABLE volunteers (
    id SERIAL NOT NULL, 
    first_name VARCHAR(80) NOT NULL, 
    last_name VARCHAR(80) NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    phone VARCHAR(30), 
    CONSTRAINT pk_volunteers PRIMARY KEY (id), 
    CONSTRAINT uq_volunteers_email UNIQUE (email)
);

COMMENT ON COLUMN volunteers.id IS 'Первичный ключ';

COMMENT ON COLUMN volunteers.first_name IS 'Имя волонтера';

COMMENT ON COLUMN volunteers.last_name IS 'Фамилия волонтера';

COMMENT ON COLUMN volunteers.email IS 'Контактный email';

COMMENT ON COLUMN volunteers.phone IS 'Телефон';

CREATE TABLE news (
    id SERIAL NOT NULL, 
    marathon_id INTEGER NOT NULL, 
    author_id INTEGER NOT NULL, 
    language_code VARCHAR(5) DEFAULT 'ru' NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    body TEXT NOT NULL, 
    published_at TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_news PRIMARY KEY (id), 
    CONSTRAINT fk_news_author_id_users FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_news_marathon_id_marathons FOREIGN KEY(marathon_id) REFERENCES marathons (id) ON DELETE RESTRICT
);

COMMENT ON COLUMN news.id IS 'Первичный ключ';

COMMENT ON COLUMN news.marathon_id IS 'Мероприятие';

COMMENT ON COLUMN news.author_id IS 'Автор новости';

COMMENT ON COLUMN news.language_code IS 'Язык публикации';

COMMENT ON COLUMN news.title IS 'Заголовок';

COMMENT ON COLUMN news.body IS 'Текст новости';

COMMENT ON COLUMN news.published_at IS 'Время публикации; NULL означает черновик';

CREATE TABLE races (
    id SERIAL NOT NULL, 
    marathon_id INTEGER NOT NULL, 
    distance_id INTEGER NOT NULL, 
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    capacity INTEGER NOT NULL, 
    CONSTRAINT pk_races PRIMARY KEY (id), 
    CONSTRAINT ck_races_positive_capacity CHECK (capacity > 0), 
    CONSTRAINT fk_races_distance_id_distances FOREIGN KEY(distance_id) REFERENCES distances (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_races_marathon_id_marathons FOREIGN KEY(marathon_id) REFERENCES marathons (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_races_marathon_id UNIQUE (marathon_id, distance_id)
);

COMMENT ON COLUMN races.id IS 'Первичный ключ';

COMMENT ON COLUMN races.marathon_id IS 'Ежегодное мероприятие';

COMMENT ON COLUMN races.distance_id IS 'Дистанция';

COMMENT ON COLUMN races.starts_at IS 'Дата и время старта с часовым поясом';

COMMENT ON COLUMN races.capacity IS 'Предельное число участников';

CREATE TABLE runners (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    first_name VARCHAR(80) NOT NULL, 
    last_name VARCHAR(80) NOT NULL, 
    birth_date DATE NOT NULL, 
    country_code VARCHAR(2) NOT NULL, 
    CONSTRAINT pk_runners PRIMARY KEY (id), 
    CONSTRAINT fk_runners_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_runners_user_id UNIQUE (user_id)
);

COMMENT ON COLUMN runners.id IS 'Первичный ключ';

COMMENT ON COLUMN runners.user_id IS 'Учетная запись бегуна';

COMMENT ON COLUMN runners.first_name IS 'Имя';

COMMENT ON COLUMN runners.last_name IS 'Фамилия';

COMMENT ON COLUMN runners.birth_date IS 'Дата рождения';

COMMENT ON COLUMN runners.country_code IS 'Код страны ISO 3166-1 alpha-2';

CREATE TABLE user_roles (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    role_id INTEGER NOT NULL, 
    CONSTRAINT pk_user_roles PRIMARY KEY (id), 
    CONSTRAINT fk_user_roles_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_user_roles_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_user_roles_user_id UNIQUE (user_id, role_id)
);

COMMENT ON COLUMN user_roles.id IS 'Первичный ключ';

COMMENT ON COLUMN user_roles.user_id IS 'Пользователь';

COMMENT ON COLUMN user_roles.role_id IS 'Роль';

CREATE TABLE volunteer_assignments (
    id SERIAL NOT NULL, 
    volunteer_id INTEGER NOT NULL, 
    marathon_id INTEGER NOT NULL, 
    duty VARCHAR(150) NOT NULL, 
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_volunteer_assignments PRIMARY KEY (id), 
    CONSTRAINT ck_volunteer_assignments_valid_shift CHECK (ends_at > starts_at), 
    CONSTRAINT fk_volunteer_assignments_marathon_id_marathons FOREIGN KEY(marathon_id) REFERENCES marathons (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_volunteer_assignments_volunteer_id_volunteers FOREIGN KEY(volunteer_id) REFERENCES volunteers (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_volunteer_assignments_volunteer_id UNIQUE (volunteer_id, marathon_id, starts_at)
);

COMMENT ON COLUMN volunteer_assignments.id IS 'Первичный ключ';

COMMENT ON COLUMN volunteer_assignments.volunteer_id IS 'Волонтер';

COMMENT ON COLUMN volunteer_assignments.marathon_id IS 'Мероприятие';

COMMENT ON COLUMN volunteer_assignments.duty IS 'Обязанности';

COMMENT ON COLUMN volunteer_assignments.starts_at IS 'Начало смены';

COMMENT ON COLUMN volunteer_assignments.ends_at IS 'Окончание смены';

CREATE TABLE achievements (
    id SERIAL NOT NULL, 
    runner_id INTEGER NOT NULL, 
    title VARCHAR(150) NOT NULL, 
    description TEXT, 
    achieved_on DATE NOT NULL, 
    CONSTRAINT pk_achievements PRIMARY KEY (id), 
    CONSTRAINT fk_achievements_runner_id_runners FOREIGN KEY(runner_id) REFERENCES runners (id) ON DELETE RESTRICT
);

COMMENT ON COLUMN achievements.id IS 'Первичный ключ';

COMMENT ON COLUMN achievements.runner_id IS 'Бегун';

COMMENT ON COLUMN achievements.title IS 'Название достижения';

COMMENT ON COLUMN achievements.description IS 'Описание достижения';

COMMENT ON COLUMN achievements.achieved_on IS 'Дата достижения';

CREATE INDEX ix_achievements_runner_id ON achievements (runner_id);

CREATE TABLE registrations (
    id SERIAL NOT NULL, 
    runner_id INTEGER NOT NULL, 
    race_id INTEGER NOT NULL, 
    bib_number INTEGER NOT NULL, 
    status VARCHAR(20) DEFAULT 'pending' NOT NULL, 
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_registrations PRIMARY KEY (id), 
    CONSTRAINT ck_registrations_valid_status CHECK (status IN ('pending','confirmed','cancelled')), 
    CONSTRAINT ck_registrations_positive_bib CHECK (bib_number > 0), 
    CONSTRAINT fk_registrations_race_id_races FOREIGN KEY(race_id) REFERENCES races (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_registrations_runner_id_runners FOREIGN KEY(runner_id) REFERENCES runners (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_registrations_race_id UNIQUE (race_id, bib_number), 
    CONSTRAINT uq_registrations_runner_id UNIQUE (runner_id, race_id)
);

COMMENT ON COLUMN registrations.id IS 'Первичный ключ';

COMMENT ON COLUMN registrations.runner_id IS 'Бегун';

COMMENT ON COLUMN registrations.race_id IS 'Забег';

COMMENT ON COLUMN registrations.bib_number IS 'Нагрудный номер в пределах забега';

COMMENT ON COLUMN registrations.status IS 'pending, confirmed, cancelled';

COMMENT ON COLUMN registrations.registered_at IS 'Время регистрации';

CREATE INDEX ix_registrations_race_id ON registrations (race_id);

CREATE INDEX ix_registrations_runner_id ON registrations (runner_id);

CREATE TABLE certificates (
    id SERIAL NOT NULL, 
    registration_id INTEGER NOT NULL, 
    number VARCHAR(60) NOT NULL, 
    kind VARCHAR(20) NOT NULL, 
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    file_path VARCHAR(500), 
    CONSTRAINT pk_certificates PRIMARY KEY (id), 
    CONSTRAINT ck_certificates_valid_kind CHECK (kind IN ('participation','finish')), 
    CONSTRAINT fk_certificates_registration_id_registrations FOREIGN KEY(registration_id) REFERENCES registrations (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_certificates_number UNIQUE (number), 
    CONSTRAINT uq_certificates_registration_id UNIQUE (registration_id)
);

COMMENT ON COLUMN certificates.id IS 'Первичный ключ';

COMMENT ON COLUMN certificates.registration_id IS 'Регистрация, для которой выдан сертификат';

COMMENT ON COLUMN certificates.number IS 'Уникальный номер сертификата';

COMMENT ON COLUMN certificates.kind IS 'participation или finish';

COMMENT ON COLUMN certificates.issued_at IS 'Дата выдачи';

COMMENT ON COLUMN certificates.file_path IS 'Путь к файлу сертификата';

CREATE TABLE results (
    id SERIAL NOT NULL, 
    registration_id INTEGER NOT NULL, 
    status VARCHAR(10) NOT NULL, 
    elapsed_seconds INTEGER, 
    CONSTRAINT pk_results PRIMARY KEY (id), 
    CONSTRAINT ck_results_valid_finish CHECK ((status = 'finished' AND elapsed_seconds IS NOT NULL AND elapsed_seconds > 0) OR (status IN ('dnf','dns','dsq') AND elapsed_seconds IS NULL)), 
    CONSTRAINT fk_results_registration_id_registrations FOREIGN KEY(registration_id) REFERENCES registrations (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_results_registration_id UNIQUE (registration_id)
);

COMMENT ON COLUMN results.id IS 'Первичный ключ';

COMMENT ON COLUMN results.registration_id IS 'Регистрация участника';

COMMENT ON COLUMN results.status IS 'finished, dnf, dns, dsq';

COMMENT ON COLUMN results.elapsed_seconds IS 'Время прохождения в секундах; только finished';

CREATE TABLE sponsorships (
    id SERIAL NOT NULL, 
    sponsor_id INTEGER NOT NULL, 
    registration_id INTEGER NOT NULL, 
    amount NUMERIC(12, 2) NOT NULL, 
    currency VARCHAR(3) DEFAULT 'RUB' NOT NULL, 
    terms TEXT NOT NULL, 
    document_path VARCHAR(500), 
    status VARCHAR(20) DEFAULT 'pending' NOT NULL, 
    confirmed_by_id INTEGER, 
    confirmed_at TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_sponsorships PRIMARY KEY (id), 
    CONSTRAINT ck_sponsorships_confirmation_fields CHECK ((status = 'confirmed' AND confirmed_by_id IS NOT NULL AND confirmed_at IS NOT NULL) OR (status <> 'confirmed' AND confirmed_by_id IS NULL AND confirmed_at IS NULL)), 
    CONSTRAINT ck_sponsorships_valid_status CHECK (status IN ('pending','confirmed','rejected')), 
    CONSTRAINT ck_sponsorships_positive_amount CHECK (amount > 0), 
    CONSTRAINT fk_sponsorships_confirmed_by_id_users FOREIGN KEY(confirmed_by_id) REFERENCES users (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_sponsorships_registration_id_registrations FOREIGN KEY(registration_id) REFERENCES registrations (id) ON DELETE RESTRICT, 
    CONSTRAINT fk_sponsorships_sponsor_id_sponsors FOREIGN KEY(sponsor_id) REFERENCES sponsors (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_sponsorships_sponsor_id UNIQUE (sponsor_id, registration_id)
);

COMMENT ON COLUMN sponsorships.id IS 'Первичный ключ';

COMMENT ON COLUMN sponsorships.sponsor_id IS 'Спонсор';

COMMENT ON COLUMN sponsorships.registration_id IS 'Участие конкретного бегуна';

COMMENT ON COLUMN sponsorships.amount IS 'Сумма спонсорства';

COMMENT ON COLUMN sponsorships.currency IS 'Код валюты ISO 4217';

COMMENT ON COLUMN sponsorships.terms IS 'Условия соглашения';

COMMENT ON COLUMN sponsorships.document_path IS 'Ссылка на документ; файл хранится вне БД';

COMMENT ON COLUMN sponsorships.status IS 'pending, confirmed, rejected';

COMMENT ON COLUMN sponsorships.confirmed_by_id IS 'Координатор, подтвердивший соглашение';

COMMENT ON COLUMN sponsorships.confirmed_at IS 'Время подтверждения';

CREATE INDEX ix_sponsorships_registration_id ON sponsorships (registration_id);

CREATE INDEX ix_sponsorships_sponsor_id ON sponsorships (sponsor_id);

INSERT INTO alembic_version (version_num) VALUES ('0001') RETURNING alembic_version.version_num;

COMMIT;

