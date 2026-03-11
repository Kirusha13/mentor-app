-- ============================================================
-- АИС управления образовательным процессом частного репетитора
-- Скрипт создания физической модели базы данных (PostgreSQL)
-- ============================================================

-- ------------------------------------------------------------
-- 0. Удаление существующих объектов (для пересоздания схемы)
-- ------------------------------------------------------------

DROP TABLE IF EXISTS assignments    CASCADE;
DROP TABLE IF EXISTS lessons        CASCADE;
DROP TABLE IF EXISTS materials      CASCADE;
DROP TABLE IF EXISTS theory_topics  CASCADE;
DROP TABLE IF EXISTS tutor_student  CASCADE;
DROP TABLE IF EXISTS student_contact CASCADE;
DROP TABLE IF EXISTS subjects       CASCADE;
DROP TABLE IF EXISTS contacts       CASCADE;
DROP TABLE IF EXISTS students       CASCADE;
DROP TABLE IF EXISTS tutors         CASCADE;

DROP TYPE IF EXISTS material_format_enum      CASCADE;
DROP TYPE IF EXISTS material_level_enum       CASCADE;
DROP TYPE IF EXISTS completion_status_enum    CASCADE;
DROP TYPE IF EXISTS payment_status_enum       CASCADE;
DROP TYPE IF EXISTS conduct_status_enum       CASCADE;
DROP TYPE IF EXISTS tutor_student_status_enum CASCADE;
DROP TYPE IF EXISTS relationship_type_enum    CASCADE;

-- ------------------------------------------------------------
-- 1. Пользовательские перечисляемые типы (ENUM)
-- ------------------------------------------------------------

CREATE TYPE relationship_type_enum AS ENUM (
    'parent',       -- Родитель
    'guardian',     -- Опекун
    'other'         -- Иное
);

CREATE TYPE tutor_student_status_enum AS ENUM (
    'active',       -- Активна
    'paused',       -- Приостановлена
    'completed'     -- Завершена
);

CREATE TYPE conduct_status_enum AS ENUM (
    'scheduled',           -- Запланировано
    'conducted',           -- Проведено
    'cancelled',           -- Отменено
    'rescheduled',         -- Перенесено
    'reschedule_pending',  -- Ожидает переноса
    'reschedule_rejected'  -- Перенос отклонён
);

CREATE TYPE payment_status_enum AS ENUM (
    'unpaid',       -- Не оплачено
    'paid'          -- Оплачено
);

CREATE TYPE completion_status_enum AS ENUM (
    'assigned',     -- Назначено
    'in_progress',  -- В работе
    'completed',    -- Выполнено
    'overdue'       -- Просрочено
);

CREATE TYPE material_level_enum AS ENUM (
    'basic',        -- Базовый
    'advanced'      -- Углублённый
);

CREATE TYPE material_format_enum AS ENUM (
    'text',         -- Текст
    'pdf',          -- PDF
    'video',        -- Видео
    'presentation', -- Презентация
    'image',        -- Изображение
    'link'          -- Ссылка
);

-- ------------------------------------------------------------
-- 2. Репетиторы (tutors)
-- ------------------------------------------------------------

CREATE TABLE tutors (
    id                 BIGSERIAL       PRIMARY KEY,
    full_name          VARCHAR(255)    NOT NULL,
    phone_number       VARCHAR(15)     NOT NULL,
    telegram_id        BIGINT          NOT NULL UNIQUE,
    registered_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_visited_at    TIMESTAMPTZ     NULL,
    avatar_url         VARCHAR(255)    NULL,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. Ученики (students)
-- ------------------------------------------------------------

CREATE TABLE students (
    id                 BIGSERIAL       PRIMARY KEY,
    full_name          VARCHAR(255)    NOT NULL,
    grade              SMALLINT        NULL,
    phone_number       VARCHAR(15)     NULL,
    telegram_id        BIGINT          NOT NULL UNIQUE,
    started_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_visited_at    TIMESTAMPTZ     NULL,
    avatar_url         VARCHAR(255)    NULL,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4. Контактные лица (contacts)
-- ------------------------------------------------------------

CREATE TABLE contacts (
    id                 BIGSERIAL       PRIMARY KEY,
    full_name          VARCHAR(255)    NOT NULL,
    phone_number       VARCHAR(15)     NULL,
    telegram_id        BIGINT          NULL,
    added_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contact_communication CHECK (
        phone_number IS NOT NULL OR telegram_id IS NOT NULL
    )
);

-- ------------------------------------------------------------
-- 5. Предметы (subjects)
-- ------------------------------------------------------------

CREATE TABLE subjects (
    id                 BIGSERIAL       PRIMARY KEY,
    name               VARCHAR(255)    NOT NULL,
    invitation_token   VARCHAR(255)    NOT NULL UNIQUE,
    default_rate       DECIMAL(10, 2)  NOT NULL,
    color              VARCHAR(7)      NULL,
    tutor_id           BIGINT          NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. Связь ученик–контактное лицо (student_contact)
-- ------------------------------------------------------------

CREATE TABLE student_contact (
    id                  BIGSERIAL               PRIMARY KEY,
    relationship_type   relationship_type_enum  NOT NULL,
    student_id          BIGINT                  NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
    contact_id          BIGINT                  NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
    UNIQUE (student_id, contact_id)
);

-- ------------------------------------------------------------
-- 7. Связь репетитор–ученик (tutor_student)
-- ------------------------------------------------------------

CREATE TABLE tutor_student (
    id                    BIGSERIAL                   PRIMARY KEY,
    status                tutor_student_status_enum   NOT NULL DEFAULT 'active',
    hourly_rate           DECIMAL(10, 2)              NOT NULL,
    rate_set_at           TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    started_at            DATE                        NOT NULL,
    subscription_lessons  INTEGER                     NULL,
    used_lessons          INTEGER                     NULL DEFAULT 0,
    tutor_id              BIGINT                      NOT NULL REFERENCES tutors(id)   ON DELETE RESTRICT,
    student_id            BIGINT                      NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    subject_id            BIGINT                      NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 9. Темы теории (theory_topics)
-- ------------------------------------------------------------

CREATE TABLE theory_topics (
    id                 BIGSERIAL       PRIMARY KEY,
    title              VARCHAR(255)    NOT NULL,
    description        TEXT            NULL,
    study_level        JSONB           NULL,     -- напр.: ["ОГЭ", "9 класс"]
    tutor_id           BIGINT          NOT NULL REFERENCES tutors(id)         ON DELETE CASCADE,
    subject_id         BIGINT          NOT NULL REFERENCES subjects(id)       ON DELETE RESTRICT,
    parent_topic_id    BIGINT          NULL     REFERENCES theory_topics(id)  ON DELETE SET NULL,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 10. Материалы (materials)
-- ------------------------------------------------------------

CREATE TABLE materials (
    id                 BIGSERIAL               PRIMARY KEY,
    content_text       TEXT                    NULL,
    content_url        VARCHAR(500)            NULL,
    level              material_level_enum     NOT NULL,
    format             material_format_enum    NOT NULL,
    topic_id           BIGINT                  NOT NULL REFERENCES theory_topics(id) ON DELETE RESTRICT,
    tutor_id           BIGINT                  NOT NULL REFERENCES tutors(id)        ON DELETE CASCADE,
    created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_material_content CHECK (
        (content_text IS NOT NULL AND content_url IS NULL)
        OR
        (content_text IS NULL AND content_url IS NOT NULL)
    )
);

-- ------------------------------------------------------------
-- 11. Занятия (lessons)
-- ------------------------------------------------------------

CREATE TABLE lessons (
    id                  BIGSERIAL           PRIMARY KEY,
    lesson_date         DATE                NOT NULL,
    start_time          TIME                NOT NULL,
    end_time            TIME                NOT NULL,
    conduct_status      conduct_status_enum NOT NULL DEFAULT 'scheduled',
    payment_status      payment_status_enum NOT NULL DEFAULT 'unpaid',
    cost                DECIMAL(10, 2)      NULL,
    grade               SMALLINT            NULL,
    tutor_student_id    BIGINT              NULL     REFERENCES tutor_student(id)   ON DELETE RESTRICT,
    tutor_id            BIGINT              NULL     REFERENCES tutors(id)          ON DELETE CASCADE,
    topic_id            BIGINT              NULL     REFERENCES theory_topics(id)   ON DELETE SET NULL,
    original_lesson_id  BIGINT              NULL     REFERENCES lessons(id)         ON DELETE SET NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lesson_time CHECK (end_time > start_time),
    CONSTRAINT chk_lesson_owner CHECK (
        (tutor_student_id IS NOT NULL AND tutor_id IS NULL) OR
        (tutor_student_id IS NULL AND tutor_id IS NOT NULL)
    )
);

-- ------------------------------------------------------------
-- 12. Домашние задания (assignments)
-- ------------------------------------------------------------

CREATE TABLE assignments (
    id                  BIGSERIAL               PRIMARY KEY,
    description         TEXT                    NOT NULL,
    title               VARCHAR(255)            NULL,
    deadline            TIMESTAMPTZ             NOT NULL,
    completion_status   completion_status_enum  NOT NULL DEFAULT 'assigned',
    grade               SMALLINT                NULL,
    attachments         JSONB                   NULL,
    tutor_student_id    BIGINT                  NOT NULL REFERENCES tutor_student(id) ON DELETE RESTRICT,
    topic_id            BIGINT                  NULL     REFERENCES theory_topics(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 13. Индексы
-- ------------------------------------------------------------

-- tutors
CREATE INDEX idx_tutors_telegram_id       ON tutors(telegram_id);

-- students
CREATE INDEX idx_students_telegram_id     ON students(telegram_id);

-- student_contact
CREATE INDEX idx_student_contact_student  ON student_contact(student_id);
CREATE INDEX idx_student_contact_contact  ON student_contact(contact_id);

-- subjects
CREATE INDEX idx_subjects_tutor           ON subjects(tutor_id);
CREATE INDEX idx_subjects_invitation_token ON subjects(invitation_token);

-- tutor_student
CREATE INDEX idx_tutor_student_tutor      ON tutor_student(tutor_id);
CREATE INDEX idx_tutor_student_student    ON tutor_student(student_id);
CREATE INDEX idx_tutor_student_subject    ON tutor_student(subject_id);

-- theory_topics
CREATE INDEX idx_theory_topics_tutor      ON theory_topics(tutor_id);
CREATE INDEX idx_theory_topics_subject    ON theory_topics(subject_id);
CREATE INDEX idx_theory_topics_parent     ON theory_topics(parent_topic_id);

-- materials
CREATE INDEX idx_materials_topic          ON materials(topic_id);
CREATE INDEX idx_materials_tutor          ON materials(tutor_id);
CREATE INDEX idx_materials_level          ON materials(level);
CREATE INDEX idx_materials_format         ON materials(format);

-- lessons
CREATE INDEX idx_lessons_tutor_student    ON lessons(tutor_student_id);
CREATE INDEX idx_lessons_tutor            ON lessons(tutor_id);
CREATE INDEX idx_lessons_topic            ON lessons(topic_id);
CREATE INDEX idx_lessons_date             ON lessons(lesson_date);
CREATE INDEX idx_lessons_conduct_status   ON lessons(conduct_status);
CREATE INDEX idx_lessons_original         ON lessons(original_lesson_id);

-- assignments
CREATE INDEX idx_assignments_tutor_student ON assignments(tutor_student_id);
CREATE INDEX idx_assignments_topic         ON assignments(topic_id);
CREATE INDEX idx_assignments_deadline      ON assignments(deadline);
CREATE INDEX idx_assignments_status        ON assignments(completion_status);
