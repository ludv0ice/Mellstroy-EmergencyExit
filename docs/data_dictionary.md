# Словарь данных

Схема PostgreSQL. PK — первичный ключ, FK — внешний ключ. UNIQUE и CHECK приведены после каждой таблицы.

## distances

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  UNIQUE | name | VARCHAR(80) | Нет | — | Название дистанции |
|  UNIQUE | kilometers | NUMERIC(5, 2) | Нет | — | Длина дистанции по ТЗ: 5, 21, 42 км |

UNIQUE: `kilometers`.

UNIQUE: `name`.

CHECK: `kilometers IN (5, 21, 42)`.

## marathons

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  | name | VARCHAR(160) | Нет | — | Название ежегодного марафона |
|  | year | INTEGER | Нет | — | Год проведения |
|  | city | VARCHAR(100) | Нет | — | Город |
|  | country_code | VARCHAR(2) | Нет | — | Код страны |
|  | event_date | DATE | Нет | — | Дата проведения |

UNIQUE: `name, year`.

CHECK: `year >= 1900`.

## roles

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  UNIQUE | code | VARCHAR(30) | Нет | — | Код роли |
|  | name | VARCHAR(100) | Нет | — | Название роли |

UNIQUE: `code`.

## sponsors

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  | name | VARCHAR(160) | Нет | — | Имя или название спонсора |
|  UNIQUE | email | VARCHAR(254) | Нет | — | Контактный email |
|  | phone | VARCHAR(30) | Да | — | Контактный телефон |
|  | description | TEXT | Да | — | Сведения о спонсоре |

UNIQUE: `email`.

## users

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  UNIQUE | email | VARCHAR(254) | Нет | — | Email в нижнем регистре |
|  | password_hash | VARCHAR(255) | Нет | — | Хеш пароля; открытый пароль не хранится |
|  | is_active | BOOLEAN | Нет | true | Активна ли учетная запись |
|  | created_at | TIMESTAMP WITH TIME ZONE | Нет | now() | Дата создания |

UNIQUE: `email`.

CHECK: `email = lower(email)`.

## volunteers

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
|  | first_name | VARCHAR(80) | Нет | — | Имя волонтера |
|  | last_name | VARCHAR(80) | Нет | — | Фамилия волонтера |
|  UNIQUE | email | VARCHAR(254) | Нет | — | Контактный email |
|  | phone | VARCHAR(30) | Да | — | Телефон |

UNIQUE: `email`.

## news

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → marathons.id | marathon_id | INTEGER | Нет | — | Мероприятие |
| FK → users.id | author_id | INTEGER | Нет | — | Автор новости |
|  | language_code | VARCHAR(5) | Нет | ru | Язык публикации |
|  | title | VARCHAR(200) | Нет | — | Заголовок |
|  | body | TEXT | Нет | — | Текст новости |
|  | published_at | TIMESTAMP WITH TIME ZONE | Да | — | Время публикации; NULL означает черновик |

## races

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → marathons.id | marathon_id | INTEGER | Нет | — | Ежегодное мероприятие |
| FK → distances.id | distance_id | INTEGER | Нет | — | Дистанция |
|  | starts_at | TIMESTAMP WITH TIME ZONE | Нет | — | Дата и время старта с часовым поясом |
|  | capacity | INTEGER | Нет | — | Предельное число участников |

UNIQUE: `marathon_id, distance_id`.

CHECK: `capacity > 0`.

## runners

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → users.id UNIQUE | user_id | INTEGER | Нет | — | Учетная запись бегуна |
|  | first_name | VARCHAR(80) | Нет | — | Имя |
|  | last_name | VARCHAR(80) | Нет | — | Фамилия |
|  | birth_date | DATE | Нет | — | Дата рождения |
|  | country_code | VARCHAR(2) | Нет | — | Код страны ISO 3166-1 alpha-2 |

UNIQUE: `user_id`.

## user_roles

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → users.id | user_id | INTEGER | Нет | — | Пользователь |
| FK → roles.id | role_id | INTEGER | Нет | — | Роль |

UNIQUE: `user_id, role_id`.

## volunteer_assignments

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → volunteers.id | volunteer_id | INTEGER | Нет | — | Волонтер |
| FK → marathons.id | marathon_id | INTEGER | Нет | — | Мероприятие |
|  | duty | VARCHAR(150) | Нет | — | Обязанности |
|  | starts_at | TIMESTAMP WITH TIME ZONE | Нет | — | Начало смены |
|  | ends_at | TIMESTAMP WITH TIME ZONE | Нет | — | Окончание смены |

CHECK: `ends_at > starts_at`.

UNIQUE: `volunteer_id, marathon_id, starts_at`.

## achievements

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → runners.id | runner_id | INTEGER | Нет | — | Бегун |
|  | title | VARCHAR(150) | Нет | — | Название достижения |
|  | description | TEXT | Да | — | Описание достижения |
|  | achieved_on | DATE | Нет | — | Дата достижения |

## registrations

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → runners.id | runner_id | INTEGER | Нет | — | Бегун |
| FK → races.id | race_id | INTEGER | Нет | — | Забег |
|  | bib_number | INTEGER | Нет | — | Нагрудный номер в пределах забега |
|  | status | VARCHAR(20) | Нет | pending | pending, confirmed, cancelled |
|  | registered_at | TIMESTAMP WITH TIME ZONE | Нет | now() | Время регистрации |

CHECK: `status IN ('pending','confirmed','cancelled')`.

UNIQUE: `race_id, bib_number`.

CHECK: `bib_number > 0`.

UNIQUE: `runner_id, race_id`.

## certificates

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → registrations.id UNIQUE | registration_id | INTEGER | Нет | — | Регистрация, для которой выдан сертификат |
|  UNIQUE | number | VARCHAR(60) | Нет | — | Уникальный номер сертификата |
|  | kind | VARCHAR(20) | Нет | — | participation или finish |
|  | issued_at | TIMESTAMP WITH TIME ZONE | Нет | now() | Дата выдачи |
|  | file_path | VARCHAR(500) | Да | — | Путь к файлу сертификата |

UNIQUE: `number`.

UNIQUE: `registration_id`.

CHECK: `kind IN ('participation','finish')`.

## results

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → registrations.id UNIQUE | registration_id | INTEGER | Нет | — | Регистрация участника |
|  | status | VARCHAR(10) | Нет | — | finished, dnf, dns, dsq |
|  | elapsed_seconds | INTEGER | Да | — | Время прохождения в секундах; только finished |

CHECK: `(status = 'finished' AND elapsed_seconds IS NOT NULL AND elapsed_seconds > 0) OR (status IN ('dnf','dns','dsq') AND elapsed_seconds IS NULL)`.

UNIQUE: `registration_id`.

## sponsorships

| Ключ | Поле | Тип | NULL | По умолчанию | Назначение |
|---|---|---|---|---|---|
| PK | id | INTEGER | Нет | IDENTITY/sequence | Первичный ключ |
| FK → sponsors.id | sponsor_id | INTEGER | Нет | — | Спонсор |
| FK → registrations.id | registration_id | INTEGER | Нет | — | Участие конкретного бегуна |
|  | amount | NUMERIC(12, 2) | Нет | — | Сумма спонсорства |
|  | currency | VARCHAR(3) | Нет | RUB | Код валюты ISO 4217 |
|  | terms | TEXT | Нет | — | Условия соглашения |
|  | document_path | VARCHAR(500) | Да | — | Ссылка на документ; файл хранится вне БД |
|  | status | VARCHAR(20) | Нет | pending | pending, confirmed, rejected |
| FK → users.id | confirmed_by_id | INTEGER | Да | — | Координатор, подтвердивший соглашение |
|  | confirmed_at | TIMESTAMP WITH TIME ZONE | Да | — | Время подтверждения |

UNIQUE: `sponsor_id, registration_id`.

CHECK: `status IN ('pending','confirmed','rejected')`.

CHECK: `amount > 0`.

CHECK: `(status = 'confirmed' AND confirmed_by_id IS NOT NULL AND confirmed_at IS NOT NULL) OR (status <> 'confirmed' AND confirmed_by_id IS NULL AND confirmed_at IS NULL)`.